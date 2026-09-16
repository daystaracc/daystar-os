import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePacing, monthBounds, weekBounds, previousMonthToDate, previousMonthBounds, quarterBounds, yearBounds, resolvePeriod, previousPeriod } from '../pacing';
import { formatTWD, formatTWDCompact, formatDelta, pctChange } from '../format';
import { aov, contributionMargin, adMetrics, conversionRate, conversionRateOverDays } from '../finance';
import { weeksOfSupply, stockStatus, abcClassify, reorderSuggestion, sellThroughPct, inventoryValuation, productMarginPct } from '../inventory';
import { keyResultProgress, keyResultStatus, projectHealth, averageProgress } from '../goals';
import { healthScore, companyStatus } from '../health';
import { evaluateRules, executiveSummary, type RulesSnapshot } from '../rules';

test('pacing: September 2026 on the 5th, behind target', () => {
  const p = computePacing({ target: 1_000_000, actual: 103_520, periodStart: '2026-09-01', periodEnd: '2026-09-30', asOf: '2026-09-05' });
  assert.equal(p.totalDays, 30);
  assert.equal(p.elapsedDays, 4);
  assert.equal(p.remainingDays, 26);
  assert.equal(Math.round(p.actualPace), 25_880);
  assert.equal(Math.round(p.requiredPace), 34_480);
  assert.equal(Math.round(p.projectedFinish), 776_400);
  assert.equal(p.status, 'behind');
  assert.equal(Math.round(p.variancePct), -22); // 103,520 vs expected 133,333 → 22% behind pace
});

test('pacing: the spec example is ahead', () => {
  const p = computePacing({ target: 1_000_000, actual: 742_400, periodStart: '2026-09-01', periodEnd: '2026-09-30', asOf: '2026-09-23' });
  assert.equal(p.remainingDays, 8);
  assert.equal(p.status, 'on_pace'); // +1.2% vs expected: inside the ±5% band ("slightly ahead" in the summary wording)
  assert.equal(Math.round(p.variancePct * 10) / 10, 1.2);
  assert.equal(Math.round(p.projectedFinish / 1000), 1012);
});

test('pacing: on-pace band and completed target', () => {
  const on = computePacing({ target: 100, actual: 50, periodStart: '2026-09-01', periodEnd: '2026-09-10', asOf: '2026-09-06' });
  assert.equal(on.status, 'on_pace');
  const done = computePacing({ target: 100, actual: 120, periodStart: '2026-09-01', periodEnd: '2026-09-10', asOf: '2026-09-03' });
  assert.equal(done.status, 'ahead');
  assert.equal(done.requiredPace, 0);
});

test('period helpers', () => {
  assert.deepEqual(monthBounds('2026-02-14'), { start: '2026-02-01', end: '2026-02-28' });
  assert.deepEqual(weekBounds('2026-09-05'), { start: '2026-08-31', end: '2026-09-06' }); // Saturday → Mon–Sun
});

test('quarterBounds / yearBounds', () => {
  assert.deepEqual(quarterBounds('2026-02-14'), { start: '2026-01-01', end: '2026-03-31' });
  assert.deepEqual(quarterBounds('2026-09-05'), { start: '2026-07-01', end: '2026-09-30' }); // Q3
  assert.deepEqual(quarterBounds('2026-12-31'), { start: '2026-10-01', end: '2026-12-31' }); // Q4
  assert.deepEqual(yearBounds('2026-09-05'), { start: '2026-01-01', end: '2026-12-31' });
});

test('resolvePeriod: Revenue screen presets, clamped so a period never runs past asOf', () => {
  assert.deepEqual(resolvePeriod('today', '2026-09-05'), { start: '2026-09-05', end: '2026-09-05' });
  assert.deepEqual(resolvePeriod('7d', '2026-09-05'), { start: '2026-08-30', end: '2026-09-05' });
  assert.deepEqual(resolvePeriod('30d', '2026-09-05'), { start: '2026-08-07', end: '2026-09-05' });
  // "This month" on the 5th is the 1st–5th, not through the 30th — no future empty rows.
  assert.deepEqual(resolvePeriod('month', '2026-09-05'), { start: '2026-09-01', end: '2026-09-05' });
  assert.deepEqual(resolvePeriod('quarter', '2026-09-05'), { start: '2026-07-01', end: '2026-09-05' });
  assert.deepEqual(resolvePeriod('year', '2026-09-05'), { start: '2026-01-01', end: '2026-09-05' });
  // A period comfortably in the past is not clamped at all.
  assert.deepEqual(resolvePeriod('month', '2026-09-30'), { start: '2026-09-01', end: '2026-09-30' });
});

