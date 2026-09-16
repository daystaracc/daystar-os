import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planRevenueImport, type ExistingRevenueDay } from '../revenueImportPlan';
import type { DayChannelTotals } from '../showmore';

const day = (o: Partial<DayChannelTotals> & { date: string }): DayChannelTotals =>
  ({ channelKey: 'website', orders: 1, gross: 1000, refunds: 0, returnedOrders: 0, ...o });

test('planRevenueImport: a day with no existing row is created', () => {
  const plan = planRevenueImport([day({ date: '2026-09-01' })], []);
  assert.equal(plan.summary.created, 1);
  assert.equal(plan.summary.updated, 0);
  assert.equal(plan.summary.unchanged, 0);
  assert.equal(plan.days[0].isNew, true);
  assert.equal(plan.days[0].changed, true);
});

test('planRevenueImport: re-importing the identical file is a no-op, visibly', () => {
  const existing: ExistingRevenueDay[] = [{ date: '2026-09-01', channelKey: 'website', orders: 3, gross_revenue: 4500, refunds: 0 }];
  const plan = planRevenueImport([day({ date: '2026-09-01', orders: 3, gross: 4500, refunds: 0 })], existing);
  assert.equal(plan.summary.created, 0);
  assert.equal(plan.summary.updated, 0);
  assert.equal(plan.summary.unchanged, 1);
  assert.equal(plan.days[0].isNew, false);
  assert.equal(plan.days[0].changed, false);
});

test('planRevenueImport: a corrected export (e.g. a late return) shows as updated, not created', () => {
  const existing: ExistingRevenueDay[] = [{ date: '2026-09-01', channelKey: 'website', orders: 3, gross_revenue: 4500, refunds: 0 }];
  const plan = planRevenueImport([day({ date: '2026-09-01', orders: 3, gross: 4500, refunds: 900 })], existing);
  assert.equal(plan.summary.created, 0);
  assert.equal(plan.summary.updated, 1);
  assert.equal(plan.days[0].changed, true);
});

test('planRevenueImport: different channels on the same date are independent rows', () => {
  const existing: ExistingRevenueDay[] = [{ date: '2026-09-01', channelKey: 'website', orders: 3, gross_revenue: 4500, refunds: 0 }];
  const plan = planRevenueImport([
    day({ date: '2026-09-01', channelKey: 'website', orders: 3, gross: 4500 }),
    day({ date: '2026-09-01', channelKey: 'shopee', orders: 2, gross: 1200 }),
  ], existing);
  assert.equal(plan.summary.unchanged, 1);
  assert.equal(plan.summary.created, 1);
  assert.deepEqual(plan.days.map(d => d.channelKey), ['website', 'shopee']);
});

test('planRevenueImport: totals sum every parsed day regardless of new/changed/unchanged', () => {
  const plan = planRevenueImport([
    day({ date: '2026-09-01', orders: 3, gross: 4500, refunds: 100 }),
    day({ date: '2026-09-02', orders: 5, gross: 6200, refunds: 0 }),
  ], []);
  assert.equal(plan.summary.totalOrders, 8);
  assert.equal(plan.summary.totalGross, 10700);
  assert.equal(plan.summary.totalRefunds, 100);
});
