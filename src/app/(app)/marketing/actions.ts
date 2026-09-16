'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { CAMPAIGN_STATUS, AD_PLATFORM, CREATOR_PLATFORM, CREATOR_STATUS, type ActionResult } from '@/lib/marketing/constants';

// Every mutation returns an ActionResult instead of throwing — same pattern as every
// other screen this session (see app/(app)/tasks/actions.ts for the original).
const ok = <T,>(data: T): ActionResult<T> => ({ ok: true, data });
const fail = (error: 'forbidden' | 'invalid' | 'failed'): ActionResult<never> => ({ ok: false, error });

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const emptyToNull = <T extends z.ZodTypeAny>(s: T) =>
  z.preprocess(v => (v === '' || v === undefined ? null : v), s.nullable());

/**
 * Bakes the founder/manager-only gate directly into `ctx()`, the same shape as
 * `app/(app)/revenue/actions.ts` — the whole Marketing screen is gated by
 * `can.viewMarketing`, not just some of its actions, so a member's request is
 * refused here before it ever reaches Supabase (and would be refused there too:
 * `campaigns_insert`/`creators_insert` need manager-or-above, `ad_spend_daily_write`
 * needs it for every operation including select).
 */
async function ctx() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data: m } = await sb.from('memberships').select('organization_id, role').eq('profile_id', user.id).eq('status', 'active').limit(1).single();
  if (!m) return null;
  if (m.role !== 'founder' && m.role !== 'manager') return null;
  return { sb, user, orgId: m.organization_id, role: m.role as 'founder' | 'manager' };
}

function refresh(path?: string) {
  revalidatePath('/marketing');
  if (path) revalidatePath(path);
}

// ---------------------------------------------------------------------------
// Campaigns — `campaigns_insert/update` RLS: manager-or-above. `campaigns_delete`: founder-only.
// ---------------------------------------------------------------------------

const campaignSchema = z.object({
  name: z.string().trim().min(1).max(200),
  objective: emptyToNull(z.string().max(200)),
  status: z.enum(CAMPAIGN_STATUS),
  start_date: emptyToNull(isoDate),
  end_date: emptyToNull(isoDate),
  budget: emptyToNull(z.coerce.number().min(0).max(1_000_000_000)),
  offer: emptyToNull(z.string().max(500)),
  notes: emptyToNull(z.string().max(2000)),
});