test('previousPeriod: the immediately preceding period of equal length', () => {
  assert.deepEqual(previousPeriod({ start: '2026-08-30', end: '2026-09-05' }), { start: '2026-08-23', end: '2026-08-29' }); // 7d
  assert.deepEqual(previousPeriod({ start: '2026-09-01', end: '2026-09-05' }), { start: '2026-08-27', end: '2026-08-31' }); // 5d month-to-date
  assert.deepEqual(previousPeriod({ start: '2026-09-05', end: '2026-09-05' }), { start: '2026-09-04', end: '2026-09-04' }); // 1d
});

test('previousMonthToDate: MoM compares the same elapsed days, not a full month', () => {
  // The seed baseline: on Sep 5 the comparison window is Aug 1–5, not all of August.
  assert.deepEqual(previousMonthToDate('2026-09-05'), { start: '2026-08-01', end: '2026-08-05' });
  // First of the month still yields a one-day window rather than an empty one.
  assert.deepEqual(previousMonthToDate('2026-09-01'), { start: '2026-08-01', end: '2026-08-01' });
  // Last day of a 30-day month against a 31-day month.
  assert.deepEqual(previousMonthToDate('2026-09-30'), { start: '2026-08-01', end: '2026-08-30' });
  // Clamped when the previous month is shorter: Mar 31 → Feb 28 (2026 is not a leap year).
  assert.deepEqual(previousMonthToDate('2026-03-31'), { start: '2026-02-01', end: '2026-02-28' });
  assert.deepEqual(previousMonthToDate('2028-03-31'), { start: '2028-02-01', end: '2028-02-29' }); // leap year
  // Year boundary.
  assert.deepEqual(previousMonthToDate('2027-01-12'), { start: '2026-12-01', end: '2026-12-12' });

  // The whole point, on the seed data: Sep 1–5 vs Aug 1–5 is a real comparison;
  // vs all of August it is a phantom collapse.
  const septToDate = 103_520;   // Sep 1–5
  const augSameDays = 118_150;  // Aug 1–5
  const augFullMonth = 713_820; // all of August
  assert.equal(formatDelta(pctChange(septToDate, augSameDays)), '↓ 12.4%');
  assert.equal(formatDelta(pctChange(septToDate, augFullMonth)), '↓ 85.5%');
});

test('previousMonthBounds: the full calendar month before, not a same-elapsed-days slice', () => {
  assert.deepEqual(previousMonthBounds('2026-09-05'), { start: '2026-08-01', end: '2026-08-31' });
  assert.deepEqual(previousMonthBounds('2026-09-30'), { start: '2026-08-01', end: '2026-08-31' });
  // Year boundary: any day in January → December of the *prior* year.
  assert.deepEqual(previousMonthBounds('2027-01-12'), { start: '2026-12-01', end: '2026-12-31' });
  // Leap year is handled by the underlying monthBounds, not hardcoded here.
  assert.deepEqual(previousMonthBounds('2028-03-15'), { start: '2028-02-01', end: '2028-02-29' });
});

test('formatting', () => {
  assert.equal(formatTWD(742400, 'en'), 'NT$742,400');
  assert.equal(formatTWDCompact(742400, 'en'), 'NT$742.4K');
  assert.equal(formatTWDCompact(1080000, 'en'), 'NT$1.08M');
  assert.equal(formatTWDCompact(742400, 'zh-Hant'), 'NT$74.2 萬');
  assert.equal(formatTWDCompact(100000000, 'zh-Hant'), 'NT$1 億');
  assert.equal(formatDelta(pctChange(1090, 1051)), '↑ 3.7%');
  assert.equal(formatDelta(pctChange(1000, 1080)), '↓ 7.4%');
  assert.equal(formatDelta(null), '—');
});

/**
 * Google Analytics went live on the DAYSTAR site on 2026-09-08. Every date before it
 * has orders and no sessions, so CVR must stay unknown for those — a 0% would read as
 * a catastrophic conversion rate and would fire cvr_below_target every single day.
 */
