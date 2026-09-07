import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { computePacing, monthBounds, weekBounds, daysBetween, previousMonthToDate, shiftDays, type Pacing } from '@/lib/calculations/pacing';
import { sumRevenue, aov, conversionRate, grossMarginPct, type DailySales } from '@/lib/calculations/finance';
import { weeksOfSupply, stockStatus, inventoryValuation, type StockStatus } from '@/lib/calculations/inventory';
import { projectHealth, type ProjectHealth } from '@/lib/calculations/goals';
import { healthScore, companyStatus, type CompanyStatus } from '@/lib/calculations/health';
import { evaluateRules, executiveSummary, type AttentionItem, type RulesSnapshot } from '@/lib/calculations/rules';
import { pctChange } from '@/lib/calculations/format';
import { localizedField, type Locale } from '@/lib/i18n';

/** Everything the Command Center renders, assembled server-side from Supabase (RLS applies) and the calculation layer. */
export interface CommandCenterData {
  asOf: string;
  status: CompanyStatus;
  summary: ReturnType<typeof executiveSummary>;
  revenue: Pacing & { month: string; previousMonthRevenue: number };
  attention: AttentionItem[];
  kpis: { key: string; value: number | null; target: number | null; previous: number | null; unit: 'TWD' | 'percent' | 'count'; incomplete?: { uncostedProducts: number; uncostedUnits: number } }[];
  pulse: { revenueToday: number; ordersToday: number; waiting: number; csPending: number; lowStock: number; tasksDue: number; overdue: number; publishing: number };
  journey: { currentMonthlyRunRate: number; annualRunRate: number; stages: { label: string; monthly: number; targetDate: string | null; reached: boolean }[] };
  tasksToday: { id: string; title: string; status: string; priority: string; due_date: string | null; assignee: string | null }[];
  projects: { id: string; name: string; progress: number; health: ProjectHealth; deadline: string | null; open: number }[];
  heroProducts: { id: string; name: string; sku: string; onHand: number; weeks: number; status: StockStatus; revenue30d: number; share: number }[];
  contentWeek: { published: number; target: number | null; views: number; top: { id: string; title: string; views: number } | null };
  systems: { id: string; key: string; name: string; score: number; owner: string | null; nextAction: string | null }[];
  health: { total: number; max: number };
  activity: { id: string; summary: string; actor: string | null; at: string }[];
}

