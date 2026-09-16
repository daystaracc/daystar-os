import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { localizedField, type Locale } from '@/lib/i18n';
import { stockStatus, productMarginPct, type StockStatus } from '@/lib/calculations/inventory';
import type { Role } from '@/lib/permissions';
import type { ProductStatus, ProductTier } from '@/lib/products/constants';

const VELOCITY_WINDOW_DAYS = 30;

export interface ProductRow {
  id: string;
  name: string;
  sku: string;
  category: string | null;
  collection: string | null;
  tier: ProductTier;
  status: ProductStatus;
  price: number;
  /** null = unknown, never treated as free — see migration 0005. */
  cost: number | null;
  marginPct: number | null;
  isHero: boolean;
  supplier: { id: string; name: string } | null;
  onHand: number;
  variantCount: number;
  /** null when nothing has sold in the trailing 30 days — "no data", not "dead stock". */
  stock: StockStatus | null;
  /** Mirrors `products_update` / `products_delete` RLS (manager-or-above / founder-only — same generic loop as Projects/Goals). */
  canEdit: boolean;
  canDelete: boolean;
}

export interface ProductOptions { suppliers: { id: string; name: string }[] }
export interface ProductsPage { products: ProductRow[]; options: ProductOptions; error: boolean }

const STOCK_RANK: Record<StockStatus, number> = { critical: 0, low: 1, dead: 2, ok: 3, overstock: 4 };

// One literal string, not built with `+` — see tasks.ts's SELECT/DETAIL_SELECT note.
const SELECT = 'id, name, name_zh, sku, category, collection, tier, status, price, cost, is_hero, supplier_id, suppliers:supplier_id(id, name)';
const DETAIL_SELECT = 'id, name, name_zh, sku, category, collection, tier, status, price, cost, is_hero, supplier_id, weight_g, material, specification, color, size, launch_date, image_url, notes, created_at, suppliers:supplier_id(id, name)';

export async function getProductOptions(orgId: string): Promise<ProductOptions> {
  const sb = await createClient();
  const { data } = await sb.from('suppliers').select('id, name').eq('organization_id', orgId).order('name');
  return { suppliers: data ?? [] };
}

/** Sum `on_hand` (and safety/reorder points) per product, and per variant, from the audit-trail-backed `inventory` table. No direct math on `products` — stock lives here. */
async function loadInventory(sb: Awaited<ReturnType<typeof createClient>>, orgId: string) {
  const { data } = await sb.from('inventory').select('product_id, variant_id, on_hand, safety_stock, reorder_point').eq('organization_id', orgId);
  const byProduct = new Map<string, { onHand: number; safetyStock: number; reorderPoint: number }>();
  const byVariant = new Map<string, { onHand: number; safetyStock: number; reorderPoint: number }>();
  for (const row of data ?? []) {
    const p = byProduct.get(row.product_id) ?? { onHand: 0, safetyStock: 0, reorderPoint: 0 };
    p.onHand += row.on_hand; p.safetyStock += row.safety_stock; p.reorderPoint += row.reorder_point;
    byProduct.set(row.product_id, p);
    if (row.variant_id) byVariant.set(row.variant_id, { onHand: row.on_hand, safetyStock: row.safety_stock, reorderPoint: row.reorder_point });
  }
  return { byProduct, byVariant };
}

/** Units sold per day over the trailing window, per product and per variant — the input `stockStatus()` needs and none of it is stored directly. */
async function loadVelocity(sb: Awaited<ReturnType<typeof createClient>>, orgId: string, asOf: string) {
  const cutoff = new Date(asOf);
  cutoff.setUTCDate(cutoff.getUTCDate() - VELOCITY_WINDOW_DAYS);
  const { data } = await sb.from('product_sales_daily').select('product_id, variant_id, units')
    .eq('organization_id', orgId).gte('date', cutoff.toISOString().slice(0, 10));
  const byProduct = new Map<string, number>();
  const byVariant = new Map<string, number>();
  for (const row of data ?? []) {
    byProduct.set(row.product_id, (byProduct.get(row.product_id) ?? 0) + row.units);
    if (row.variant_id) byVariant.set(row.variant_id, (byVariant.get(row.variant_id) ?? 0) + row.units);
  }
  const perDay = (total: number) => total / VELOCITY_WINDOW_DAYS;
  return {
    byProduct: new Map([...byProduct].map(([k, v]) => [k, perDay(v)])),
    byVariant: new Map([...byVariant].map(([k, v]) => [k, perDay(v)])),
  };
}

