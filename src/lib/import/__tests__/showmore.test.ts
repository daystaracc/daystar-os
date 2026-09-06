import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseShowmore, dateFromOrderNumber, dateFromPaidAt, channelKeyFor, EXCLUDED_STATUSES, CUSTOMER_COLUMNS, COL } from '../showmore';

/** The columns the parser reads, in the order the real export emits them. */
const HEADER = ['訂單編號', '訂單狀態', '訂購人', '收件人 Email', '商品編號(sku)', '成本', '商品名稱', '款式', '單價', '數量', '總額', '運費', '付款時間', '銷售渠道', '折扣紀錄'];
const row = (o: Partial<Record<string, unknown>>) => HEADER.map(h => o[h] ?? null);

test('dateFromOrderNumber: the YYMMDD prefix is the order date', () => {
  assert.equal(dateFromOrderNumber('260831092812387156'), '2026-08-31');
  assert.equal(dateFromOrderNumber('260906120000000001'), '2026-09-06');
  assert.equal(dateFromOrderNumber('261301000000000000'), null); // month 13
  assert.equal(dateFromOrderNumber('260231000000000000'), null); // 31 Feb
  assert.equal(dateFromOrderNumber('abc'), null);
});

test('dateFromPaidAt and channel mapping', () => {
  assert.equal(dateFromPaidAt('2026/09/05'), '2026-09-05');
  assert.equal(dateFromPaidAt('2026/9/5 13:22'), '2026-09-05');
  assert.equal(dateFromPaidAt(''), null);
  // 銷售渠道 arrives padded in the real export.
  assert.equal(channelKeyFor(' DAYSTAR '), 'website');
  assert.equal(channelKeyFor('Shopee'), 'shopee');
  assert.equal(channelKeyFor('somewhere else'), 'other');
});

test('parseShowmore: groups lines, excludes abandoned orders, totals 總額', () => {
  const r = parseShowmore([
    HEADER,
    // one order, two lines — 總額 is per line and already includes 運費 and discounts
    row({ 訂單編號: '260831092812387156', 訂單狀態: '已完成', 商品名稱: 'A', 款式: 'SILVER/16CM', 單價: 680, 數量: 1, 總額: 749, 運費: 69, 付款時間: '2026/09/05', 銷售渠道: ' DAYSTAR ' }),
    row({ 訂單編號: '260831092812387156', 訂單狀態: '已完成', 商品名稱: 'B', 單價: 200, 數量: 2, 總額: 400, 運費: 69, 銷售渠道: ' DAYSTAR ' }),
    // 貨到付款: no 付款時間 at all — the date must still come from the order number
    row({ 訂單編號: '260901120000000002', 訂單狀態: '新訂單', 商品名稱: 'A', 單價: 500, 數量: 1, 總額: 569, 運費: 69, 銷售渠道: ' DAYSTAR ' }),
    // excluded by status
    row({ 訂單編號: '260901130000000003', 訂單狀態: '已棄單', 商品名稱: 'A', 單價: 900, 數量: 1, 總額: 969, 運費: 69, 銷售渠道: ' DAYSTAR ' }),
    row({ 訂單編號: '260902130000000004', 訂單狀態: '棄單審核中', 商品名稱: 'A', 單價: 100, 數量: 1, 總額: 169, 運費: 69, 銷售渠道: ' DAYSTAR ' }),
    // the trailing product-list block: no 訂單編號
    row({ 商品名稱: 'A', 單價: 680 }),
    row({ 商品名稱: 'B', 單價: 200 }),
  ]);

  assert.equal(r.rows.total, 7); // 3 order lines + 2 excluded orders + 2 trailing product rows
  assert.equal(r.rows.skippedNoOrderNumber, 2);
  assert.equal(r.orders.parsed, 4);
  assert.equal(r.orders.included, 2);

  // 749 + 400 (two lines of one order) + 569
  assert.equal(r.totals.gross, 1718);
  assert.equal(r.totals.orders, 2);
  assert.equal(r.totals.aov, 859);

  assert.deepEqual(r.dateRange, { from: '2026-08-31', to: '2026-09-01' });

  assert.deepEqual(r.orders.excluded.map(e => [e.id, e.reason, e.detail, e.gross]), [
    ['260901130000000003', 'status', '已棄單', 969],
    ['260902130000000004', 'status', '棄單審核中', 169],
  ]);

  // one sales_daily candidate per date per channel
  assert.deepEqual(r.days, [
    { date: '2026-08-31', channelKey: 'website', orders: 1, gross: 1149 },
    { date: '2026-09-01', channelKey: 'website', orders: 1, gross: 569 },
  ]);

  // product_sales_daily candidates keyed by 商品名稱
  assert.deepEqual(r.products, [
    { date: '2026-08-31', productName: 'A', units: 1, revenue: 749 },
    { date: '2026-08-31', productName: 'B', units: 2, revenue: 400 },
    { date: '2026-09-01', productName: 'A', units: 1, revenue: 569 },
  ]);
  assert.deepEqual(r.channels, ['website']);
});

