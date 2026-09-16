import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { shiftDays } from '@/lib/calculations/pacing';
import { adMetrics } from '@/lib/calculations/finance';
import type { CampaignStatus, AdPlatform, CreatorPlatform, CreatorStatus } from '@/lib/marketing/constants';

/**
 * MARKETING (spec §08) — "Is paid / creator spend working?"
 *
 * Three sub-areas share this one screen (Campaigns, Ad spend, Creators) rather than
 * three separate nav items, matching the spec's single "08 Marketing" row (§03 shows
 * one permission row, not three) and keeping the sidebar the same shape it already
 * is. `campaigns` and `creators` are in the generic per-table RLS loop (select = any
 * active member, insert/update = manager-or-above, delete = founder-only, same as
 * Products/Goals/Projects/SOPs) — but `ad_spend_daily` requires manager-or-above for
 * *every* operation including select, and `campaign_metrics`/`creator_content` are
 * only reachable through their manager+ parent. A member could therefore open this
 * screen and see campaign/creator names with no spend or performance numbers at
 * all — so, like Revenue and Reviews, the page itself is gated to founder/manager
 * via `can.viewMarketing` (lib/permissions.ts) rather than shipping that half-empty
 * view. See `app/(app)/marketing/actions.ts` for the write-side mirror of this.
 *
 * Deliberately out of scope this pass: linking a campaign to a `project_id` (the
 * column exists and is nullable; no picker was built for it — Projects already has
 * its own screen, and this isn't the primary "is spend working" question) and
 * linking `creator_content.content_id` to a specific Content OS entry (same
 * reasoning — `products_sent` and `url` are free text and cover today's need
 * without a content picker). Both are reasonable follow-ups.
 */

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

export interface CampaignRow {
  id: string;
  name: string;
  objective: string | null;
  status: CampaignStatus;
  startDate: string | null;
  endDate: string | null;
  budget: number | null;
  revenue: number;
  orders: number;
  spend: number;
  /** null when spend is 0 — "no spend yet" is not the same as "0x return". */
  roas: number | null;
}

export interface CampaignMetricRow { id: string; date: string; revenue: number; orders: number; spend: number }

export interface CampaignDetail extends CampaignRow {
  offer: string | null;
  notes: string | null;
  metrics: CampaignMetricRow[];
}

export interface CampaignsPage { campaigns: CampaignRow[]; error: boolean }

// Two independent literal strings, neither built from the other with `+` or
// interpolation — see tasks.ts's SELECT/DETAIL_SELECT note.
const CAMPAIGN_SELECT = 'id, name, objective, status, start_date, end_date, budget';
const CAMPAIGN_DETAIL_SELECT = 'id, name, objective, status, start_date, end_date, budget, offer, notes';

function rollup(rows: { revenue: number; orders: number; spend: number }[]) {
  return rows.reduce((a, r) => ({ revenue: a.revenue + Number(r.revenue), orders: a.orders + Number(r.orders), spend: a.spend + Number(r.spend) }),
    { revenue: 0, orders: 0, spend: 0 });
}
const safeRoas = (revenue: number, spend: number) => (spend > 0 ? revenue / spend : null);

export async function getCampaignsPage(orgId: string): Promise<CampaignsPage> {
  const sb = await createClient();
  const { data: campaigns, error } = await sb.from('campaigns').select(CAMPAIGN_SELECT).eq('organization_id', orgId).order('start_date', { ascending: false });
  if (error) return { campaigns: [], error: true };

  const ids = (campaigns ?? []).map(c => c.id);
  const { data: metricsRows } = ids.length
    ? await sb.from('campaign_metrics').select('campaign_id, revenue, orders, spend').in('campaign_id', ids)
    : { data: [] as { campaign_id: string; revenue: number; orders: number; spend: number }[] };

  const byCampaign = new Map<string, { revenue: number; orders: number; spend: number }[]>();
  for (const m of metricsRows ?? []) byCampaign.set(m.campaign_id, [...(byCampaign.get(m.campaign_id) ?? []), m]);

  const rows: CampaignRow[] = (campaigns ?? []).map(c => {
    const totals = rollup(byCampaign.get(c.id) ?? []);
    return {
      id: c.id, name: c.name, objective: c.objective, status: c.status as CampaignStatus,
      startDate: c.start_date, endDate: c.end_date, budget: c.budget,
      revenue: totals.revenue, orders: totals.orders, spend: totals.spend, roas: safeRoas(totals.revenue, totals.spend),
    };
  });
  return { campaigns: rows, error: false };
}

