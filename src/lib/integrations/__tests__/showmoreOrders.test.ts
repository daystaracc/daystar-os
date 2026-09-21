import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  syncOrders, matchCatalogueItem, isExcludedStatus,
  type ShowmoreApiOrder, type ShowmoreOrderItem, type CatalogueEntry,
} from '../showmoreOrders';

const item = (o: Partial<ShowmoreOrderItem>): ShowmoreOrderItem =>
  ({ sku: null, productName: 'A', variantName: null, quantity: 1, subtotalPrice: 100, ...o });

const order = (o: Partial<ShowmoreApiOrder> & { orderNumber: string }): ShowmoreApiOrder =>
  ({ createdAt: '2026-09-05T10:00:00+08:00', totalPrice: 100, orderStatus: 2, items: [], ...o });

const cat = (o: Partial<CatalogueEntry> & { variantId: string }): CatalogueEntry =>
  ({ productId: 'p1', showmoreSku: null, productName: 'A', variantName: 'A', ...o });

test('isExcludedStatus: only 棄單審核中(3) and 已棄單(4) are excluded', () => {
  assert.equal(isExcludedStatus(3), true);
  assert.equal(isExcludedStatus(4), true);
  assert.equal(isExcludedStatus(0), false);
  assert.equal(isExcludedStatus(6), false); // returned still counts
});

test('matchCatalogueItem: SKU wins even when the name text has drifted', () => {
  const catalogue = [
    cat({ variantId: 'v1', showmoreSku: 'SM-1', productName: 'Old Name', variantName: 'Old Name' }),
    cat({ variantId: 'v2', showmoreSku: null, productName: 'A', variantName: 'A' }),
  ];
  const match = matchCatalogueItem(item({ sku: 'SM-1', productName: 'A', variantName: 'A' }), catalogue);
  assert.equal(match?.variantId, 'v1');
});

test('matchCatalogueItem: falls back to exact product+variant name', () => {
  const catalogue = [
    cat({ variantId: 'v1', productName: 'Chain', variantName: '黑色/S' }),
    cat({ variantId: 'v2', productName: 'Chain', variantName: '黑色/M' }),
  ];
  const match = matchCatalogueItem(item({ productName: 'Chain', variantName: '黑色/M' }), catalogue);
  assert.equal(match?.variantId, 'v2');
});

test('matchCatalogueItem: no variant name on the order line matches only when the product has exactly one variant', () => {
  const single = [cat({ variantId: 'v1', productName: 'Solo', variantName: 'Solo' })];
  assert.equal(matchCatalogueItem(item({ productName: 'Solo', variantName: null }), single)?.variantId, 'v1');

  const multi = [
    cat({ variantId: 'v1', productName: 'Chain', variantName: '黑色/S' }),
    cat({ variantId: 'v2', productName: 'Chain', variantName: '黑色/M' }),
  ];
  assert.equal(matchCatalogueItem(item({ productName: 'Chain', variantName: null }), multi), null);
});

test('matchCatalogueItem: no match at all returns null, never a guess', () => {
  const catalogue = [cat({ variantId: 'v1', productName: 'Chain', variantName: '黑色/S' })];
  assert.equal(matchCatalogueItem(item({ productName: 'Unknown Product' }), catalogue), null);
});

test('syncOrders: excluded orders are dropped from both days and totals', () => {
  const r = syncOrders([
    order({ orderNumber: '1', orderStatus: 2, totalPrice: 500 }),
    order({ orderNumber: '2', orderStatus: 4, totalPrice: 900 }), // 已棄單
    order({ orderNumber: '3', orderStatus: 3, totalPrice: 100 }), // 棄單審核中
  ], []);
  assert.equal(r.days.length, 1);
  assert.equal(r.days[0].orders, 1);
  assert.equal(r.days[0].gross, 500);
  assert.equal(r.totals.ordersIncluded, 1);
  assert.equal(r.totals.ordersExcluded, 2);
});

test('syncOrders: a returned order counts in orders/gross AND refunds, on its own date', () => {
  const r = syncOrders([
    order({ orderNumber: '1', orderStatus: 2, totalPrice: 500, createdAt: '2026-09-05T09:00:00+08:00' }),
    order({ orderNumber: '2', orderStatus: 6, totalPrice: 300, createdAt: '2026-09-05T11:00:00+08:00' }),
  ], []);
  assert.equal(r.days.length, 1);
  const day = r.days[0];
  assert.equal(day.orders, 2);
  assert.equal(day.gross, 800);
  assert.equal(day.refunds, 300);
  assert.equal(day.returnedOrders, 1);
});

test('syncOrders: orders group into separate day totals by their own date', () => {
  const r = syncOrders([
    order({ orderNumber: '1', createdAt: '2026-09-05T23:59:00+08:00', totalPrice: 100 }),
    order({ orderNumber: '2', createdAt: '2026-09-06T00:01:00+08:00', totalPrice: 200 }),
  ], []);
  assert.deepEqual(r.days.map(d => [d.date, d.orders, d.gross]), [
    ['2026-09-05', 1, 100],
    ['2026-09-06', 1, 200],
  ]);
});

test('syncOrders: matched items roll up into product_sales_daily candidates; unmatched land in the log, not silently dropped', () => {
  const catalogue = [cat({ variantId: 'v1', showmoreSku: 'SM-1', productName: 'Chain', variantName: '黑色/S' })];
  const r = syncOrders([
    order({
      orderNumber: '1', totalPrice: 300, createdAt: '2026-09-05T10:00:00+08:00',
      items: [
        item({ sku: 'SM-1', productName: 'Chain', variantName: '黑色/S', quantity: 2, subtotalPrice: 200 }),
        item({ sku: null, productName: 'Mystery Item', variantName: null, quantity: 1, subtotalPrice: 100 }),
      ],
    }),
  ], catalogue);

  assert.equal(r.products.length, 1);
  assert.equal(r.products[0].variantId, 'v1');
  assert.equal(r.products[0].units, 2);
  assert.equal(r.products[0].revenue, 200);

  assert.equal(r.unmatched.length, 1);
  assert.equal(r.unmatched[0].productName, 'Mystery Item');
  assert.equal(r.unmatched[0].orderNumber, '1');

  // The day total is unaffected by the miss — it comes from the order, not the matched lines.
  assert.equal(r.days[0].gross, 300);
});

test('syncOrders: a returned order\'s items still count toward product totals (only day-level refunds reflect the return)', () => {
  const catalogue = [cat({ variantId: 'v1', showmoreSku: 'SM-1', productName: 'Chain', variantName: '黑色/S' })];
  const r = syncOrders([
    order({
      orderNumber: '1', orderStatus: 6, totalPrice: 200, createdAt: '2026-09-05T10:00:00+08:00',
      items: [item({ sku: 'SM-1', productName: 'Chain', variantName: '黑色/S', quantity: 1, subtotalPrice: 200 })],
    }),
  ], catalogue);
  assert.equal(r.products[0].units, 1);
  assert.equal(r.days[0].refunds, 200);
});
