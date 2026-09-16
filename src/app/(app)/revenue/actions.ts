'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { CHANNEL_KEYS, type ActionResult } from '@/lib/revenue/constants';

// Every mutation returns an ActionResult instead of throwing — same pattern as
// app/(app)/tasks/actions.ts. `forbidden` is what an RLS rejection looks like: a
// member somehow reaching this action updates zero rows rather than erroring.
const ok = <T,>(data: T): ActionResult<T> => ({ ok: true, data });
const fail = (error: 'forbidden' | 'invalid' | 'failed'): ActionResult<never> => ({ ok: false, error });

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const emptyToNull = <T extends z.ZodTypeAny>(s: T) =>
  z.preprocess(v => (v === '' || v === undefined ? null : v), s.nullable());

const entrySchema = z.object({
  date: isoDate,
  channelKey: z.enum(CHANNEL_KEYS),
  orders: z.coerce.number().int().min(0).max(1_000_000),
  gross_revenue: z.coerce.number().min(0).max(1_000_000_000),
  refunds: z.coerce.number().min(0).max(1_000_000_000).default(0),
  platform_fees: z.coerce.number().min(0).max(1_000_000_000).default(0),
  sessions: emptyToNull(z.coerce.number().int().min(0).max(10_000_000)),
  notes: emptyToNull(z.string().max(2000)),
});

function refresh() {
  revalidatePath('/revenue');
  revalidatePath('/overview');
}

async function ctx() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data: m } = await sb.from('memberships').select('organization_id, role').eq('profile_id', user.id).eq('status', 'active').limit(1).single();
  if (!m) return null;
  // Mirrors `can.viewRevenue` (lib/permissions.ts) and the `sales_daily_write` RLS
  // policy (manager-or-above) — a member's request is refused here before it ever
  // reaches Supabase, and would be refused there too if it somehow did.
  if (m.role !== 'founder' && m.role !== 'manager') return null;
  return { sb, user, orgId: m.organization_id, role: m.role as 'founder' | 'manager' };
}

/**
 * Manual revenue entry (the Add/Edit drawer). One row per channel per day —
 * saving REPLACES that channel's existing figure for the date (upsert on the
 * table's own `unique(organization_id, date, channel_id)`), it never adds to
 * whatever is already there. This is deliberate: it's the same shape a future
 * daily Showmore/Shopee re-import will write, so a manual correction and an
 * imported row behave identically and neither can silently double-count.
 */
export async function upsertRevenue(raw: unknown): Promise<ActionResult<string>> {
  const parsed = entrySchema.safeParse(raw);
  if (!parsed.success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');

  // sales_channels rows are seeded per organization (founder-only to create, per
  // `sales_channels_write` RLS) — this looks the id up rather than assuming one exists.
  const { data: channel, error: chErr } = await c.sb.from('sales_channels').select('id')
    .eq('organization_id', c.orgId).eq('key', parsed.data.channelKey).maybeSingle();
  if (chErr) return fail('failed');
  if (!channel) return fail('invalid');

  const { channelKey: _channelKey, ...fields } = parsed.data;
  const { data, error } = await c.sb.from('sales_daily')
    .upsert({ ...fields, organization_id: c.orgId, channel_id: channel.id, created_by: c.user.id },
      { onConflict: 'organization_id,date,channel_id' })
    .select('id').single();
  if (error || !data) return fail(error?.code === '42501' ? 'forbidden' : 'failed');
  refresh();
  return ok(data.id);
}

export async function deleteRevenue(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');
  const { data, error } = await c.sb.from('sales_daily').delete().eq('id', id).select('id');
  if (error) return fail('failed');
  if (!data?.length) return fail('forbidden'); // RLS matched no row
  refresh();
  return ok(undefined);
}