export async function getProductsPage(orgId: string, role: Role, locale: Locale, asOf = new Date().toISOString().slice(0, 10)): Promise<ProductsPage> {
  const sb = await createClient();
  const canManage = role === 'founder' || role === 'manager';

  const list = await sb.from('products').select(SELECT).eq('organization_id', orgId);
  if (list.error) return { products: [], options: { suppliers: [] }, error: true };
  const productIds = (list.data ?? []).map(p => p.id);

  const [variantCounts, inv, velocity, options] = await Promise.all([
    productIds.length ? sb.from('product_variants').select('product_id').in('product_id', productIds) : Promise.resolve({ data: [] as { product_id: string }[] }),
    loadInventory(sb, orgId),
    loadVelocity(sb, orgId, asOf),
    getProductOptions(orgId),
  ]);

  const variantCountByProduct = new Map<string, number>();
  for (const v of variantCounts.data ?? []) variantCountByProduct.set(v.product_id, (variantCountByProduct.get(v.product_id) ?? 0) + 1);

  const products: ProductRow[] = (list.data ?? []).map(p => {
    const stock = inv.byProduct.get(p.id) ?? { onHand: 0, safetyStock: 0, reorderPoint: 0 };
    const unitsPerDay = velocity.byProduct.get(p.id);
    return {
      id: p.id,
      name: localizedField(p, 'name', locale),
      sku: p.sku,
      category: p.category,
      collection: p.collection,
      tier: p.tier as ProductTier,
      status: p.status as ProductStatus,
      price: Number(p.price),
      cost: p.cost !== null ? Number(p.cost) : null,
      marginPct: productMarginPct(Number(p.price), p.cost !== null ? Number(p.cost) : null),
      isHero: p.is_hero,
      supplier: one(p.suppliers) ? { id: one(p.suppliers)!.id, name: one(p.suppliers)!.name } : null,
      onHand: stock.onHand,
      variantCount: variantCountByProduct.get(p.id) ?? 0,
      stock: unitsPerDay === undefined ? null : stockStatus({ onHand: stock.onHand, safetyStock: stock.safetyStock, reorderPoint: stock.reorderPoint, unitsPerDay }),
      canEdit: canManage,
      canDelete: role === 'founder',
    };
  }).sort((a, b) => STOCK_RANK[a.stock ?? 'ok'] - STOCK_RANK[b.stock ?? 'ok'] || a.name.localeCompare(b.name));

  return { products, options, error: false };
}

// ---- detail ------------------------------------------------------------------

export interface VariantRow {
  id: string;
  name: string;
  sku: string;
  price: number | null;
  cost: number | null;
  marginPct: number | null;
  attributes: Record<string, string>;
  onHand: number;
  stock: StockStatus | null;
}

export interface ProductDetail extends ProductRow {
  weightG: number | null;
  material: string | null;
  specification: string | null;
  color: string | null;
  size: string | null;
  launchDate: string | null;
  imageUrl: string | null;
  notes: string | null;
  createdAt: string;
  variants: VariantRow[];
  /** Stock tracked directly against the product (no variants at all) — null once it has variants. */
  ownStock: { onHand: number; stock: StockStatus | null } | null;
}

