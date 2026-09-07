import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePacing, monthBounds, weekBounds, previousMonthToDate } from '../pacing';
import { formatTWD, formatTWDCompact, formatDelta, pctChange } from '../format';
import { aov, contributionMargin, adMetrics, conversionRate } from '../finance';
import { weeksOfSupply, stockStatus, abcClassify, reorderSuggestion, sellThroughPct, inventoryValuation, productMarginPct } from '../inventory';
import { keyResultProgress, keyResultStatus, projectHealth } from '../goals';
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

test('health: score and company status', () => {
  const systems = [3,2,2,2,2,1,2,2,2,1,2].map(score => ({ score }));
  assert.deepEqual(healthScore(systems), { total: 21, max: 55, pct: (21 / 55) * 100 });
  assert.equal(companyStatus({ revenuePace: 'behind', criticalAlerts: 0, highAlerts: 1, krOffTrack: 1, krAtRisk: 2 }), 'at_risk');
  assert.equal(companyStatus({ revenuePace: 'behind', criticalAlerts: 1, highAlerts: 1, krOffTrack: 1, krAtRisk: 2 }), 'off_track');
  assert.equal(companyStatus({ revenuePace: 'on_pace', criticalAlerts: 0, highAlerts: 1, krOffTrack: 0, krAtRisk: 1 }), 'on_track');
});

test('rules: the seed snapshot surfaces the right problems in the right order', () => {
  const snapshot: RulesSnapshot = {
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
    content: { publishedThisWeek: 11, weeklyTarget: 20, weekElapsedFraction: 6 / 7 },
    keyResults: [{ id: 'kr1', title: 'Repeat revenue ≥ 15%', start_value: 8, current_value: 9.5, target_value: 15, deadline: '2026-12-31', periodStart: '2026-04-01' }],
    reviews: { weeklyDue: '2026-09-08', weeklyDone: false },
    operations: { ordersWaiting: 3, csOpenOver24h: 0, csPending: 6 },
    systems: [{ id: 's1', key: 'crm', score: 1, nextAction: 'Run 3 flows' }, { id: 's2', key: 'team', score: 1, nextAction: 'First hire' }],
    dismissals: [{ rule_code: 'system_critical', entity_id: 's2', until_date: null }],
  };
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