test('finance: CVR is null without sessions, and never mixes covered and uncovered days', () => {
  const day = (date: string, orders: number, sessions: number | null) =>
    ({ date, orders, gross_revenue: orders * 1000, sessions });

  // Before GA: orders, no sessions anywhere.
  const before = conversionRateOverDays([day('2026-08-01', 20, null), day('2026-08-02', 25, null)]);
  assert.equal(before.cvr, null);
  assert.equal(before.daysWithSessions, 0);
  assert.equal(before.daysWithOrders, 2);

  // A zero-session row is "not measured", not "nobody visited".
  assert.equal(conversionRateOverDays([day('2026-09-01', 20, 0)]).cvr, null);

  // The changeover month: only the covered day counts on BOTH sides of the division.
  // 13 orders / 1000 sessions = 1.3%. Counting all 33 orders would give a fake 3.3%,
  // and treating the uncovered day as 0 sessions would give the same wrong answer.
  const mixed = conversionRateOverDays([day('2026-09-07', 20, null), day('2026-09-08', 13, 1000)]);
  assert.equal(Number(mixed.cvr!.toFixed(1)), 1.3);
  assert.equal(mixed.daysWithSessions, 1);
  assert.equal(mixed.daysWithOrders, 2);
});

test('finance: AOV, CVR, contribution margin (Playbook formula), ad metrics', () => {
  assert.equal(Math.round(aov(713820, 698)!), 1023);
  assert.equal(aov(0, 0), null);
  assert.equal(Number(conversionRate(13, 1000)!.toFixed(1)), 1.3);
  const cm = contributionMargin({ revenue: 100, cogs: 40, payment_fees: 3, shipping: 6, packaging: 3, advertising: 20, returns: 3 });
  assert.equal(cm.grossProfit, 60);
  assert.equal(cm.contributionProfit, 25);
  assert.equal(cm.contributionMarginPct, 25);
  const m = adMetrics({ spend: 3200, revenue: 7800, impressions: 61000, clicks: 1160, purchases: 7 }, 25000);
  assert.equal(Number(m.roas!.toFixed(2)), 2.44);
  assert.equal(Number(m.mer!.toFixed(2)), 7.81);
  assert.equal(Math.round(m.cac!), 457);
  assert.equal(Number(m.ctr!.toFixed(2)), 1.9);
});

test('inventory: weeks of supply, status, ABC, reorder', () => {
  const chain = { onHand: 22, reserved: 0, unitsPerDay: 4.4, safetyStock: 40, reorderPoint: 60 };
  assert.equal(Number(weeksOfSupply(chain).toFixed(1)), 0.7);
  assert.equal(stockStatus(chain), 'critical');
  assert.equal(stockStatus({ onHand: 210, unitsPerDay: 1.4, safetyStock: 20, reorderPoint: 30 }), 'ok');
  assert.equal(stockStatus({ onHand: 140, unitsPerDay: 0, safetyStock: 5 }), 'dead');
  assert.equal(stockStatus({ onHand: 900, unitsPerDay: 0.5, safetyStock: 5, reorderPoint: 10 }), 'overstock');
  const abc = abcClassify([{ id: 'a', revenue: 500 }, { id: 'b', revenue: 300 }, { id: 'c', revenue: 150 }, { id: 'd', revenue: 50 }]);
  assert.deepEqual([abc.get('a'), abc.get('b'), abc.get('c'), abc.get('d')], ['A', 'A', 'B', 'C']);
  assert.equal(reorderSuggestion({ ...chain, incoming: 200, leadTimeDays: 18, moq: 100 }), 100); // 4.4×60 + 40 − 22 − 200 = 82 → MOQ 100
  assert.equal(sellThroughPct(80, 20), 80);
});

