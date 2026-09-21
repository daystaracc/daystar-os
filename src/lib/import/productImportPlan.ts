/**
 * Turns a parsed Showmore catalogue plus the rows already in the database into an
 * explicit write plan. Pure, so the wizard can show exactly what will happen before
 * anything is written, and so the decisions below are testable.
 *
 * Three decisions live here:
 *
 *  - **Identity is Showmore's id, not the name.** `商品編號(sku)` is empty on 314 of
 *    320 rows and names are edited, so `external_id` is the upsert key. A second
 *    import of the same file therefore updates rather than duplicating.
 *
 *  - **Stock arrives as a `count` movement carrying the difference**, never as a
 *    direct write to `inventory.on_hand` — that column only moves through the audit
 *    trail (trigger `apply_inventory_movement`). On a first import the difference is
 *    the whole opening quantity; on a re-import it is whatever changed, which is what
 *    a stock count means. An unchanged quantity produces no movement at all, so
 *    importing the same file twice is a no-op rather than a doubling.
 *
 *  - **A product's cost is only a number when its variants agree.** Variants carry
 *    their own costs and 205 of 320 have none. Averaging them would invent a figure,
 *    so `products.cost` is set only when every *known* variant cost is the same, and
 *    is left NULL otherwise — the same "unknown stays unknown" rule as migration 0005.
 */
import type { ParsedProduct, ParsedVariant } from './showmoreProducts';

export const EXTERNAL_SOURCE = 'showmore';

/** SKUs we generate look like DS-0007 / DS-0007-02. */
const SKU_PREFIX = 'DS';
const skuPattern = new RegExp(`^${SKU_PREFIX}-(\\d{4})$`);

export interface ExistingProduct { id: string; externalId: string; sku: string }
export interface ExistingVariant { id: string; productExternalId: string; externalId: string; sku: string }
/** One row of `inventory`, at variant grain. */
export interface ExistingStock { productExternalId: string; variantExternalId: string | null; onHand: number }

export interface PlannedProduct {
  externalId: string;
  /** Present when the product already exists and is being updated. */
  id: string | null;
  sku: string;
  name: string;
  price: number;
  cost: number | null;
}

export interface PlannedVariant {
  productExternalId: string;
  externalId: string;
  id: string | null;
  sku: string;
  /** Showmore's own SKU, verbatim (nullable — most rows have none). Separate from `sku`, which is ours. */
  showmoreSku: string | null;
  name: string;
  price: number | null;
  cost: number | null;
  attributes: Record<string, string>;
}

export interface PlannedMovement {
  productExternalId: string;
  variantExternalId: string;
  /** Signed: what must be added to on_hand to reach the counted quantity. */
  quantity: number;
  countedTo: number;
}

export interface ProductImportPlan {
  products: { create: PlannedProduct[]; update: PlannedProduct[] };
  variants: { create: PlannedVariant[]; update: PlannedVariant[] };
  movements: PlannedMovement[];
  summary: {
    productsNew: number; productsUpdated: number;
    variantsNew: number; variantsUpdated: number;
    unitsIn: number; unitsOut: number; variantsUnchanged: number;
    costsKnown: number; costsUnknown: number;
  };
}

export interface ExistingState {
  products: ExistingProduct[];
  variants: ExistingVariant[];
  stock: ExistingStock[];
}

/**
 * `products.cost` from a product's variants: the shared cost when every known one
 * agrees, otherwise null. Variants with no cost are ignored rather than counted as 0.
 */
export function rollUpCost(variants: ParsedVariant[]): number | null {
  const known = variants.map(v => v.cost).filter((c): c is number => c !== null);
  if (!known.length) return null;
  return known.every(c => c === known[0]) ? known[0] : null;
}

/** A product's headline price: its cheapest variant, so "from NT$x" is never a lie. */
export function rollUpPrice(variants: ParsedVariant[]): number {
  const known = variants.map(v => v.price).filter((p): p is number => p !== null && p > 0);
  return known.length ? Math.min(...known) : 0;
}

/** Attributes as a flat object for `product_variants.attributes` (jsonb). */
function attributesOf(variant: ParsedVariant): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of variant.attributes) out[a.key ?? a.rawName] = a.value;
  return out;
}

export function planProductImport(parsed: ParsedProduct[], existing: ExistingState): ProductImportPlan {
  const productByExt = new Map(existing.products.map(p => [p.externalId, p]));
  const variantByExt = new Map(existing.variants.map(v => [`${v.productExternalId}|${v.externalId}`, v]));
  const stockByExt = new Map(existing.stock.map(s => [`${s.productExternalId}|${s.variantExternalId ?? ''}`, s]));

  // Continue the existing DS-#### series so a re-import never reuses a number.
  let nextSku = existing.products.reduce((max, p) => {
    const m = skuPattern.exec(p.sku);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);

  const plan: ProductImportPlan = {
    products: { create: [], update: [] },
    variants: { create: [], update: [] },
    movements: [],
    summary: { productsNew: 0, productsUpdated: 0, variantsNew: 0, variantsUpdated: 0, unitsIn: 0, unitsOut: 0, variantsUnchanged: 0, costsKnown: 0, costsUnknown: 0 },
  };

  for (const product of parsed) {
    const found = productByExt.get(product.showmoreProductId);
    const sku = found?.sku ?? `${SKU_PREFIX}-${String((nextSku += 1)).padStart(4, '0')}`;
    const planned: PlannedProduct = {
      externalId: product.showmoreProductId,
      id: found?.id ?? null,
      sku,
      name: product.name,
      price: rollUpPrice(product.variants),
      cost: rollUpCost(product.variants),
    };
    if (found) { plan.products.update.push(planned); plan.summary.productsUpdated += 1; }
    else { plan.products.create.push(planned); plan.summary.productsNew += 1; }

    product.variants.forEach((variant, i) => {
      const key = `${product.showmoreProductId}|${variant.showmoreVariantId}`;
      const foundVariant = variantByExt.get(key);
      const plannedVariant: PlannedVariant = {
        productExternalId: product.showmoreProductId,
        externalId: variant.showmoreVariantId,
        id: foundVariant?.id ?? null,
        // Variant SKUs hang off the product's, so they stay readable and stable.
        sku: foundVariant?.sku ?? `${sku}-${String(i + 1).padStart(2, '0')}`,
        // Always refreshed from the export, same as price/cost — Showmore's SKU can be
        // filled in or edited there after the fact.
        showmoreSku: variant.sku,
        name: variant.label || product.name,
        price: variant.price,
        cost: variant.cost,
        attributes: attributesOf(variant),
      };
      if (foundVariant) { plan.variants.update.push(plannedVariant); plan.summary.variantsUpdated += 1; }
      else { plan.variants.create.push(plannedVariant); plan.summary.variantsNew += 1; }

      if (variant.cost === null) plan.summary.costsUnknown += 1; else plan.summary.costsKnown += 1;

      // Stock reaches the counted figure through a movement, never a direct write.
      const onHand = stockByExt.get(key)?.onHand ?? 0;
      const delta = variant.onHand - onHand;
      if (delta === 0) { plan.summary.variantsUnchanged += 1; return; }
      plan.movements.push({
        productExternalId: product.showmoreProductId,
        variantExternalId: variant.showmoreVariantId,
        quantity: delta,
        countedTo: variant.onHand,
      });
      if (delta > 0) plan.summary.unitsIn += delta; else plan.summary.unitsOut += -delta;
    });
  }

  return plan;
}
