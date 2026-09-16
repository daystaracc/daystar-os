import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { resolvePeriod, previousPeriod, type RevenuePeriodPreset } from '@/lib/calculations/pacing';
import { sumRevenue, aov, type DailySales } from '@/lib/calculations/finance';
import { pctChange } from '@/lib/calculations/format';

export type { RevenuePeriodPreset };

export interface RevenueChannel { id: string; key: string; display_name: string }

export interface RevenueEntry {
  id: string;
  date: string;
  channel_id: string;
  channel_key: string;
  channel_name: string;
  orders: number;
  gross_revenue: number;
  refunds: number;
  platform_fees: number;
  net_revenue: number | null;
  sessions: number | null;
  notes: string | null;
}

export interface RevenueTotals { gross: number; net: number; orders: number; refunds: number; fees: number; aov: number | null }

export interface RevenueKpi {
  key: 'revenue' | 'net_revenue' | 'orders' | 'aov';
  value: number | null;
  target: number | null;
  previous: number | null;
  unit: 'TWD' | 'percent' | 'count';
}

/** Everything the Revenue screen renders, assembled server-side from Supabase (RLS applies). */
export interface RevenueData {
  period: { start: string; end: string };
  previousPeriod: { start: string; end: string };
  channels: RevenueChannel[];
  entries: RevenueEntry[];
  totals: RevenueTotals;
  previousTotals: RevenueTotals;
  kpis: RevenueKpi[];
}

/**
 * Manual + (eventually) imported revenue, one row per channel per day from
 * `sales_daily`. Read access mirrors the `sales_daily_select` RLS policy
 * (manager-or-above) — a member calling this gets nothing back from Supabase,
 * not an error, so the page itself decides who ever reaches this function
 * (see `can.viewRevenue` in `lib/permissions.ts`).
 */
export async function getRevenue(orgId: string, preset: RevenuePeriodPreset, asOf = new Date().toISOString().slice(0, 10)): Promise<RevenueData> {
  const sb = await createClient();
  const period = resolvePeriod(preset, asOf);
  const prevPeriod = previousPeriod(period);

  const [channelsRes, entriesRes, prevRes] = await Promise.all([
    sb.from('sales_channels').select('id, key, display_name').eq('organization_id', orgId).order('key'),
    sb.from('sales_daily')
      .select('id, date, channel_id, orders, gross_revenue, refunds, platform_fees, net_revenue, sessions, notes, sales_channels(key, display_name)')
      .eq('organization_id', orgId).gte('date', period.start).lte('date', period.end)
      .order('date', { ascending: false }),
    sb.from('sales_daily')
      .select('date, orders, gross_revenue, refunds, platform_fees')
      .eq('organization_id', orgId).gte('date', prevPeriod.start).lte('date', prevPeriod.end),
  ]);

  const channels: RevenueChannel[] = (channelsRes.data ?? []).map(c => ({ id: c.id, key: c.key, display_name: c.display_name }));

  const entries: RevenueEntry[] = (entriesRes.data ?? []).map(r => {
    const ch = channelOf(r.sales_channels);
    return {
      id: r.id, date: r.date, channel_id: r.channel_id,
      channel_key: ch?.key ?? '', channel_name: ch?.display_name ?? '',
      orders: Number(r.orders), gross_revenue: Number(r.gross_revenue), refunds: Number(r.refunds), platform_fees: Number(r.platform_fees),
      net_revenue: r.net_revenue !== null ? Number(r.net_revenue) : null,
      sessions: r.sessions !== null ? Number(r.sessions) : null,
      notes: r.notes,
    };
  });

  const cur = sumRevenue(toDailySales(entriesRes.data));
  const prevRows = toDailySales(prevRes.data);
  const prev = sumRevenue(prevRows);

  const totals: RevenueTotals = { ...cur, aov: aov(cur.gross, cur.orders) };
  const previousTotals: RevenueTotals = { ...prev, aov: aov(prev.gross, prev.orders) };

  const kpis: RevenueKpi[] = [
    { key: 'revenue', value: totals.gross, target: null, previous: previousTotals.gross, unit: 'TWD' },
    { key: 'net_revenue', value: totals.net, target: null, previous: previousTotals.net, unit: 'TWD' },
    { key: 'orders', value: totals.orders, target: null, previous: previousTotals.orders, unit: 'count' },
    { key: 'aov', value: totals.aov, target: null, previous: previousTotals.aov, unit: 'TWD' },
  ];

  return { period, previousPeriod: prevPeriod, channels, entries, totals, previousTotals, kpis };
}

/** `sales_daily` rows already group by day per channel; a period can have several rows per date (one per channel). */
function toDailySales(rows: { date: string | null; orders: number | null; gross_revenue: number | null; refunds: number | null; platform_fees: number | null }[] | null): DailySales[] {
  return (rows ?? []).filter((r): r is typeof r & { date: string } => r.date !== null)
    .map(r => ({ date: r.date, orders: Number(r.orders ?? 0), gross_revenue: Number(r.gross_revenue ?? 0), refunds: Number(r.refunds ?? 0), platform_fees: Number(r.platform_fees ?? 0) }));
}

/** postgrest-js returns the joined `sales_channels` row as an object here (to-one FK), but types it as an array — same gotcha as `commandCenter.ts`'s `nameOf`. */
function channelOf(c: unknown): { key: string; display_name: string } | null {
  const x = Array.isArray(c) ? c[0] : c;
  return (x as { key: string; display_name: string } | null) ?? null;
}

export { pctChange };