test('goals: key result progress / status and project health', () => {
  const kr = { start_value: 980, current_value: 1090, target_value: 1300, deadline: '2026-12-31' };
  assert.equal(Math.round(keyResultProgress(kr)), 34);
  assert.equal(keyResultStatus(kr, '2026-09-05', '2026-07-01'), 'on_track'); // 35.7% of time elapsed, 34% progress
  assert.equal(keyResultStatus({ start_value: 8, current_value: 9.5, target_value: 15, deadline: '2026-12-31' }, '2026-11-30', '2026-07-01'), 'off_track');
  assert.equal(keyResultStatus({ start_value: 0, current_value: 5, target_value: 5 }, '2026-09-05'), 'completed');
  assert.equal(projectHealth({ deadline: '2026-09-30', progressPct: 43, blocked: 0, overdue: 2 }, '2026-09-05'), 'at_risk');
  assert.equal(projectHealth({ deadline: '2026-09-08', progressPct: 40 }, '2026-09-05'), 'at_risk');
  assert.equal(projectHealth({ deadline: '2026-09-01', progressPct: 60 }, '2026-09-05'), 'critical');
  assert.equal(projectHealth({ deadline: '2026-10-31', progressPct: 30 }, '2026-09-05'), 'healthy');
});

test('goals: averageProgress rolls up KRs into an objective and objectives into a goal', () => {
  assert.equal(averageProgress([]), null); // no key results yet is "no data", not 0%
  assert.equal(averageProgress([100]), 100);
  assert.equal(averageProgress([0, 50, 100]), 50);
  assert.equal(averageProgress([34, 34.6]), 34); // rounds the mean, not each input
});

test('health: score and company status', () => {
  const systems = [3,2,2,2,2,1,2,2,2,1,2].map(score => ({ score }));
  assert.deepEqual(healthScore(systems), { total: 21, max: 55, pct: (21 / 55) * 100 });
  assert.equal(companyStatus({ revenuePace: 'behind', criticalAlerts: 0, highAlerts: 1, krOffTrack: 1, krAtRisk: 2 }), 'at_risk');
  assert.equal(companyStatus({ revenuePace: 'behind', criticalAlerts: 1, highAlerts: 1, krOffTrack: 1, krAtRisk: 2 }), 'off_track');
  assert.equal(companyStatus({ revenuePace: 'on_pace', criticalAlerts: 0, highAlerts: 1, krOffTrack: 0, krAtRisk: 1 }), 'on_track');
});

function seedSnapshot(): RulesSnapshot {
  return {
    asOf: '2026-09-05',
    revenue: computePacing({ target: 1_000_000, actual: 103_520, periodStart: '2026-09-01', periodEnd: '2026-09-30', asOf: '2026-09-05' }),
    aov: { current: 1005, previous: 1023, target: 1300 },
    cvr: { current: 1.3, target: 2 },
    heroProducts: [
      { id: 'tc', name: '4MM Tennis Chain', onHand: 22, reserved: 0, unitsPerDay: 4.4, safetyStock: 40, reorderPoint: 60, isHero: true },
      { id: 'cr', name: 'Iced Out Cuban Ring', onHand: 58, reserved: 0, unitsPerDay: 3.1, safetyStock: 30, reorderPoint: 40, isHero: true },
      { id: 'hat', name: 'DS Trucker Hat', onHand: 210, reserved: 0, unitsPerDay: 1.4, safetyStock: 20, reorderPoint: 30, isHero: false },
    ],
    incomingLate: [],
    projects: [
      { id: 'p1', name: 'September Campaign', deadline: '2026-09-30', progressPct: 29, openTasks: 5, status: 'active' },
      { id: 'p2', name: 'Website CRO Upgrade', deadline: '2026-09-09', progressPct: 25, openTasks: 3, status: 'active' },
    ],
    tasks: { overdueUrgent: 1, overdueHigh: 1, blocked: 1 },
    content: { publishedThisWeek: 11, weeklyTarget: 20, weekElapsedFraction: 6 / 7, publishedLast3Days: 4, publishedLast7Days: 12 },
    ads: { zeroOrMissingDays: 0, prior14DayAverage: 3200 },
    ordersPerDay: { last7: 21, prev28: 22 },
    keyResults: [{ id: 'kr1', title: 'Repeat revenue ≥ 15%', start_value: 8, current_value: 9.5, target_value: 15, deadline: '2026-12-31', periodStart: '2026-04-01' }],
    reviews: { weeklyDue: '2026-09-08', weeklyDone: false },
    operations: { ordersWaiting: 3, csOpenOver24h: 0, csPending: 6 },
    systems: [{ id: 's1', key: 'crm', score: 1, nextAction: 'Run 3 flows' }, { id: 's2', key: 'team', score: 1, nextAction: 'First hire' }],
    dismissals: [{ rule_code: 'system_critical', entity_id: 's2', until_date: null }],
  };
}