export async function getCommandCenter(orgId: string, userId: string, locale: Locale, asOf = new Date().toISOString().slice(0, 10)): Promise<CommandCenterData> {
  const sb = await createClient();
  const m = monthBounds(asOf); const prevM = monthBounds(shiftMonth(m.start, -1)); const w = weekBounds(asOf);

  const [targets, salesM, salesPrev, tasks, projects, progress, products, inventory, sales30, content, systems, ops, cs, fin, crm, dismissals, activity, kr, review, recentContent, recentAds, recentOrders] = await Promise.all([
    sb.from('targets').select('metric, value, period_start, period_end').eq('organization_id', orgId).lte('period_start', asOf).gte('period_end', asOf),
    sb.from('v_sales_daily_total').select('*').eq('organization_id', orgId).gte('date', m.start).lte('date', m.end),
    sb.from('v_sales_daily_total').select('*').eq('organization_id', orgId).gte('date', prevM.start).lte('date', prevM.end),
    sb.from('tasks').select('id, title, status, priority, due_date, assignee_id, profiles:assignee_id(display_name)').eq('organization_id', orgId).neq('status', 'done'),
    sb.from('projects').select('id, name, name_zh, status, deadline').eq('organization_id', orgId).in('status', ['planning', 'active', 'at_risk', 'blocked']),
    sb.from('v_project_progress').select('*').eq('organization_id', orgId),
    sb.from('products').select('id, name, name_zh, sku, is_hero, cost, status').eq('organization_id', orgId).neq('status', 'discontinued'),
    sb.from('inventory').select('product_id, on_hand, reserved, incoming, incoming_eta, safety_stock, reorder_point, unit_cost').eq('organization_id', orgId),
    sb.from('v_product_sales_30d').select('*').eq('organization_id', orgId),
    sb.from('content').select('id, title, status, publish_date, content_metrics(views)').eq('organization_id', orgId).gte('publish_date', w.start).lte('publish_date', w.end),
    sb.from('business_systems').select('id, key, name, name_zh, score, next_action, profiles:owner_id(display_name)').eq('organization_id', orgId).order('sort_order'),
    sb.from('operations_daily').select('orders_waiting, cs_pending').eq('organization_id', orgId).order('date', { ascending: false }).limit(1).maybeSingle(),
    sb.from('customer_service_cases').select('id, created_at, last_response_at').eq('organization_id', orgId).in('status', ['open', 'waiting']),
    sb.from('financial_monthly').select('month, revenue, cogs, cash_balance, inventory_value').eq('organization_id', orgId).order('month', { ascending: false }).limit(1).maybeSingle(),
    sb.from('crm_metrics_monthly').select('month, repeat_revenue').eq('organization_id', orgId).order('month', { ascending: false }).limit(1).maybeSingle(),
    sb.from('attention_dismissals').select('rule_code, entity_id, until_date').eq('organization_id', orgId),
    sb.from('activity_logs').select('id, summary, created_at, profiles:actor_id(display_name)').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(8),
    sb.from('key_results').select('id, title, title_zh, start_value, current_value, target_value, direction, deadline, objectives(start_date)').eq('organization_id', orgId).neq('status', 'completed'),
    sb.from('reviews').select('period_start, status').eq('organization_id', orgId).eq('type', 'weekly').order('period_start', { ascending: false }).limit(1).maybeSingle(),
    // Rolling windows for the stall rules: content in the last 7 days, ad spend and
    // order volume over the last 35, all ending on asOf.
    sb.from('content').select('publish_date, status').eq('organization_id', orgId).eq('status', 'published').gte('publish_date', shiftDays(asOf, -6)).lte('publish_date', asOf),
    sb.from('ad_spend_daily').select('date, spend').eq('organization_id', orgId).gte('date', shiftDays(asOf, -34)).lte('date', asOf),
    sb.from('v_sales_daily_total').select('date, orders').eq('organization_id', orgId).gte('date', shiftDays(asOf, -34)).lte('date', asOf),
  ]);

  const target = (metric: string) => Number(targets.data?.find(t => t.metric === metric)?.value ?? NaN) || null;
  const cur = sumRevenue(toDailySales(salesM.data));

  // Month-to-date is compared with the same elapsed slice of last month (Sep 1–5 vs
  // Aug 1–5), not the full month — otherwise every KPI reads as a collapse early on.
  // The full previous month is still summed for `previousMonthRevenue` and the journey stages.
  const pmtd = previousMonthToDate(asOf);
  const prevRows = toDailySales(salesPrev.data);
  const prev = sumRevenue(prevRows);
  const prevMtdRows = prevRows.filter(r => r.date <= pmtd.end);
  const prevMtd = sumRevenue(prevMtdRows);

  const monthlyTarget = target('monthly_revenue') ?? 0;
  const pacing = computePacing({ target: monthlyTarget, actual: cur.gross, periodStart: m.start, periodEnd: m.end, asOf });

  const sumSessions = (rows: { sessions: number | null }[]) => rows.reduce((a, r) => a + Number(r.sessions ?? 0), 0) || null;
  const sessions = sumSessions(salesM.data ?? []);
  const sessionsPrevMtd = sumSessions((salesPrev.data ?? []).filter(r => r.date !== null && r.date <= pmtd.end));
  const aovNow = aov(cur.gross, cur.orders), aovPrev = aov(prevMtd.gross, prevMtd.orders);
  const cvrNow = conversionRate(cur.orders, sessions);
  const cvrPrev = conversionRate(prevMtd.orders, sessionsPrevMtd);
  const gm = fin.data ? grossMarginPct(Number(fin.data.revenue), Number(fin.data.cogs)) : null;

  // products / inventory
  const invBy = new Map((inventory.data ?? []).map(i => [i.product_id, i]));
  const s30 = new Map((sales30.data ?? []).map(s => [s.product_id, s]));
  const totalRev30 = (sales30.data ?? []).reduce((a, s) => a + Number(s.revenue_30d), 0);
  const stockRows = (products.data ?? []).map(p => {
    const inv = invBy.get(p.id); const s = s30.get(p.id);
    const input = { onHand: Number(inv?.on_hand ?? 0), reserved: Number(inv?.reserved ?? 0), unitsPerDay: Number(s?.units_per_day ?? 0), safetyStock: Number(inv?.safety_stock ?? 0), reorderPoint: Number(inv?.reorder_point ?? 0) };
    return { id: p.id, name: localizedField(p, 'name', locale), sku: p.sku, isHero: p.is_hero, ...input, weeks: weeksOfSupply(input), stock: stockStatus(input), revenue30d: Number(s?.revenue_30d ?? 0), unitCost: firstKnownCost(inv?.unit_cost, p.cost), incoming: Number(inv?.incoming ?? 0), eta: inv?.incoming_eta as string | null };
  });

  const stockValue = inventoryValuation(stockRows);

  // tasks
  const allTasks = tasks.data ?? [];
  const overdue = allTasks.filter(t => t.due_date && t.due_date < asOf);
  const tasksToday = allTasks.filter(t => t.due_date && t.due_date <= asOf).sort(byPriority).slice(0, 8)
    .map(t => ({ id: t.id, title: localizedField(t, 'title', locale), status: t.status, priority: t.priority, due_date: t.due_date, assignee: nameOf(t.profiles) }));

  // projects
  const progBy = new Map((progress.data ?? []).map(p => [p.project_id, p]));
  const projectRows = (projects.data ?? []).map(p => {
    const pr = progBy.get(p.id); const pct = Number(pr?.progress_pct ?? 0); const open = Number(pr?.total_tasks ?? 0) - Number(pr?.done_tasks ?? 0);
    return { id: p.id, name: localizedField(p, 'name', locale), status: p.status, deadline: p.deadline, progress: pct, open, health: projectHealth({ deadline: p.deadline, progressPct: pct, blocked: Number(pr?.blocked_tasks ?? 0), overdue: Number(pr?.overdue_tasks ?? 0), status: p.status }, asOf) };
  }).sort((a, b) => healthRank(a.health) - healthRank(b.health) || a.progress - b.progress);

  // content this week
  const week = content.data ?? [];
  const published = week.filter(c => c.status === 'published');
  const withViews = published.map(c => ({ id: c.id, title: c.title, views: (c.content_metrics as { views: number }[] | null)?.reduce((a, x) => Math.max(a, Number(x.views)), 0) ?? 0 }));
  const weeklyTarget = target('weekly_content');
  const weekElapsed = (daysBetween(w.start, asOf) + 1) / 7;

  const snapshot: RulesSnapshot = {
    asOf, revenue: pacing,
    aov: { current: aovNow, previous: aovPrev, target: target('aov') },
    cvr: { current: cvrNow, target: target('cvr') },
    heroProducts: stockRows.map(r => ({ id: r.id, name: r.name, onHand: r.onHand, reserved: r.reserved, unitsPerDay: r.unitsPerDay, safetyStock: r.safetyStock, reorderPoint: r.reorderPoint, isHero: r.isHero })),
    incomingLate: stockRows.filter(r => r.incoming > 0 && r.eta && r.eta < asOf).map(r => ({ id: r.id, name: r.name, eta: r.eta! })),
    projects: projectRows.map(p => ({ id: p.id, name: p.name, deadline: p.deadline, progressPct: p.progress, openTasks: p.open, status: p.status })),
    tasks: { overdueUrgent: overdue.filter(t => t.priority === 'urgent').length, overdueHigh: overdue.filter(t => t.priority === 'high').length, blocked: allTasks.filter(t => t.status === 'blocked').length },
    content: {
      publishedThisWeek: published.length, weeklyTarget, weekElapsedFraction: weekElapsed,
      publishedLast3Days: countPublishedSince(recentContent.data, shiftDays(asOf, -2), asOf),
      publishedLast7Days: countPublishedSince(recentContent.data, shiftDays(asOf, -6), asOf),
    },
    ads: adSpendStreak(recentAds.data, asOf),
    ordersPerDay: ordersPerDayAverages(recentOrders.data, asOf),
    keyResults: (kr.data ?? []).map(k => ({ id: k.id, title: localizedField(k, 'title', locale), start_value: Number(k.start_value), current_value: Number(k.current_value), target_value: Number(k.target_value), direction: k.direction === 'decrease' ? 'decrease' as const : 'increase' as const, deadline: k.deadline, periodStart: (k.objectives as { start_date: string } | null)?.start_date })),
    reviews: { weeklyDue: nextMonday(asOf), weeklyDone: !!review.data && review.data.period_start >= w.start && review.data.status === 'completed' },
    operations: { ordersWaiting: Number(ops.data?.orders_waiting ?? 0), csPending: (cs.data ?? []).length, csOpenOver24h: (cs.data ?? []).filter(c => Date.parse(c.last_response_at ?? c.created_at) < Date.parse(asOf) - 86_400_000).length },
    systems: (systems.data ?? []).map(s => ({ id: s.id, key: s.key, name: localizedField(s, 'name', locale), score: s.score, nextAction: s.next_action })),
    dismissals: dismissals.data ?? [],
  };
  const attention = evaluateRules(snapshot);
  const krOff = snapshot.keyResults.filter(k => k.current_value < k.target_value * 0.5 && daysBetween(asOf, k.deadline ?? asOf) < 60).length;
  const status = companyStatus({ revenuePace: pacing.status, criticalAlerts: attention.filter(a => a.severity === 'critical').length, highAlerts: attention.filter(a => a.severity === 'high').length, krOffTrack: krOff, krAtRisk: 0 });

  const today = (salesM.data ?? []).find(r => r.date === asOf);
  const stages = [1_000_000, 2_500_000, 5_000_000, 8_333_333].map((monthly, i) => ({ label: ['1M', '2.5M', '5M', '8.33M'][i], monthly, targetDate: null as string | null, reached: prev.gross >= monthly }));

  return {
    asOf, status, summary: executiveSummary(snapshot, attention),
    revenue: { ...pacing, month: m.start.slice(0, 7), previousMonthRevenue: prev.gross },
    attention,
    kpis: [
      { key: 'revenue', value: cur.gross, target: monthlyTarget || null, previous: prevMtd.gross, unit: 'TWD' },
      { key: 'orders', value: cur.orders, target: target('daily_orders') ? target('daily_orders')! * pacing.totalDays : null, previous: prevMtd.orders, unit: 'count' },
      { key: 'aov', value: aovNow, target: target('aov'), previous: aovPrev, unit: 'TWD' },
      { key: 'cvr', value: cvrNow, target: target('cvr'), previous: cvrPrev, unit: 'percent' },
      { key: 'gross_margin', value: gm, target: target('gross_margin'), previous: null, unit: 'percent' },
      { key: 'repeat_revenue', value: crm.data && prev.gross ? (Number(crm.data.repeat_revenue) / prev.gross) * 100 : null, target: target('repeat_revenue'), previous: null, unit: 'percent' },
      { key: 'cash', value: fin.data?.cash_balance != null ? Number(fin.data.cash_balance) : null, target: null, previous: null, unit: 'TWD' },
      { key: 'inventory_value', value: stockValue.complete ? stockValue.value : null, target: null, previous: fin.data?.inventory_value != null ? Number(fin.data.inventory_value) : null, unit: 'TWD',
        incomplete: stockValue.complete ? undefined : { uncostedProducts: stockValue.uncostedProducts, uncostedUnits: stockValue.uncostedUnits } },
    ],
    pulse: { revenueToday: Number(today?.gross_revenue ?? 0), ordersToday: Number(today?.orders ?? 0), waiting: Number(ops.data?.orders_waiting ?? 0), csPending: (cs.data ?? []).length,
             lowStock: stockRows.filter(r => r.stock === 'critical' || r.stock === 'low').length, tasksDue: allTasks.filter(t => t.due_date === asOf).length, overdue: overdue.length,
             publishing: week.filter(c => c.publish_date === asOf && c.status !== 'published').length },
    journey: { currentMonthlyRunRate: pacing.projectedFinish, annualRunRate: pacing.projectedFinish * 12, stages },
    tasksToday, projects: projectRows.map(({ status: _s, ...p }) => p),
    heroProducts: stockRows.filter(r => r.isHero).map(r => ({ id: r.id, name: r.name, sku: r.sku, onHand: r.onHand, weeks: r.weeks, status: r.stock, revenue30d: r.revenue30d, share: totalRev30 ? (r.revenue30d / totalRev30) * 100 : 0 })).sort((a, b) => b.revenue30d - a.revenue30d),
    contentWeek: { published: published.length, target: weeklyTarget, views: withViews.reduce((a, c) => a + c.views, 0), top: withViews.sort((a, b) => b.views - a.views)[0] ?? null },
    systems: (systems.data ?? []).map(s => ({ id: s.id, key: s.key, name: localizedField(s, 'name', locale), score: s.score, owner: nameOf(s.profiles), nextAction: s.next_action })),
    health: healthScore(systems.data ?? []),
    activity: (activity.data ?? []).map(a => ({ id: a.id, summary: a.summary, actor: nameOf(a.profiles), at: a.created_at })),
  };
}

