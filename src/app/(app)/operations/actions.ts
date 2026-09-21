'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { CS_CHANNEL, CS_ISSUE_TYPE, CS_STATUS, type ActionResult } from '@/lib/operations/constants';

const ok = <T,>(data: T): ActionResult<T> => ({ ok: true, data });
const fail = (error: 'forbidden' | 'invalid' | 'failed'): ActionResult<never> => ({ ok: false, error });

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const isoTime = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/);
const emptyToNull = <T extends z.ZodTypeAny>(s: T) =>
  z.preprocess(v => (v === '' || v === undefined ? null : v), s.nullable());

/**
 * `operations_daily`/`customer_service_cases` RLS (generic loop, migration 0002):
 * select = any active member, insert/update = manager-or-above, delete = founder-only.
 * Same shape as Goals/Projects/Campaigns — see the file-level note in
 * lib/operations/constants.ts. `ctx()` returns the role so each mutation can apply
 * the right gate itself, same pattern as goals/actions.ts.
 */
async function ctx() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data: m } = await sb.from('memberships').select('organization_id, role').eq('profile_id', user.id).eq('status', 'active').limit(1).single();
  if (!m) return null;
  return { sb, user, orgId: m.organization_id, role: m.role as 'founder' | 'manager' | 'member' };
}

function canManage(role: string) { return role === 'founder' || role === 'manager'; }

function refresh() {
  revalidatePath('/operations');
  revalidatePath('/overview');
}

// ---------------------------------------------------------------------------
// Daily log — one row per day, saving REPLACES it (upsert on
// `unique(organization_id, date)`), same idiom as Finance's monthly P&L.
// ---------------------------------------------------------------------------

const operationsDailySchema = z.object({
  date: isoDate,
  ordersWaiting: z.coerce.number().int().min(0).max(1_000_000).default(0),
  ordersShipped: z.coerce.number().int().min(0).max(1_000_000).default(0),
  fulfillmentStartedAt: emptyToNull(isoTime),
  fulfillmentCompletedAt: emptyToNull(isoTime),
  fulfillmentMinutes: emptyToNull(z.coerce.number().int().min(0).max(100_000)),
  errors: z.coerce.number().int().min(0).max(1_000_000).default(0),
  returns: z.coerce.number().int().min(0).max(1_000_000).default(0),
  csPending: z.coerce.number().int().min(0).max(1_000_000).default(0),
  csAvgResponseMinutes: emptyToNull(z.coerce.number().int().min(0).max(100_000)),
  employeeId: emptyToNull(uuid),
  notes: emptyToNull(z.string().max(2000)),
});

export async function upsertOperationsDaily(raw: unknown): Promise<ActionResult<string>> {
  const parsed = operationsDailySchema.safeParse(raw);
  if (!parsed.success) return fail('invalid');
  const c = await ctx();
  if (!c || !canManage(c.role)) return fail('forbidden');

  const { ordersWaiting, ordersShipped, fulfillmentStartedAt, fulfillmentCompletedAt, fulfillmentMinutes, csPending, csAvgResponseMinutes, employeeId, ...rest } = parsed.data;
  const { data, error } = await c.sb.from('operations_daily')
    .upsert({
      ...rest, organization_id: c.orgId, created_by: c.user.id,
      orders_waiting: ordersWaiting, orders_shipped: ordersShipped,
      fulfillment_started_at: fulfillmentStartedAt, fulfillment_completed_at: fulfillmentCompletedAt, fulfillment_minutes: fulfillmentMinutes,
      cs_pending: csPending, cs_avg_response_minutes: csAvgResponseMinutes, employee_id: employeeId,
    }, { onConflict: 'organization_id,date' }).select('id').single();
  if (error || !data) return fail('failed');
  refresh();
  return ok(data.id);
}

export async function deleteOperationsDaily(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail('invalid');
  const c = await ctx();
  if (!c || c.role !== 'founder') return fail('forbidden');

  const { data, error } = await c.sb.from('operations_daily').delete().eq('id', id).select('id');
  if (error) return fail('failed');
  if (!data?.length) return fail('forbidden');
  refresh();
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// CS cases — a real CRUD entity (more than one case can be open at once).
// ---------------------------------------------------------------------------

const createCsCaseSchema = z.object({
  customerName: emptyToNull(z.string().max(200)),
  orderRef: emptyToNull(z.string().max(100)),
  channel: z.enum(CS_CHANNEL).default('line'),
  issueType: z.enum(CS_ISSUE_TYPE),
  status: z.enum(CS_STATUS).default('open'),
  ownerId: emptyToNull(uuid),
  resolution: emptyToNull(z.string().max(2000)),
  notes: emptyToNull(z.string().max(2000)),
});
const updateCsCaseSchema = z.object({
  customerName: emptyToNull(z.string().max(200)).optional(),
  orderRef: emptyToNull(z.string().max(100)).optional(),
  channel: z.enum(CS_CHANNEL).optional(),
  issueType: z.enum(CS_ISSUE_TYPE).optional(),
  status: z.enum(CS_STATUS).optional(),
  ownerId: emptyToNull(uuid).optional(),
  resolution: emptyToNull(z.string().max(2000)).optional(),
  notes: emptyToNull(z.string().max(2000)).optional(),
});

export async function createCsCase(raw: unknown): Promise<ActionResult<string>> {
  const parsed = createCsCaseSchema.safeParse(raw);
  if (!parsed.success) return fail('invalid');
  const c = await ctx();
  if (!c || !canManage(c.role)) return fail('forbidden');

  const { customerName, orderRef, ownerId, ...rest } = parsed.data;
  const { data, error } = await c.sb.from('customer_service_cases')
    .insert({ ...rest, organization_id: c.orgId, customer_name: customerName, order_ref: orderRef, owner_id: ownerId }).select('id').single();
  if (error || !data) return fail('failed');
  refresh();
  return ok(data.id);
}

/**
 * Status transitions go through this same update, not a separate action:
 * moving to `resolved` stamps `resolved_at` here rather than asking the client
 * to send its own timestamp (which would trust the browser's clock).
 */
export async function updateCsCase(id: string, raw: unknown): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail('invalid');
  const parsed = updateCsCaseSchema.safeParse(raw);
  if (!parsed.success) return fail('invalid');
  const c = await ctx();
  if (!c || !canManage(c.role)) return fail('forbidden');

  const { customerName, orderRef, ownerId, status, ...rest } = parsed.data;
  const patch: Record<string, unknown> = { ...rest };
  if (customerName !== undefined) patch.customer_name = customerName;
  if (orderRef !== undefined) patch.order_ref = orderRef;
  if (ownerId !== undefined) patch.owner_id = ownerId;
  if (status !== undefined) {
    patch.status = status;
    patch.resolved_at = status === 'resolved' || status === 'closed' ? new Date().toISOString() : null;
  }

  const { data, error } = await c.sb.from('customer_service_cases').update(patch).eq('id', id).select('id');
  if (error) return fail('failed');
  if (!data?.length) return fail('forbidden');
  refresh();
  return ok(undefined);
}

export async function deleteCsCase(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail('invalid');
  const c = await ctx();
  if (!c || c.role !== 'founder') return fail('forbidden');

  const { data, error } = await c.sb.from('customer_service_cases').delete().eq('id', id).select('id');
  if (error) return fail('failed');
  if (!data?.length) return fail('forbidden');
  refresh();
  return ok(undefined);
}
