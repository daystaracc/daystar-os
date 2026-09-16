import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseShowmoreProducts, attributeKeyFor, PRODUCT_COL } from '../showmoreProducts';

/** The columns the parser reads. The real export has 48; order does not matter. */
const HEADER = [
  PRODUCT_COL.productId, PRODUCT_COL.variantId, PRODUCT_COL.name, PRODUCT_COL.sku,
  PRODUCT_COL.level1Name, PRODUCT_COL.level1,
  PRODUCT_COL.level2Name, PRODUCT_COL.level2,
  PRODUCT_COL.level3Name, PRODUCT_COL.level3,
  PRODUCT_COL.listPrice, PRODUCT_COL.price, PRODUCT_COL.cost, PRODUCT_COL.stock, PRODUCT_COL.weight,
];
const row = (o: Partial<Record<string, unknown>>) => HEADER.map(h => o[h] ?? '');

test('attributeKeyFor folds the inconsistent level names, and only those', () => {
  for (const n of ['顏色', 'Color', 'COLOR', 'Colore']) assert.equal(attributeKeyFor(n), 'color');
  for (const n of ['尺寸', 'SIZE', 'Size']) assert.equal(attributeKeyFor(n), 'size');
  for (const n of ['寬度', 'Width 寬度']) assert.equal(attributeKeyFor(n), 'width');
  for (const n of ['長度', 'Length 長度', '長短']) assert.equal(attributeKeyFor(n), 'length');
  assert.equal(attributeKeyFor('數量'), 'quantity');
  assert.equal(attributeKeyFor('款式'), 'style');
  assert.equal(attributeKeyFor('字母'), 'letter');
  // Real values from the export that are not attribute names — never guessed.
  for (const n of ['Mystery Box 2.0', 'TURCKER HAT', '款式尺寸', '項鍊']) {
    assert.equal(attributeKeyFor(n), null);
  }
});

test('parseShowmoreProducts: a product spans rows and only the first one is labelled', () => {
  // This is the real shape: 8MM DIAMOND STUD EARRINGS is NT$480 a pair, NT$249 a single,
  // and the second variant's row carries no product_id, no 商品名稱 and no 樣式名稱.
  const r = parseShowmoreProducts([
    HEADER,
    row({ [PRODUCT_COL.productId]: 'product-A', [PRODUCT_COL.variantId]: 'variant-A1', [PRODUCT_COL.name]: '8MM DIAMOND STUD EARRINGS',
          [PRODUCT_COL.level1Name]: '款式', [PRODUCT_COL.level1]: 'Pair (一對）', [PRODUCT_COL.price]: 480, [PRODUCT_COL.cost]: 0, [PRODUCT_COL.stock]: 12 }),
    row({ [PRODUCT_COL.variantId]: 'variant-A2', [PRODUCT_COL.level1]: 'Single (單支）', [PRODUCT_COL.price]: 249, [PRODUCT_COL.cost]: 0, [PRODUCT_COL.stock]: 4 }),
    row({ [PRODUCT_COL.productId]: 'product-B', [PRODUCT_COL.variantId]: 'variant-B1', [PRODUCT_COL.name]: 'SNAKE BONE NECKLACE 細蛇骨項鍊',
          [PRODUCT_COL.level1Name]: '寬度', [PRODUCT_COL.level1]: '1.2MM',
          [PRODUCT_COL.level2Name]: '長度', [PRODUCT_COL.level2]: '50CM',
          [PRODUCT_COL.price]: 399, [PRODUCT_COL.cost]: 13, [PRODUCT_COL.stock]: 9 }),
    row({ [PRODUCT_COL.variantId]: 'variant-B2', [PRODUCT_COL.level1]: '1.2MM', [PRODUCT_COL.level2]: '55CM',
          [PRODUCT_COL.price]: 429, [PRODUCT_COL.cost]: 14, [PRODUCT_COL.stock]: 3 }),
  ]);

  assert.equal(r.totals.products, 2);
  assert.equal(r.totals.variants, 4);
  assert.equal(r.totals.onHand, 28);

  // the continuation row belongs to the product above it, not to a nameless product
  assert.deepEqual(r.products.map(p => [p.name, p.variants.length]), [
    ['8MM DIAMOND STUD EARRINGS', 2],
    ['SNAKE BONE NECKLACE 細蛇骨項鍊', 2],
  ]);
  assert.equal(r.warnings.filter(w => w.includes('商品名稱')).length, 0);

  // the level *name* carries down from the first row; the *value* is per row
  const b2 = r.products[1].variants[1];
  assert.deepEqual(b2.attributes, [
    { level: 1, rawName: '寬度', key: 'width', value: '1.2MM' },
    { level: 2, rawName: '長度', key: 'length', value: '55CM' },
  ]);
  assert.equal(b2.label, '1.2MM / 55CM');

  // variants of one product can carry different prices — that is why stock is variant-grain
  assert.deepEqual(r.products[0].variants.map(v => v.price), [480, 249]);
});

