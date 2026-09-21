import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planProductImport, rollUpCost, rollUpPrice, type ExistingState } from '../productImportPlan';
import type { ParsedProduct, ParsedVariant } from '../showmoreProducts';

const variant = (o: Partial<ParsedVariant> & { showmoreVariantId: string }): ParsedVariant => ({
  attributes: [], label: '', sku: null, listPrice: null, price: null, cost: null, onHand: 0, weightKg: null, ...o,
});
const product = (id: string, name: string, variants: ParsedVariant[]): ParsedProduct =>
  ({ showmoreProductId: id, name, variants });
const nothing: ExistingState = { products: [], variants: [], stock: [] };

test('rollUpCost: a product cost only exists when its known variant costs agree', () => {
  assert.equal(rollUpCost([variant({ showmoreVariantId: 'a', cost: 13 }), variant({ showmoreVariantId: 'b', cost: 13 })]), 13);
  // Mixed real costs are not one number, and averaging them would invent one.
  assert.equal(rollUpCost([variant({ showmoreVariantId: 'a', cost: 13 }), variant({ showmoreVariantId: 'b', cost: 14 })]), null);
  // Unknown costs are ignored, not counted as 0.
  assert.equal(rollUpCost([variant({ showmoreVariantId: 'a', cost: 13 }), variant({ showmoreVariantId: 'b', cost: null })]), 13);
  assert.equal(rollUpCost([variant({ showmoreVariantId: 'a', cost: null })]), null);
});

test('rollUpPrice: the headline price is the cheapest variant', () => {
  assert.equal(rollUpPrice([variant({ showmoreVariantId: 'a', price: 480 }), variant({ showmoreVariantId: 'b', price: 249 })]), 249);
  assert.equal(rollUpPrice([variant({ showmoreVariantId: 'a', price: null })]), 0);
});

test('plan: a first import creates everything and books the whole opening stock', () => {
  const plan = planProductImport([
    product('product-A', 'EARRINGS', [
      variant({ showmoreVariantId: 'v1', label: 'Pair', price: 480, cost: 20, onHand: 12 }),
      variant({ showmoreVariantId: 'v2', label: 'Single', price: 249, cost: 10, onHand: 4 }),
    ]),
  ], nothing);

  assert.equal(plan.summary.productsNew, 1);
  assert.equal(plan.summary.variantsNew, 2);
  assert.equal(plan.summary.unitsIn, 16);
  assert.equal(plan.summary.unitsOut, 0);

  // generated SKUs: product then variants hanging off it
  assert.equal(plan.products.create[0].sku, 'DS-0001');
  assert.deepEqual(plan.variants.create.map(v => v.sku), ['DS-0001-01', 'DS-0001-02']);

  // mixed variant costs → no product-level cost
  assert.equal(plan.products.create[0].cost, null);
  assert.equal(plan.products.create[0].price, 249);

  // opening stock is a movement carrying the full quantity, not a write to on_hand
  assert.deepEqual(plan.movements.map(m => [m.variantExternalId, m.quantity, m.countedTo]), [
    ['v1', 12, 12], ['v2', 4, 4],
  ]);
});

test('plan: re-importing the same file changes nothing', () => {
  // The guarantee that makes the import safe to run twice: identity is Showmore's id,
  // and an unchanged quantity produces no movement, so stock cannot double.
  const parsed = [product('product-A', 'EARRINGS', [variant({ showmoreVariantId: 'v1', label: 'Pair', price: 480, cost: 20, onHand: 12 })])];
  const existing: ExistingState = {
    products: [{ id: 'uuid-p', externalId: 'product-A', sku: 'DS-0001' }],
    variants: [{ id: 'uuid-v', productExternalId: 'product-A', externalId: 'v1', sku: 'DS-0001-01' }],
    stock: [{ productExternalId: 'product-A', variantExternalId: 'v1', onHand: 12 }],
  };
  const plan = planProductImport(parsed, existing);

  assert.equal(plan.summary.productsNew, 0);
  assert.equal(plan.summary.productsUpdated, 1);
  assert.equal(plan.summary.variantsNew, 0);
  assert.deepEqual(plan.movements, []);
  assert.equal(plan.summary.variantsUnchanged, 1);
  // it updates in place, keeping the identifiers the rest of the app already uses
  assert.equal(plan.products.update[0].id, 'uuid-p');
  assert.equal(plan.products.update[0].sku, 'DS-0001');
  assert.equal(plan.variants.update[0].id, 'uuid-v');
});