test('rules: the seed snapshot surfaces the right problems in the right order', () => {
  const snapshot = seedSnapshot();
  const alerts = evaluateRules(snapshot);
  const codes = alerts.map(a => a.code);
  // ranked: critical → high → medium → low; revenue 22% behind pace leads
  assert.equal(alerts[0].code, 'revenue_behind');
  assert.equal(alerts[0].severity, 'critical');
  assert.ok(codes.includes('hero_stock_critical'));
  assert.ok(codes.includes('project_at_risk'));
  assert.ok(codes.includes('tasks_overdue_urgent'));
  assert.ok(codes.includes('content_behind'));
  assert.ok(codes.includes('aov_below_target'));
  assert.ok(codes.includes('cvr_below_target'));
  assert.ok(codes.includes('kr_off_track'));
  assert.equal(alerts.filter(a => a.code === 'system_critical').length, 1); // one dismissed
  const sevs = alerts.map(a => a.severity);
  assert.deepEqual(sevs, [...sevs].sort((a, b) => ({ critical: 0, high: 1, medium: 2, low: 3 })[a] - ({ critical: 0, high: 1, medium: 2, low: 3 })[b]));
  const summary = executiveSummary(snapshot, alerts);
  assert.ok(summary.length >= 3 && summary.length <= 5);
  assert.equal(summary[0].code, 'summary.revenue_behind');
});

test('unknown cost is unknown, never zero', () => {
  // Showmore carries no cost, so imported products arrive with cost = null.
  assert.equal(productMarginPct(1000, 400), 60);
  assert.equal(productMarginPct(1000, 0), 100);      // a real zero cost is still 100%
  assert.equal(productMarginPct(1000, null), null);  // unknown must not read as 100%
  assert.equal(productMarginPct(1000, undefined), null);
  assert.equal(productMarginPct(0, 400), null);
  assert.equal(productMarginPct(null, 400), null);

  // Valuation reports what it could not value instead of silently counting it as 0.
  const mixed = inventoryValuation([
    { onHand: 10, unitCost: 100 },   // 1000
    { onHand: 5, unitCost: 200 },    // 1000
    { onHand: 7, unitCost: null },   // unknown, holds stock
    { onHand: 0, unitCost: null },   // unknown but empty — not a gap worth reporting
  ]);
  assert.deepEqual(mixed, { value: 2000, uncostedProducts: 1, uncostedUnits: 7, complete: false });

  const full = inventoryValuation([{ onHand: 10, unitCost: 100 }, { onHand: 2, unitCost: 50 }]);
  assert.deepEqual(full, { value: 1100, uncostedProducts: 0, uncostedUnits: 0, complete: true });
  assert.equal(full.complete, true, 'a fully costed catalogue still reports a number');
});

/** A snapshot with every rule quiet, so each test below only fires the rule it is about. */
function quietSnapshot(): RulesSnapshot {
  return {
    asOf: '2026-09-05',
    revenue: computePacing({ target: 100, actual: 50, periodStart: '2026-09-01', periodEnd: '2026-09-30', asOf: '2026-09-16' }),
    aov: { current: null, previous: null, target: null },
    cvr: { current: null, target: null },
    heroProducts: [], incomingLate: [], projects: [],
    tasks: { overdueUrgent: 0, overdueHigh: 0, blocked: 0 },
    content: { publishedThisWeek: 20, weeklyTarget: 20, weekElapsedFraction: 1, publishedLast3Days: 9, publishedLast7Days: 20 },
    ads: { zeroOrMissingDays: 0, prior14DayAverage: 3200 },
    ordersPerDay: { last7: 22, prev28: 22 },
    keyResults: [], reviews: { weeklyDue: null, weeklyDone: true },
    operations: { ordersWaiting: 0, csOpenOver24h: 0, csPending: 0 },
    systems: [], dismissals: [],
  };
}
const codesOf = (s: RulesSnapshot) => evaluateRules(s).map(a => a.code);
const find = (s: RulesSnapshot, code: string) => evaluateRules(s).find(a => a.code === code);

