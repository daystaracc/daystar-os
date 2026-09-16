import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone, extractCustomerOrders, aggregateCustomers } from '../customerAggregation';
import { hashPhone } from '../customerHash.server';

const HEADER = ['訂單編號', '訂單狀態', '訂購人', '訂購人電話', '總額', '付款時間'];
const row = (o: Partial<Record<string, unknown>>) => HEADER.map(h => o[h] ?? null);
const SALT = 'test-salt';
// `extractCustomerOrders` takes a hash function, not a salt (see the 2026-09-15
// note in customerAggregation.ts — this is what lets the client preview use a
// non-cryptographic function instead of `node:crypto`, which has no browser build).
const hash = (n: string) => hashPhone(n, SALT);

test('normalizePhone: different formats of the same number normalize identically', () => {
  assert.equal(normalizePhone('0912345678'), '0912345678');
  assert.equal(normalizePhone('0912-345-678'), '0912345678');
  assert.equal(normalizePhone('+886 912 345 678'), '0912345678');
  assert.equal(normalizePhone('886912345678'), '0912345678');
  assert.equal(normalizePhone('(04) 1234-5678'), '0412345678'); // landline, kept as-is once digits-only
});

test('normalizePhone: unparseable input returns null, never a guess', () => {
  assert.equal(normalizePhone(''), null);
  assert.equal(normalizePhone('   '), null);
  assert.equal(normalizePhone('123'), null); // too short to be real
  assert.equal(normalizePhone('N/A'), null);
});

test('hashPhone: deterministic per salt, different salts never collide', () => {
  const a = hashPhone('0912345678', SALT);
  const b = hashPhone('0912345678', SALT);
  const c = hashPhone('0912345678', 'different-salt');
  assert.equal(a, b);
  assert.notEqual(a, c);
  // the hash must never just be the phone number itself, however formatted
  assert.ok(!a.includes('0912345678'));
});

test('extractCustomerOrders: same phone in different formats hashes to the same value, so orders group', () => {
  const { orders, warnings } = extractCustomerOrders([
    HEADER,
    row({ 訂單編號: '260831092812387156', 訂單狀態: '已完成', 訂購人: 'Amy', 訂購人電話: '0912-345-678', 總額: 500, 付款時間: '2026/08/31' }),
    row({ 訂單編號: '260901120000000002', 訂單狀態: '已完成', 訂購人: 'Amy', 訂購人電話: '+886 912 345 678', 總額: 300, 付款時間: '2026/09/01' }),
  ], hash);
  assert.equal(warnings.length, 0);
  assert.equal(orders.length, 2);
  assert.equal(orders[0].phoneHash, orders[1].phoneHash);
  assert.ok(orders[0].phoneHash);
});

test('extractCustomerOrders: excluded statuses and missing phone are handled the same as revenue', () => {
  const { orders } = extractCustomerOrders([
    HEADER,
    row({ 訂單編號: '260901130000000003', 訂單狀態: '已棄單', 訂購人電話: '0912345678', 總額: 999 }), // excluded by status
    row({ 訂單編號: '260901140000000004', 訂單狀態: '已完成', 訂購人電話: '', 總額: 200, 付款時間: '2026/09/01' }), // no phone at all
    row({ 訂單編號: '260901150000000005', 訂單狀態: '已完成', 訂購人電話: '0987654321', 總額: 400, 付款時間: '2026/09/01' }), // fine
  ], hash);
  assert.equal(orders.length, 2); // the abandoned order never appears at all
  const noPhoneOrder = orders.find(o => o.orderId === '260901140000000004');
  assert.equal(noPhoneOrder?.phoneHash, null); // present, but with no phone hash — not fabricated, not dropped
});

test('extractCustomerOrders: multi-line orders collapse to one row, same as parseShowmore', () => {
  const { orders } = extractCustomerOrders([
    HEADER,
    row({ 訂單編號: '260831092812387156', 訂單狀態: '已完成', 訂購人電話: '0912345678', 總額: 500, 付款時間: '2026/08/31' }),
    row({ 訂單編號: '260831092812387156', 訂單狀態: '已完成', 訂購人電話: '0912345678', 總額: 300 }), // second line, same order
  ], hash);
  assert.equal(orders.length, 1);
  assert.equal(orders[0].amount, 800);
});

test('extractCustomerOrders: missing 訂購人電話 column warns rather than crashing', () => {
  const { orders, warnings } = extractCustomerOrders([
    ['訂單編號', '訂單狀態', '總額'],
    ['260831092812387156', '已完成', '500'],
  ], hash);
  assert.equal(orders.length, 1);
  assert.equal(orders[0].phoneHash, null);
  assert.ok(warnings.some(w => w.includes('訂購人電話')));
});

test('aggregateCustomers: groups by phone hash, sums spend, tracks first/last order date', () => {
  const { orders } = extractCustomerOrders([
    HEADER,
    row({ 訂單編號: '1', 訂單狀態: '已完成', 訂購人: 'Amy', 訂購人電話: '0912345678', 總額: 500, 付款時間: '2026/08/01' }),
    row({ 訂單編號: '2', 訂單狀態: '已完成', 訂購人: 'Amy', 訂購人電話: '0912345678', 總額: 300, 付款時間: '2026/09/01' }),
    row({ 訂單編號: '3', 訂單狀態: '已完成', 訂購人: 'Bo', 訂購人電話: '0987654321', 總額: 200, 付款時間: '2026/08/15' }),
  ], hash);
  const customers = aggregateCustomers(orders);
  assert.equal(customers.length, 2);
  const amy = customers.find(c => c.name === 'Amy')!;
  assert.equal(amy.ordersCount, 2);
  assert.equal(amy.totalSpent, 800);
  assert.equal(amy.firstOrderAt, '2026-08-01');
  assert.equal(amy.lastOrderAt, '2026-09-01');
  // Amy outspends Bo, so she sorts first
  assert.equal(customers[0].name, 'Amy');
});

test('aggregateCustomers: a returned order still counts toward total_spent, same as revenue gross', () => {
  const { orders } = extractCustomerOrders([
    HEADER,
    row({ 訂單編號: '1', 訂單狀態: '已退貨', 訂購人電話: '0912345678', 總額: 500, 付款時間: '2026/08/01' }),
  ], hash);
  const customers = aggregateCustomers(orders);
  assert.equal(customers.length, 1);
  assert.equal(customers[0].totalSpent, 500);
});

test('aggregateCustomers: orders with no phone hash are excluded, not grouped into a fake bucket', () => {
  const { orders } = extractCustomerOrders([
    HEADER,
    row({ 訂單編號: '1', 訂單狀態: '已完成', 總額: 500, 付款時間: '2026/08/01' }), // no phone
    row({ 訂單編號: '2', 訂單狀態: '已完成', 總額: 300, 付款時間: '2026/08/02' }), // no phone
  ], hash);
  assert.equal(aggregateCustomers(orders).length, 0);
});