/** v_sales_daily_total groups by date, so `date` is never null — the view type just cannot say so. */
function toDailySales(rows: { date: string | null; orders: number | null; gross_revenue: number | null; refunds: number | null; platform_fees: number | null }[] | null): DailySales[] {
  return (rows ?? []).filter((r): r is typeof r & { date: string } => r.date !== null)
    .map(r => ({ date: r.date, orders: Number(r.orders ?? 0), gross_revenue: Number(r.gross_revenue ?? 0), refunds: Number(r.refunds ?? 0), platform_fees: Number(r.platform_fees ?? 0) }));
}

/** Prefer the inventory row's unit cost, fall back to the product's, and keep `null` meaning unknown. */
function firstKnownCost(...candidates: (number | null | undefined)[]): number | null {
  for (const c of candidates) if (c !== null && c !== undefined && Number.isFinite(Number(c))) return Number(c);
  return null;
}

/** Published pieces with a publish_date inside [from, to]. */
function countPublishedSince(rows: { publish_date: string | null }[] | null, from: string, to: string): number {
  return (rows ?? []).filter(r => r.publish_date && r.publish_date >= from && r.publish_date <= to).length;
}

/**
 * How many consecutive days up to `asOf` have no spend, and what the 14 days before
 * that streak averaged. A missing row counts as zero — not spending and not recording
 * look the same from the outside, and both mean the ads are off.
 */