test('rule: content_output_stopped fires on a stall or a halved week', () => {
  const base = quietSnapshot();
  assert.ok(!codesOf(base).includes('content_output_stopped'), 'healthy output stays quiet');

  // nothing published for three days, even though the week looks fine
  const stalled = quietSnapshot();
  stalled.content.publishedLast3Days = 0;
  assert.equal(find(stalled, 'content_output_stopped')?.severity, 'high');

  // still posting, but under half the weekly target across seven days
  const halved = quietSnapshot();
  halved.content.publishedLast7Days = 9; // target 20 → under 50%
  assert.ok(codesOf(halved).includes('content_output_stopped'));

  // exactly half is not "stopped"
  const atHalf = quietSnapshot();
  atHalf.content.publishedLast7Days = 10;
  assert.ok(!codesOf(atHalf).includes('content_output_stopped'));
});

test('rule: ad_spend_stopped needs a prior spend history', () => {
  const stopped = quietSnapshot();
  stopped.ads = { zeroOrMissingDays: 3, prior14DayAverage: 3200 };
  assert.equal(find(stopped, 'ad_spend_stopped')?.severity, 'high');
  assert.deepEqual(find(stopped, 'ad_spend_stopped')?.params, { days: 3, average: 3200 });

  // two days off is not a stop
  const brief = quietSnapshot();
  brief.ads = { zeroOrMissingDays: 2, prior14DayAverage: 3200 };
  assert.ok(!codesOf(brief).includes('ad_spend_stopped'));

  // never spent anything: silence, not an alert about stopping
  const neverRan = quietSnapshot();
  neverRan.ads = { zeroOrMissingDays: 30, prior14DayAverage: 0 };
  assert.ok(!codesOf(neverRan).includes('ad_spend_stopped'));
});

test('rule: orders_per_day_declining is the leading indicator, critical at 30%', () => {
  const mild = quietSnapshot();
  mild.ordersPerDay = { last7: 18, prev28: 22 };   // -18.2%
  assert.ok(!codesOf(mild).includes('orders_per_day_declining'), 'under 20% is noise');

  const high = quietSnapshot();
  high.ordersPerDay = { last7: 17, prev28: 22 };   // -22.7%
  assert.equal(find(high, 'orders_per_day_declining')?.severity, 'high');

  const critical = quietSnapshot();
  critical.ordersPerDay = { last7: 15, prev28: 22 }; // -31.8%
  assert.equal(find(critical, 'orders_per_day_declining')?.severity, 'critical');

  // no history yet → no claim
  const noHistory = quietSnapshot();
  noHistory.ordersPerDay = { last7: 5, prev28: null };
  assert.ok(!codesOf(noHistory).includes('orders_per_day_declining'));
});

test('rules: the real August 2026 collapse would have surfaced within days', () => {
  // July: 928 orders over 31 days = 29.9/day. August: 443 over 31 = 14.3/day.
  // Posting and ad spend both stopped; AOV actually rose, so the loss was volume.
  const s = quietSnapshot();
  s.content = { publishedThisWeek: 0, weeklyTarget: 20, weekElapsedFraction: 1, publishedLast3Days: 0, publishedLast7Days: 0 };
  s.ads = { zeroOrMissingDays: 6, prior14DayAverage: 3200 };
  s.ordersPerDay = { last7: 14.3, prev28: 29.9 };

  const alerts = evaluateRules(s);
  const codes = alerts.map(a => a.code);
  assert.ok(codes.includes('content_output_stopped'));
  assert.ok(codes.includes('ad_spend_stopped'));
  assert.ok(codes.includes('orders_per_day_declining'));

  // the volume collapse (-52%) outranks the two causes, and leads the list
  assert.equal(alerts[0].code, 'orders_per_day_declining');
  assert.equal(alerts[0].severity, 'critical');
  assert.equal(alerts[0].params.pct, 52);
});

test('rules: an unknown CVR is silent, not a 0% failure', () => {
  // Before Google Analytics was installed there are no sessions at all. The rule must
  // stay quiet rather than report "CVR 0%, below the 2% target" every day.
  const alerts = evaluateRules({ ...seedSnapshot(), cvr: { current: null, target: 2 } });
  assert.equal(alerts.filter(a => a.code === 'cvr_below_target').length, 0);
  // A real measurement below target still fires.
  const firing = evaluateRules({ ...seedSnapshot(), cvr: { current: 1.3, target: 2 } });
  assert.equal(firing.filter(a => a.code === 'cvr_below_target').length, 1);
});