export async function getProductDetail(orgId: string, productId: string, role: Role, locale: Locale, asOf = new Date().toISOString().slice(0, 10)): Promise<ProductDetail | null> {
  const sb = await createClient();
  const { data: p } = await sb.from('products').select(DETAIL_SELECT).eq('organization_id', orgId).eq('id', productId).maybeSingle();
  if (!p) return null;
  const canManage = role === 'founder' || role === 'manager';

  const [{ data: variants }, inv, velocity] = await Promise.all([
    sb.from('product_variants').select('id, name, sku, price, cost, attributes').eq('product_id', productId).order('created_at'),
    loadInventory(sb, orgId),
    loadVelocity(sb, orgId, asOf),
  ]);

  const productStock = inv.byProduct.get(p.id) ?? { onHand: 0, safetyStock: 0, reorderPoint: 0 };
  const productUnitsPerDay = velocity.byProduct.get(p.id);

  const variantRows: VariantRow[] = (variants ?? []).map(v => {
    const stock = inv.byVariant.get(v.id) ?? { onHand: 0, safetyStock: 0, reorderPoint: 0 };
    const unitsPerDay = velocity.byVariant.get(v.id);
    return {
      id: v.id,
      name: v.name,
      sku: v.sku,
      price: v.price !== null ? Number(v.price) : null,
      cost: v.cost !== null ? Number(v.cost) : null,
      marginPct: productMarginPct(v.price !== null ? Number(v.price) : null, v.cost !== null ? Number(v.cost) : null),
      attributes: (v.attributes ?? {}) as Record<string, string>,
      onHand: stock.onHand,
      stock: unitsPerDay === undefined ? null : stockStatus({ onHand: stock.onHand, safetyStock: stock.safetyStock, reorderPoint: stock.reorderPoint, unitsPerDay }),
    };
  });

  // A product with no variants at all still holds its own inventory row (variant_id IS NULL).
  const ownStock = variantRows.length === 0
    ? { onHand: productStock.onHand, stock: productUnitsPerDay === undefined ? null : stockStatus({ onHand: productStock.onHand, safetyStock: productStock.safetyStock, reorderPoint: productStock.reorderPoint, unitsPerDay: productUnitsPerDay }) }
    : null;

  return {
    id: p.id,
    name: localizedField(p, 'name', locale),
    sku: p.sku,
    category: p.category,
    collection: p.collection,
    tier: p.tier as ProductTier,
    status: p.status as ProductStatus,
    price: Number(p.price),
    cost: p.cost !== null ? Number(p.cost) : null,
    marginPct: productMarginPct(Number(p.price), p.cost !== null ? Number(p.cost) : null),
    isHero: p.is_hero,
    supplier: one(p.suppliers) ? { id: one(p.suppliers)!.id, name: one(p.suppliers)!.name } : null,
    onHand: variantRows.reduce((a, v) => a + v.onHand, 0) + (ownStock?.onHand ?? 0),
    variantCount: variantRows.length,
    stock: ownStock ? ownStock.stock : rollUpStock(variantRows),
    canEdit: canManage,
    canDelete: role === 'founder',

    weightG: p.weight_g !== null ? Number(p.weight_g) : null,
    material: p.material,
    specification: p.specification,
    color: p.color,
    size: p.size,
    launchDate: p.launch_date,
    imageUrl: p.image_url,
    notes: p.notes,
    createdAt: p.created_at,
    variants: variantRows,
    ownStock,
  };
}

/** Worst status across a product's variants — same "critical wins" ordering as the list page's sort. */
function rollUpStock(variants: VariantRow[]): StockStatus | null {
  const known = variants.map(v => v.stock).filter((s): s is StockStatus => s !== null);
  if (!known.length) return null;
  return known.reduce((worst, s) => (STOCK_RANK[s] < STOCK_RANK[worst] ? s : worst));
}

// ---- helpers -------------------------------------------------------------

function one<T>(rel: T | T[] | null | undefined): T | null {
  return (Array.isArray(rel) ? rel[0] : rel) ?? null;
}