test('plan: a later count books the difference in both directions', () => {
  const parsed = [product('product-A', 'A', [
    variant({ showmoreVariantId: 'v1', onHand: 20 }), // was 12 → +8
    variant({ showmoreVariantId: 'v2', onHand: 1 }),  // was 4  → −3
  ])];
  const existing: ExistingState = {
    products: [{ id: 'p', externalId: 'product-A', sku: 'DS-0001' }],
    variants: [
      { id: 'a', productExternalId: 'product-A', externalId: 'v1', sku: 'DS-0001-01' },
      { id: 'b', productExternalId: 'product-A', externalId: 'v2', sku: 'DS-0001-02' },
    ],
    stock: [
      { productExternalId: 'product-A', variantExternalId: 'v1', onHand: 12 },
      { productExternalId: 'product-A', variantExternalId: 'v2', onHand: 4 },
    ],
  };
  const plan = planProductImport(parsed, existing);
  assert.deepEqual(plan.movements.map(m => [m.variantExternalId, m.quantity, m.countedTo]), [['v1', 8, 20], ['v2', -3, 1]]);
  assert.equal(plan.summary.unitsIn, 8);
  assert.equal(plan.summary.unitsOut, 3);
});

test('plan: generated SKUs continue the existing series instead of colliding', () => {
  const plan = planProductImport(
    [product('product-NEW', 'New', [variant({ showmoreVariantId: 'v1' })])],
    { products: [{ id: 'p', externalId: 'product-OLD', sku: 'DS-0007' }], variants: [], stock: [] },
  );
  assert.equal(plan.products.create[0].sku, 'DS-0008');
});

test('plan: attributes are stored under their folded key, free text under the raw name', () => {
  const plan = planProductImport([
    product('p1', 'Ring', [variant({
      showmoreVariantId: 'v1',
      label: 'GOLD 金 / 8',
      attributes: [
        { level: 1, rawName: 'COLOR', key: 'color', value: 'GOLD 金' },
        { level: 2, rawName: 'Mystery Box 2.0', key: null, value: '8' },
      ],
    })]),
  ], nothing);
  assert.deepEqual(plan.variants.create[0].attributes, { color: 'GOLD 金', 'Mystery Box 2.0': '8' });
  assert.equal(plan.variants.create[0].name, 'GOLD 金 / 8');
});

test('plan: Showmore\'s own SKU is carried onto the variant, separate from our generated one', () => {
  const plan = planProductImport([
    product('product-A', 'EARRINGS', [
      variant({ showmoreVariantId: 'v1', sku: 'SM-1234' }),
      variant({ showmoreVariantId: 'v2', sku: null }),
    ]),
  ], nothing);
  assert.equal(plan.variants.create[0].showmoreSku, 'SM-1234');
  assert.notEqual(plan.variants.create[0].showmoreSku, plan.variants.create[0].sku);
  // Blank on Showmore stays null, never invented.
  assert.equal(plan.variants.create[1].showmoreSku, null);
});

test('plan: a re-import refreshes Showmore\'s SKU, same as price/cost', () => {
  const existing: ExistingState = {
    products: [{ id: 'p', externalId: 'product-A', sku: 'DS-0001' }],
    variants: [{ id: 'v', productExternalId: 'product-A', externalId: 'v1', sku: 'DS-0001-01' }],
    stock: [],
  };
  const plan = planProductImport(
    [product('product-A', 'EARRINGS', [variant({ showmoreVariantId: 'v1', sku: 'SM-NEW' })])],
    existing,
  );
  assert.equal(plan.variants.update[0].showmoreSku, 'SM-NEW');
  // Our own SKU is untouched — it's stable once generated.
  assert.equal(plan.variants.update[0].sku, 'DS-0001-01');
});