export async function createCampaign(raw: unknown): Promise<ActionResult<string>> {
  const parsed = campaignSchema.safeParse(raw);
  if (!parsed.success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');

  const { data, error } = await c.sb.from('campaigns').insert({ ...parsed.data, organization_id: c.orgId, created_by: c.user.id }).select('id').single();
  if (error || !data) return fail('failed');
  refresh();
  return ok(data.id);
}

export async function updateCampaign(id: string, raw: unknown): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail('invalid');
  const parsed = campaignSchema.safeParse(raw);
  if (!parsed.success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');

  const { data, error } = await c.sb.from('campaigns').update(parsed.data).eq('id', id).select('id');
  if (error) return fail('failed');
  if (!data?.length) return fail('forbidden'); // RLS matched no row
  refresh(`/marketing/campaigns/${id}`);
  return ok(undefined);
}

export async function deleteCampaign(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');
  if (c.role !== 'founder') return fail('forbidden');

  const { data, error } = await c.sb.from('campaigns').delete().eq('id', id).select('id');
  if (error) return fail('failed');
  if (!data?.length) return fail('forbidden');
  refresh();
  return ok(undefined);
}

const campaignMetricSchema = z.object({
  campaignId: uuid,
  date: isoDate,
  revenue: z.coerce.number().min(0).max(1_000_000_000).default(0),
  orders: z.coerce.number().int().min(0).max(1_000_000).default(0),
  spend: z.coerce.number().min(0).max(1_000_000_000).default(0),
});

/** One row per campaign per day — saving REPLACES that day's figures (upsert on `unique(campaign_id, date)`), same "manual entry behaves like a future import" idiom as `upsertRevenue`. */
export async function addCampaignMetric(raw: unknown): Promise<ActionResult<string>> {
  const parsed = campaignMetricSchema.safeParse(raw);
  if (!parsed.success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');

  const { campaignId, ...fields } = parsed.data;
  const { data, error } = await c.sb.from('campaign_metrics')
    .upsert({ campaign_id: campaignId, ...fields }, { onConflict: 'campaign_id,date' }).select('id').single();
  if (error || !data) return fail('failed');
  refresh(`/marketing/campaigns/${campaignId}`);
  return ok(data.id);
}

export async function deleteCampaignMetric(id: string, campaignId: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success || !uuid.safeParse(campaignId).success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');

  const { data, error } = await c.sb.from('campaign_metrics').delete().eq('id', id).select('id');
  if (error) return fail('failed');
  if (!data?.length) return fail('forbidden');
  refresh(`/marketing/campaigns/${campaignId}`);
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Ad spend — `ad_spend_daily_write` RLS: manager-or-above for every operation.
// ---------------------------------------------------------------------------

const adSpendSchema = z.object({
  date: isoDate,
  platform: z.enum(AD_PLATFORM),
  spend: z.coerce.number().min(0).max(1_000_000_000).default(0),
  revenue: z.coerce.number().min(0).max(1_000_000_000).default(0),
  impressions: z.coerce.number().int().min(0).max(1_000_000_000).default(0),
  clicks: z.coerce.number().int().min(0).max(100_000_000).default(0),
  purchases: z.coerce.number().int().min(0).max(10_000_000).default(0),
});

/** One row per platform per day — saving REPLACES that platform's day (upsert on `unique(organization_id, date, platform)`), exactly like `upsertRevenue`. */
export async function upsertAdSpend(raw: unknown): Promise<ActionResult<string>> {
  const parsed = adSpendSchema.safeParse(raw);
  if (!parsed.success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');

  const { data, error } = await c.sb.from('ad_spend_daily')
    .upsert({ ...parsed.data, organization_id: c.orgId, created_by: c.user.id }, { onConflict: 'organization_id,date,platform' }).select('id').single();
  if (error || !data) return fail('failed');
  refresh();
  return ok(data.id);
}

export async function deleteAdSpend(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');

  const { data, error } = await c.sb.from('ad_spend_daily').delete().eq('id', id).select('id');
  if (error) return fail('failed');
  if (!data?.length) return fail('forbidden');
  refresh();
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Creators — `creators_insert/update` RLS: manager-or-above. `creators_delete`: founder-only.
// ---------------------------------------------------------------------------

const creatorSchema = z.object({
  name: z.string().trim().min(1).max(200),
  handle: emptyToNull(z.string().max(100)),
  platform: z.enum(CREATOR_PLATFORM),
  followers: emptyToNull(z.coerce.number().int().min(0).max(1_000_000_000)),
  market: z.string().trim().min(1).max(50).default('TW'),
  category: emptyToNull(z.string().max(100)),
  status: z.enum(CREATOR_STATUS),
  cost: emptyToNull(z.coerce.number().min(0).max(1_000_000_000)),
  owner_id: emptyToNull(uuid),
  contact: emptyToNull(z.string().max(200)),
  notes: emptyToNull(z.string().max(2000)),
});

export async function createCreator(raw: unknown): Promise<ActionResult<string>> {
  const parsed = creatorSchema.safeParse(raw);
  if (!parsed.success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');

  const { data, error } = await c.sb.from('creators').insert({ ...parsed.data, organization_id: c.orgId }).select('id').single();
  if (error || !data) return fail('failed');
  refresh();
  return ok(data.id);
}

export async function updateCreator(id: string, raw: unknown): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail('invalid');
  const parsed = creatorSchema.safeParse(raw);
  if (!parsed.success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');

  const { data, error } = await c.sb.from('creators').update(parsed.data).eq('id', id).select('id');
  if (error) return fail('failed');
  if (!data?.length) return fail('forbidden');
  refresh(`/marketing/creators/${id}`);
  return ok(undefined);
}

export async function deleteCreator(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');
  if (c.role !== 'founder') return fail('forbidden');

  const { data, error } = await c.sb.from('creators').delete().eq('id', id).select('id');
  if (error) return fail('failed');
  if (!data?.length) return fail('forbidden');
  refresh();
  return ok(undefined);
}

const creatorContentSchema = z.object({
  creatorId: uuid,
  productsSent: emptyToNull(z.string().max(500)),
  url: emptyToNull(z.string().url().max(500)),
  publishedAt: emptyToNull(isoDate),
  views: z.coerce.number().int().min(0).max(1_000_000_000).default(0),
  clicks: z.coerce.number().int().min(0).max(100_000_000).default(0),
  sales: z.coerce.number().min(0).max(1_000_000_000).default(0),
  cost: z.coerce.number().min(0).max(1_000_000_000).default(0),
  note: emptyToNull(z.string().max(500)),
});

export async function addCreatorContent(raw: unknown): Promise<ActionResult<string>> {
  const parsed = creatorContentSchema.safeParse(raw);
  if (!parsed.success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');

  const { creatorId, productsSent, publishedAt, ...rest } = parsed.data;
  const { data, error } = await c.sb.from('creator_content')
    .insert({ creator_id: creatorId, products_sent: productsSent, published_at: publishedAt, ...rest }).select('id').single();
  if (error || !data) return fail('failed');
  refresh(`/marketing/creators/${creatorId}`);
  return ok(data.id);
}

export async function deleteCreatorContent(id: string, creatorId: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success || !uuid.safeParse(creatorId).success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');

  const { data, error } = await c.sb.from('creator_content').delete().eq('id', id).select('id');
  if (error) return fail('failed');
  if (!data?.length) return fail('forbidden');
  refresh(`/marketing/creators/${creatorId}`);
  return ok(undefined);
}