export async function getCampaignDetail(orgId: string, campaignId: string): Promise<CampaignDetail | null> {
  const sb = await createClient();
  const { data: c } = await sb.from('campaigns').select(CAMPAIGN_DETAIL_SELECT).eq('organization_id', orgId).eq('id', campaignId).maybeSingle();
  if (!c) return null;

  const { data: metricsData } = await sb.from('campaign_metrics').select('id, date, revenue, orders, spend').eq('campaign_id', campaignId).order('date', { ascending: false });
  const metrics: CampaignMetricRow[] = (metricsData ?? []).map(m => ({ id: m.id, date: m.date, revenue: Number(m.revenue), orders: m.orders, spend: Number(m.spend) }));
  const totals = rollup(metrics);

  return {
    id: c.id, name: c.name, objective: c.objective, status: c.status as CampaignStatus,
    startDate: c.start_date, endDate: c.end_date, budget: c.budget, offer: c.offer, notes: c.notes,
    revenue: totals.revenue, orders: totals.orders, spend: totals.spend, roas: safeRoas(totals.revenue, totals.spend),
    metrics,
  };
}

// ---------------------------------------------------------------------------
// Ad spend
// ---------------------------------------------------------------------------

export interface AdSpendRow {
  id: string; date: string; platform: AdPlatform;
  spend: number; revenue: number; impressions: number; clicks: number; purchases: number;
}

export interface AdSpendTotals { spend: number; revenue: number; impressions: number; clicks: number; purchases: number }

export interface AdSpendPage {
  rows: AdSpendRow[];
  totals: AdSpendTotals;
  metrics: ReturnType<typeof adMetrics>;
  error: boolean;
}

const AD_SPEND_SELECT = 'id, date, platform, spend, revenue, impressions, clicks, purchases';
/** How far back the log/rollup looks — a rolling window, not "all time", so the totals stay meaningful as the log grows. */
const AD_SPEND_WINDOW_DAYS = 90;

/**
 * `mer` (spend as a share of *total store* revenue, not just attributed revenue) is
 * deliberately left null here — computing it needs the org's total revenue over the
 * same date window, which lives in `sales_daily` (the Revenue screen), and
 * cross-referencing the two screens' data is a reasonable follow-up once this
 * screen has been used for a bit, not something to wire up unattended on a first
 * pass. Every other figure `adMetrics()` returns (roas/cac/cpm/ctr/cpc/cvr/aov) only
 * needs this table's own columns and is computed for real below.
 */
export async function getAdSpendPage(orgId: string, asOf = new Date().toISOString().slice(0, 10)): Promise<AdSpendPage> {
  const sb = await createClient();
  const since = shiftDays(asOf, -AD_SPEND_WINDOW_DAYS);
  const { data, error } = await sb.from('ad_spend_daily').select(AD_SPEND_SELECT).eq('organization_id', orgId).gte('date', since).order('date', { ascending: false });
  if (error) return { rows: [], totals: { spend: 0, revenue: 0, impressions: 0, clicks: 0, purchases: 0 }, metrics: adMetrics({ spend: 0, revenue: 0, impressions: 0, clicks: 0, purchases: 0 }), error: true };

  const rows: AdSpendRow[] = (data ?? []).map(r => ({
    id: r.id, date: r.date, platform: r.platform as AdPlatform,
    spend: Number(r.spend), revenue: Number(r.revenue), impressions: r.impressions, clicks: r.clicks, purchases: r.purchases,
  }));
  const totals = rows.reduce((a, r) => ({
    spend: a.spend + r.spend, revenue: a.revenue + r.revenue,
    impressions: a.impressions + r.impressions, clicks: a.clicks + r.clicks, purchases: a.purchases + r.purchases,
  }), { spend: 0, revenue: 0, impressions: 0, clicks: 0, purchases: 0 });

  return { rows, totals, metrics: adMetrics(totals), error: false };
}

// ---------------------------------------------------------------------------
// Creators
// ---------------------------------------------------------------------------

export interface CreatorOptions { owners: { id: string; name: string }[] }

export interface CreatorRow {
  id: string; name: string; handle: string | null; platform: CreatorPlatform; followers: number | null;
  market: string; category: string | null; status: CreatorStatus;
  /** null = unknown cost, never 0 — same "missing is not zero" rule as `products.cost`. */
  cost: number | null;
  owner: { id: string; name: string } | null;
  contentCount: number; totalSales: number; totalCost: number;
}