function adSpendStreak(rows: { date: string | null; spend: number | null }[] | null, asOf: string): { zeroOrMissingDays: number; prior14DayAverage: number } {
  const byDay = new Map<string, number>();
  for (const r of rows ?? []) if (r.date) byDay.set(r.date, (byDay.get(r.date) ?? 0) + Number(r.spend ?? 0));

  let zeroOrMissingDays = 0;
  while (zeroOrMissingDays < 35 && (byDay.get(shiftDays(asOf, -zeroOrMissingDays)) ?? 0) <= 0) zeroOrMissingDays += 1;

  let total = 0;
  for (let i = 0; i < 14; i += 1) total += byDay.get(shiftDays(asOf, -(zeroOrMissingDays + i))) ?? 0;
  return { zeroOrMissingDays, prior14DayAverage: total / 14 };
}

/** Mean orders/day over the last 7 days, and over the 28 before those. */
function ordersPerDayAverages(rows: { date: string | null; orders: number | null }[] | null, asOf: string): { last7: number | null; prev28: number | null } {
  const byDay = new Map<string, number>();
  for (const r of rows ?? []) if (r.date) byDay.set(r.date, (byDay.get(r.date) ?? 0) + Number(r.orders ?? 0));
  if (!byDay.size) return { last7: null, prev28: null };

  const mean = (offset: number, days: number) => {
    let sum = 0;
    for (let i = 0; i < days; i += 1) sum += byDay.get(shiftDays(asOf, -(offset + i))) ?? 0;
    return sum / days;
  };
  const earliest = [...byDay.keys()].sort()[0];
  // Only claim a baseline once there is history behind the recent week.
  const hasBaseline = earliest <= shiftDays(asOf, -14);
  return { last7: mean(0, 7), prev28: hasBaseline ? mean(7, 28) : null };
}

const PRIO: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
function byPriority(a: { priority: string; due_date: string | null }, b: { priority: string; due_date: string | null }) { return PRIO[a.priority] - PRIO[b.priority] || (a.due_date ?? '').localeCompare(b.due_date ?? ''); }
function healthRank(h: ProjectHealth) { return h === 'critical' ? 0 : h === 'at_risk' ? 1 : 2; }
function nameOf(p: unknown): string | null { const x = Array.isArray(p) ? p[0] : p; return (x as { display_name?: string } | null)?.display_name ?? null; }
function shiftMonth(isoFirst: string, delta: number) { const [y, mo] = isoFirst.split('-').map(Number); const d = new Date(Date.UTC(y, mo - 1 + delta, 1)); return d.toISOString().slice(0, 10); }
function nextMonday(iso: string) { const t = Date.parse(iso); const dow = new Date(t).getUTCDay(); const add = dow === 1 ? 0 : (8 - dow) % 7; return new Date(t + add * 86_400_000).toISOString().slice(0, 10); }
export { pctChange };