test('parseShowmoreProducts: 成本 0 or blank is unknown, never a cost of zero', () => {
  const r = parseShowmoreProducts([
    HEADER,
    row({ [PRODUCT_COL.productId]: 'p1', [PRODUCT_COL.variantId]: 'v1', [PRODUCT_COL.name]: 'A', [PRODUCT_COL.cost]: 13, [PRODUCT_COL.stock]: 1 }),
    row({ [PRODUCT_COL.productId]: 'p2', [PRODUCT_COL.variantId]: 'v2', [PRODUCT_COL.name]: 'B', [PRODUCT_COL.cost]: 0, [PRODUCT_COL.stock]: 2 }),
    row({ [PRODUCT_COL.productId]: 'p3', [PRODUCT_COL.variantId]: 'v3', [PRODUCT_COL.name]: 'C', [PRODUCT_COL.cost]: '', [PRODUCT_COL.stock]: 3 }),
  ]);
  assert.deepEqual(r.products.map(p => p.variants[0].cost), [13, null, null]);
  assert.equal(r.totals.costed, 1);
  assert.equal(r.totals.uncosted, 2);
});

test('parseShowmoreProducts: unrecognised level names stay free text and are reported', () => {
  const r = parseShowmoreProducts([
    HEADER,
    row({ [PRODUCT_COL.productId]: 'p1', [PRODUCT_COL.variantId]: 'v1', [PRODUCT_COL.name]: 'Mystery Box',
          [PRODUCT_COL.level1Name]: 'Mystery Box 2.0', [PRODUCT_COL.level1]: 'B 款', [PRODUCT_COL.stock]: 5 }),
    row({ [PRODUCT_COL.productId]: 'p2', [PRODUCT_COL.variantId]: 'v2', [PRODUCT_COL.name]: 'Ring',
          [PRODUCT_COL.level1Name]: 'COLOR', [PRODUCT_COL.level1]: 'GOLD 金', [PRODUCT_COL.stock]: 7 }),
  ]);
  assert.deepEqual(r.products[0].variants[0].attributes, [
    { level: 1, rawName: 'Mystery Box 2.0', key: null, value: 'B 款' },
  ]);
  assert.equal(r.products[1].variants[0].attributes[0].key, 'color');
  assert.deepEqual(r.attributeNames, [
    { rawName: 'COLOR', key: 'color', variants: 1 },
    { rawName: 'Mystery Box 2.0', key: null, variants: 1 },
  ]);
  assert.ok(r.warnings.some(w => w.includes('Mystery Box 2.0')));
});

test('parseShowmoreProducts: a product with no variant levels gets one unlabelled variant', () => {
  const r = parseShowmoreProducts([
    HEADER,
    row({ [PRODUCT_COL.productId]: 'p1', [PRODUCT_COL.variantId]: 'v1', [PRODUCT_COL.name]: 'Monaco Glasses', [PRODUCT_COL.price]: 1280, [PRODUCT_COL.stock]: 6 }),
  ]);
  assert.equal(r.totals.variants, 1);
  assert.deepEqual(r.products[0].variants[0].attributes, []);
  assert.equal(r.products[0].variants[0].label, '');
});

test('parseShowmoreProducts: duplicate product names are reported, not merged', () => {
  // Real case: DIAMOND EARRINGS 8MM E04 appears under two names that are probably
  // one product. Matching order lines on name alone would be wrong, so it is surfaced.
  const r = parseShowmoreProducts([
    HEADER,
    row({ [PRODUCT_COL.productId]: 'p1', [PRODUCT_COL.variantId]: 'v1', [PRODUCT_COL.name]: 'SAME NAME', [PRODUCT_COL.stock]: 1 }),
    row({ [PRODUCT_COL.productId]: 'p2', [PRODUCT_COL.variantId]: 'v2', [PRODUCT_COL.name]: 'SAME NAME', [PRODUCT_COL.stock]: 1 }),
  ]);
  assert.equal(r.totals.products, 2);
  assert.deepEqual(r.duplicateNames, [{ name: 'SAME NAME', showmoreProductIds: ['p1', 'p2'] }]);
  assert.ok(r.warnings.some(w => w.includes('more than one product')));
});

test('parseShowmoreProducts: a non-Showmore sheet is refused rather than half-read', () => {
  const r = parseShowmoreProducts([['name', 'price'], ['A', '100']]);
  assert.equal(r.totals.products, 0);
  assert.ok(r.warnings[0].includes('is this a Showmore product export?'));
});

test('parseShowmoreProducts: rows with no variant_id are skipped, not counted', () => {
  const r = parseShowmoreProducts([
    HEADER,
    row({ [PRODUCT_COL.productId]: 'p1', [PRODUCT_COL.variantId]: 'v1', [PRODUCT_COL.name]: 'A', [PRODUCT_COL.stock]: 4 }),
    row({ [PRODUCT_COL.stock]: 999 }), // trailing junk row
  ]);
  assert.equal(r.rows.skippedNoVariantId, 1);
  assert.equal(r.totals.variants, 1);
  assert.equal(r.totals.onHand, 4);
});