test('parseShowmore: an 18-digit order number keeps full precision', () => {
  // Two orders that collide once rounded to a float (2.6083109281238717e17).
  const a = '260831092812387156';
  const b = '260831092812387157';
  assert.equal(Number(a), Number(b), 'precondition: these are indistinguishable as floats');
  const r = parseShowmore([
    HEADER,
    row({ 訂單編號: a, 訂單狀態: '已完成', 商品名稱: 'A', 數量: 1, 總額: 100, 銷售渠道: 'DAYSTAR' }),
    row({ 訂單編號: b, 訂單狀態: '已完成', 商品名稱: 'A', 數量: 1, 總額: 200, 銷售渠道: 'DAYSTAR' }),
  ]);
  assert.equal(r.orders.parsed, 2, 'must stay two distinct orders');
  assert.equal(r.totals.gross, 300);
});

test('parseShowmore: an order with no derivable date is excluded, not dated arbitrarily', () => {
  const r = parseShowmore([
    HEADER,
    row({ 訂單編號: 'XX0831092812387156', 訂單狀態: '已完成', 商品名稱: 'A', 數量: 1, 總額: 500, 銷售渠道: 'DAYSTAR' }),
  ]);
  assert.equal(r.orders.included, 0);
  assert.deepEqual(r.orders.excluded.map(e => e.reason), ['no-date']);
});

test('parseShowmore: 付款時間 is the fallback when the order number has no date', () => {
  const r = parseShowmore([
    HEADER,
    row({ 訂單編號: 'XX0831092812387156', 訂單狀態: '已完成', 商品名稱: 'A', 數量: 1, 總額: 500, 付款時間: '2026/09/03', 銷售渠道: 'DAYSTAR' }),
  ]);
  assert.equal(r.orders.included, 1);
  assert.equal(r.days[0].date, '2026-09-03');
});

test('parseShowmore: a non-Showmore sheet is refused rather than half-read', () => {
  const r = parseShowmore([['date', 'revenue'], ['2026-09-01', 100]]);
  assert.equal(r.orders.parsed, 0);
  assert.match(r.warnings[0], /訂單編號/);
});

test('customer columns are declared so the importer can drop them', () => {
  for (const c of ['訂購人', '收件人 Email', '地址', '銀行帳號', '訂購人生日', '訂購人電話', '收件人']) {
    assert.ok((CUSTOMER_COLUMNS as readonly string[]).includes(c), `${c} must be dropped on import`);
  }
  // and none of them is something the parser reads
  const read = Object.values(COL) as string[];
  for (const c of CUSTOMER_COLUMNS) assert.ok(!read.includes(c), `${c} must not be read`);
  assert.deepEqual([...EXCLUDED_STATUSES], ['已棄單', '棄單審核中']);
});
