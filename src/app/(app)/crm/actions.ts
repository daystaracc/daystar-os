'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { CRM_FLOW_KEY, CRM_FLOW_CHANNEL, CRM_FLOW_STATUS, type ActionResult } from '@/lib/crm/constants';

// Every mutation returns an ActionResult instead of throwing — same pattern as every
// other screen this session (see app/(app)/tasks/actions.ts for the original).
const ok = <T,>(data: T): ActionResult<T> => ({ ok: true, data });
const fail = (error: 'forbidden' | 'invalid' | 'failed'): ActionResult<never> => ({ ok: false, error });

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const emptyToNull = <T extends z.ZodTypeAny>(s: T) =>
  z.preprocess(v => (v === '' || v === undefined ? null : v), s.nullable());

/**
 * Bakes founder-only directly into `ctx()` — the whole CRM screen is gated by
 * `can.viewCRM` (founder-only, matching `customers_all` RLS and the spec's own
 * permission matrix), not just some of its actions. `crm_flows`/`crm_metrics_monthly`
 * writes would technically also work for a manager under their own RLS
 * (manager-or-above), but a manager can never reach these actions through the UI
 * at all, so refusing here too keeps the app-level rule and the page gate in
 * agreement instead of one being quietly more permissive than the other.
 */
async function ctx() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data: m } = await sb.from('memberships').select('organization_id, role').eq('profile_id', user.id).eq('status', 'active').limit(1).single();
  if (!m) return null;
  if (m.role !== 'founder') return null;
  return { sb, user, orgId: m.organization_id };
}

function refresh() {
  revalidatePath('/crm');
}

// ---------------------------------------------------------------------------
// CRM flows
// ---------------------------------------------------------------------------

const createFlowSchema = z.object({
  key: z.enum(CRM_FLOW_KEY),
  name: z.string().trim().min(1).max(200),
  channel: z.enum(CRM_FLOW_CHANNEL),
  status: z.enum(CRM_FLOW_STATUS),
  audience: emptyToNull(z.string().max(200)),
  owner_id: emptyToNull(uuid),
  notes: emptyToNull(z.string().max(2000)),
  messages_count: z.coerce.number().int().min(0).max(1_000_000).default(0),
  sends: z.coerce.number().int().min(0).max(10_000_000).default(0),
  conversions: z.coerce.number().int().min(0).max(10_000_000).default(0),
  revenue: z.coerce.number().min(0).max(1_000_000_000).default(0),
});

/** `key` identifies the flow (one of the spec's 12 fixed automations) and can only be set on create — see the scope note in lib/data/crm.ts for why create exists at all here, unlike Company Health's edit-only systems. */
export async function createCrmFlow(raw: unknown): Promise<ActionResult<string>> {
  const parsed = createFlowSchema.safeParse(raw);
  if (!parsed.success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');

  const { data, error } = await c.sb.from('crm_flows')
    .insert({ ...parsed.data, organization_id: c.orgId, last_updated_at: new Date().toISOString() }).select('id').single();
  // 23505: unique (organization_id, key) — this org already has a flow for that key.
  if (error || !data) return fail(error?.code === '23505' ? 'invalid' : 'failed');
  refresh();
  return ok(data.id);
}

const updateFlowSchema = createFlowSchema.omit({ key: true });

export async function updateCrmFlow(id: string, raw: unknown): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail('invalid');
  const parsed = updateFlowSchema.safeParse(raw);
  if (!parsed.success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');

  const { data, error } = await c.sb.from('crm_flows')
    .update({ ...parsed.data, last_updated_at: new Date().toISOString() }).eq('id', id).select('id');
  if (error) return fail('failed');
  if (!data?.length) return fail('forbidden'); // RLS matched no row
  refresh();
  return ok(undefined);
}

export async function deleteCrmFlow(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');

  const { data, error } = await c.sb.from('crm_flows').delete().eq('id', id).select('id');
  if (error) return fail('failed');
  if (!data?.length) return fail('forbidden');
  refresh();
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Monthly CRM metrics — one row per month, saving REPLACES it (upsert on
// `unique(organization_id, month)`), same idiom as `upsertRevenue`/`upsertAdSpend`.
// ---------------------------------------------------------------------------

const monthlyMetricSchema = z.object({
  month: isoDate,
  customers: z.coerce.number().int().min(0).max(10_000_000).default(0),
  newCustomers: z.coerce.number().int().min(0).max(10_000_000).default(0),
  returningCustomers: z.coerce.number().int().min(0).max(10_000_000).default(0),
  repeatRate: emptyToNull(z.coerce.number().min(0).max(100)),
  repeatRevenue: z.coerce.number().min(0).max(1_000_000_000).default(0),
  retentionRevenue: z.coerce.number().min(0).max(1_000_000_000).default(0),
  avgOrders: emptyToNull(z.coerce.number().min(0).max(1_000)),
  ltv: emptyToNull(z.coerce.number().min(0).max(1_000_000_000)),
});

export async function upsertMonthlyMetric(raw: unknown): Promise<ActionResult<string>> {
  const parsed = monthlyMetricSchema.safeParse(raw);
  if (!parsed.success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');

  const { newCustomers, returningCustomers, repeatRate, repeatRevenue, retentionRevenue, avgOrders, ...rest } = parsed.data;
  const { data, error } = await c.sb.from('crm_metrics_monthly')
    .upsert({
      ...rest, organization_id: c.orgId,
      new_customers: newCustomers, returning_customers: returningCustomers, repeat_rate: repeatRate,
      repeat_revenue: repeatRevenue, retention_revenue: retentionRevenue, avg_orders: avgOrders,
    }, { onConflict: 'organization_id,month' }).select('id').single();
  if (error || !data) return fail('failed');
  refresh();
  return ok(data.id);
}

export async function deleteMonthlyMetric(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');

  const { data, error } = await c.sb.from('crm_metrics_monthly').delete().eq('id', id).select('id');
  if (error) return fail('failed');
  if (!data?.length) return fail('forbidden');
  refresh();
  return ok(undefined);
}
