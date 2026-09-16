import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { localizedField, type Locale } from '@/lib/i18n';
import { stockStatus, reorderSuggestion, inventoryValuation, type StockStatus, type InventoryValuation } from '@/lib/calculations/inventory';

const VELOCITY_WINDOW_DAYS = 30;
const STOCK_RANK: Record<StockStatus, number> = { critical: 0, low: 1, dead: 2, ok: 3, overstock: 4 };

export interface ReorderRow {
  productId: string;
  productName: string;
  variantId: string | null;
  variantName: string | null;
  sku: string;
  onHand: number;
  stock: StockStatus;
  suggestedQty: number;
}

export interface InventoryOverview {
  valuation: InventoryValuation;
  /** Every stock row this org has, classified. Rows with no `product_sales_daily` history in the trailing window are counted separately — "no data", not "dead". */
  statusCounts: Record<StockStatus, number>;
  unknownCount: number;
  /** Critical or low rows, worst first, with a suggested reorder quantity. */
  reorder: ReorderRow[];
  error: boolean;
}

const EMPTY: InventoryOverview = {
  valuation: { value: 0, uncostedProducts: 0, uncostedUnits: 0, complete: true },
  statusCounts: { critical: 0, low: 0, ok: 0, overstock: 0, dead: 0 },
  unknownCount: 0,
  reorder: [],
  error: true,
};

/**
 * A dashboard read, not a CRUD screen: rolls up every `inventory` row this org has
 * into value, stock-status counts, and a reorder list — using the already-tested
 * `stockStatus()` / `reorderSuggestion()` / `inventoryValuation()` from
 * `lib/calculations/inventory.ts`. No writes happen here; stock counting lives on
 * the Products detail page (`recordStockCount` in `app/(app)/products/actions.ts`).
 */
export async function getInventoryOverview(orgId: string, locale: Locale, asOf = new Date().toISOString().slice(0, 10)): Promise<InventoryOverview> {
  const sb = await createClient();
  const cutoff = new Date(asOf);
  cutoff.setUTCDate(cutoff.getUTCDate() - VELOCITY_WINDOW_DAYS);

  const [invRes, salesRes] = await Promise.all([
    sb.from('inventory').select('product_id, variant_id, on_hand, reserved, incoming, safety_stock, reorder_point, moq, lead_time_days, unit_cost').eq('organization_id', orgId),
    sb.from('product_sales_daily').select('product_id, variant_id, units').eq('organization_id', orgId).gte('date', cutoff.toISOString().slice(0, 10)),
  ]);
  if (invRes.error) return EMPTY;

  const key = (productId: string, variantId: string | null) => `${productId}:${variantId ?? ''}`;
  // Present in the map (even at 0) means "we have sales history for this row in the
  // window"; absent means we genuinely don't know its velocity yet.
  const unitsInWindow = new Map<string, number>();
  for (const row of salesRes.data ?? []) {
    const k = key(row.product_id, row.variant_id);
    unitsInWindow.set(k, (unitsInWindow.get(k) ?? 0) + row.units);
  }

  const rows = invRes.data ?? [];
  const productIds = [...new Set(rows.map(r => r.product_id))];
  const variantIds = [...new Set(rows.map(r => r.variant_id).filter((v): v is string => v !== null))];

  const [{ data: products }, { data: variants }] = await Promise.all([
    productIds.length
      ? sb.from('products').select('id, name, name_zh, sku').in('id', productIds)
      : Promise.resolve({ data: [] as { id: string; name: string; name_zh: string | null; sku: string }[] }),
    variantIds.length
      ? sb.from('product_variants').select('id, name, sku').in('id', variantIds)
      : Promise.resolve({ data: [] as { id: string; name: string; sku: string }[] }),
  ]);
  const productById = new Map((products ?? []).map(p => [p.id, p]));
  const variantById = new Map((variants ?? []).map(v => [v.id, v]));

  const statusCounts: Record<StockStatus, number> = { critical: 0, low: 0, ok: 0, overstock: 0, dead: 0 };
  let unknownCount = 0;
  const reorder: ReorderRow[] = [];
  const valuationInput: { onHand: number; unitCost?: number | null }[] = [];

  for (const r of rows) {
    valuationInput.push({ onHand: r.on_hand, unitCost: r.unit_cost !== null ? Number(r.unit_cost) : null });

    const k = key(r.product_id, r.variant_id);
    const hasVelocity = unitsInWindow.has(k);
    if (!hasVelocity) { unknownCount += 1; continue; }
    const unitsPerDay = unitsInWindow.get(k)! / VELOCITY_WINDOW_DAYS;

    const status = stockStatus({ onHand: r.on_hand, reserved: r.reserved, incoming: r.incoming, safetyStock: r.safety_stock, reorderPoint: r.reorder_point, unitsPerDay });
    statusCounts[status] += 1;

    if (status === 'critical' || status === 'low') {
      const product = productById.get(r.product_id);
      const variant = r.variant_id ? variantById.get(r.variant_id) : null;
      reorder.push({
        productId: r.product_id,
        productName: product ? localizedField(product, 'name', locale) : r.product_id,
        variantId: r.variant_id,
        variantName: variant?.name ?? null,
        sku: variant?.sku ?? product?.sku ?? '',
        onHand: r.on_hand,
        stock: status,
        suggestedQty: reorderSuggestion({
          onHand: r.on_hand, reserved: r.reserved, incoming: r.incoming, safetyStock: r.safety_stock,
          unitsPerDay, leadTimeDays: r.lead_time_days ?? undefined, moq: r.moq ?? undefined,
        }),
      });
    }
  }

  reorder.sort((a, b) => STOCK_RANK[a.stock] - STOCK_RANK[b.stock] || b.suggestedQty - a.suggestedQty);

  return { valuation: inventoryValuation(valuationInput), statusCounts, unknownCount, reorder, error: false };
}