export interface CreatorContentRow {
  id: string; productsSent: string | null; url: string | null; publishedAt: string | null;
  views: number; clicks: number; sales: number; cost: number; note: string | null;
}

export interface CreatorDetail extends CreatorRow { contact: string | null; notes: string | null; content: CreatorContentRow[] }

export interface CreatorsPage { creators: CreatorRow[]; options: CreatorOptions; error: boolean }

// Two independent literal strings — same reasoning as CAMPAIGN_SELECT/CAMPAIGN_DETAIL_SELECT above.
const CREATOR_SELECT = 'id, name, handle, platform, followers, market, category, status, cost, owner_id, owner:owner_id(id, display_name, full_name)';
const CREATOR_DETAIL_SELECT = 'id, name, handle, platform, followers, market, category, status, cost, owner_id, owner:owner_id(id, display_name, full_name), contact, notes';

export async function getCreatorOptions(orgId: string): Promise<CreatorOptions> {
  const sb = await createClient();
  const { data } = await sb.from('memberships').select('profile_id, profiles:profile_id(id, display_name, full_name)').eq('organization_id', orgId).eq('status', 'active');
  return { owners: (data ?? []).map(m => one(m.profiles)).filter(Boolean).map(p => ({ id: p!.id, name: personName(p!) })).sort((a, b) => a.name.localeCompare(b.name)) };
}

export async function getCreatorsPage(orgId: string): Promise<CreatorsPage> {
  const sb = await createClient();
  const [list, options] = await Promise.all([
    sb.from('creators').select(CREATOR_SELECT).eq('organization_id', orgId).order('name'),
    getCreatorOptions(orgId),
  ]);
  if (list.error) return { creators: [], options: { owners: [] }, error: true };

  const ids = (list.data ?? []).map(c => c.id);
  const { data: contentRows } = ids.length
    ? await sb.from('creator_content').select('creator_id, sales, cost').in('creator_id', ids)
    : { data: [] as { creator_id: string; sales: number; cost: number }[] };
  const byCreator = new Map<string, { sales: number; cost: number }[]>();
  for (const r of contentRows ?? []) byCreator.set(r.creator_id, [...(byCreator.get(r.creator_id) ?? []), r]);

  const creators: CreatorRow[] = (list.data ?? []).map(c => {
    const items = byCreator.get(c.id) ?? [];
    return {
      id: c.id, name: c.name, handle: c.handle, platform: c.platform as CreatorPlatform, followers: c.followers,
      market: c.market, category: c.category, status: c.status as CreatorStatus, cost: c.cost,
      owner: one(c.owner) ? { id: one(c.owner)!.id, name: personName(one(c.owner)!) } : null,
      contentCount: items.length,
      totalSales: items.reduce((a, i) => a + Number(i.sales), 0),
      totalCost: items.reduce((a, i) => a + Number(i.cost), 0),
    };
  });
  return { creators, options, error: false };
}

export async function getCreatorDetail(orgId: string, creatorId: string): Promise<CreatorDetail | null> {
  const sb = await createClient();
  const { data: c } = await sb.from('creators').select(CREATOR_DETAIL_SELECT).eq('organization_id', orgId).eq('id', creatorId).maybeSingle();
  if (!c) return null;

  const { data: contentData } = await sb.from('creator_content')
    .select('id, products_sent, url, published_at, views, clicks, sales, cost, note').eq('creator_id', creatorId).order('published_at', { ascending: false });
  const content: CreatorContentRow[] = (contentData ?? []).map(r => ({
    id: r.id, productsSent: r.products_sent, url: r.url, publishedAt: r.published_at,
    views: r.views, clicks: r.clicks, sales: Number(r.sales), cost: Number(r.cost), note: r.note,
  }));

  return {
    id: c.id, name: c.name, handle: c.handle, platform: c.platform as CreatorPlatform, followers: c.followers,
    market: c.market, category: c.category, status: c.status as CreatorStatus, cost: c.cost,
    owner: one(c.owner) ? { id: one(c.owner)!.id, name: personName(one(c.owner)!) } : null,
    contentCount: content.length, totalSales: content.reduce((a, i) => a + i.sales, 0), totalCost: content.reduce((a, i) => a + i.cost, 0),
    contact: c.contact, notes: c.notes, content,
  };
}

// ---- helpers -------------------------------------------------------------

function one<T>(rel: T | T[] | null | undefined): T | null {
  return (Array.isArray(rel) ? rel[0] : rel) ?? null;
}

function personName(p: { display_name?: string | null; full_name?: string | null }): string {
  return p.display_name || p.full_name || '';
}
