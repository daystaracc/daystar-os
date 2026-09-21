/**
 * Pure order-sync logic for the live Showmore API — the webhook/backfill
 * counterpart to `lib/import/showmore.ts`, which parses the CSV order
 * EXPORT for the manual revenue-import wizard. Both must agree on what
 * counts as revenue, so a day touched by either path produces the same
 * numbers; the status/channel rules below deliberately mirror that file's.
 *
 * Differences from the CSV path, forced by the live API's shape:
 *  - `order_status` arrives as an integer enum here, not Chinese text. The
 *    mapping below is the same real-world statuses under different labels:
 *    excluded = 棄單審核中(3)/已棄單(4), returned = 已退貨(6). (已部分退貨(7)
 *    and 退貨中(10) are left as ordinary revenue for now, same blind spot
 *    the CSV path already has — a deliberate v1 scope decision, not an
 *    oversight; Showmore's `items[].quantity_returned` would let a later
 *    version prorate these properly.)
 *  - Showmore IS the storefront here — every order this endpoint returns is
 *    channel `website`. Shopee, whenever it's built, is a wholly separate
 *    API with its own sync; it is never reachable through Showmore.
 *  - `created_at` is already a real ISO timestamp (UTC+8 per Showmore's
 *    docs), so there's no YYMMDD-prefix fallback to reconstruct, unlike the
 *    CSV export where 貨到付款 rows had no 付款時間 at all.
 *  - Order line items carry Showmore's own SKU (nullable) and product/
 *    variant NAME text, never a stable id — matching them to a row in
 *    `products`/`product_variants` is inherently best-effort. See
 *    `matchCatalogueItem`. Unmatched items still count in the day's
 *    order/revenue totals (which come from the order, not the sum of
 *    matched lines); only the per-product breakdown misses them.
 */

// Same real states as EXCLUDED_STATUSES in lib/import/showmore.ts (棄單審核中/已棄單).
export const EXCLUDED_ORDER_STATUSES = [3, 4] as const;

// A returned order still happened — same reasoning as RETURNED_STATUS in
// lib/import/showmore.ts: it counts in orders/gross on its order date, and
// its value is ALSO recorded as a refund, so net_revenue is right and the
// return rate stays visible.
export const RETURNED_ORDER_STATUS = 6 as const;

export interface ShowmoreOrderItem {
  sku: string | null;
  productName: string;
  variantName: string | null;
  quantity: number;
  subtotalPrice: number;
}

/** The subset of Showmore's order shape this sync needs, already flattened (items + bundle sub-items). */
export interface ShowmoreApiOrder {
  orderNumber: string;
  /** ISO date-time, UTC+8, as Showmore returns it. */
  createdAt: string;
  totalPrice: number;
  orderStatus: number;
  items: ShowmoreOrderItem[];
}

export interface DayTotals {
  date: string;
  orders: number;
  gross: number;
  refunds: number;
  returnedOrders: number;
}

/** One row of this app's catalogue, in the shape the matcher needs. */
export interface CatalogueEntry {
  productId: string;
  variantId: string;
  showmoreSku: string | null;
  productName: string;
  /** product_variants.name — equals the product's own name for an unvarianted product. */
  variantName: string;
}

export interface ProductMatch {
  date: string;
  productId: string;
  variantId: string;
  units: number;
  revenue: number;
}

export interface UnmatchedItem {
  orderNumber: string;
  date: string;
  sku: string | null;
  productName: string;
  variantName: string | null;
  quantity: number;
  subtotalPrice: number;
}

export interface OrderSyncResult {
  days: DayTotals[];
  products: ProductMatch[];
  unmatched: UnmatchedItem[];
  totals: { ordersIncluded: number; ordersExcluded: number; gross: number; refunds: number };
}

const dateOf = (isoDateTime: string): string => isoDateTime.slice(0, 10);

export function isExcludedStatus(status: number): boolean {
  return (EXCLUDED_ORDER_STATUSES as readonly number[]).includes(status);
}

/**
 * Match one order line item to a catalogue row.
 *
 *  1. Showmore's own SKU, when the item has one and it's in our catalogue
 *     (see migration 0010 / `product_variants.showmore_sku`) — the only
 *     reliable key order data carries.
 *  2. Exact product name + variant name text.
 *  3. When the order line has no variant name at all and the product has
 *     exactly one variant, that variant — safe only because there's nothing
 *     else it could be.
 *
 * Returns null rather than guessing further; the caller logs a miss instead
 * of silently mis-attributing revenue to the wrong product.
 */
export function matchCatalogueItem(item: ShowmoreOrderItem, catalogue: CatalogueEntry[]): CatalogueEntry | null {
  if (item.sku) {
    const bySku = catalogue.find(c => c.showmoreSku === item.sku);
    if (bySku) return bySku;
  }
  const sameProduct = catalogue.filter(c => c.productName === item.productName);
  if (!sameProduct.length) return null;

  const variantName = item.variantName?.trim() || null;
  if (variantName) return sameProduct.find(c => c.variantName === variantName) ?? null;
  return sameProduct.length === 1 ? sameProduct[0] : null;
}

/**
 * Aggregate a batch of orders (typically "everything Showmore reports in a
 * date range") into day totals for `sales_daily` and per-variant totals for
 * `product_sales_daily`. Pure — the caller does the fetching and the writing.
 */
export function syncOrders(orders: ShowmoreApiOrder[], catalogue: CatalogueEntry[]): OrderSyncResult {
  const days = new Map<string, DayTotals>();
  const products = new Map<string, ProductMatch>();
  const unmatched: UnmatchedItem[] = [];
  let ordersExcluded = 0;

  for (const o of orders) {
    if (isExcludedStatus(o.orderStatus)) { ordersExcluded += 1; continue; }
    const date = dateOf(o.createdAt);

    const day = days.get(date) ?? { date, orders: 0, gross: 0, refunds: 0, returnedOrders: 0 };
    day.orders += 1;
    day.gross += o.totalPrice;
    if (o.orderStatus === RETURNED_ORDER_STATUS) { day.refunds += o.totalPrice; day.returnedOrders += 1; }
    days.set(date, day);

    for (const item of o.items) {
      const match = matchCatalogueItem(item, catalogue);
      if (!match) {
        unmatched.push({
          orderNumber: o.orderNumber, date, sku: item.sku,
          productName: item.productName, variantName: item.variantName,
          quantity: item.quantity, subtotalPrice: item.subtotalPrice,
        });
        continue;
      }
      const key = `${date}|${match.variantId}`;
      const p = products.get(key) ?? { date, productId: match.productId, variantId: match.variantId, units: 0, revenue: 0 };
      p.units += item.quantity;
      p.revenue += item.subtotalPrice;
      products.set(key, p);
    }
  }

  const dayList = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  return {
    days: dayList,
    products: [...products.values()].sort((a, b) => a.date.localeCompare(b.date) || a.variantId.localeCompare(b.variantId)),
    unmatched,
    totals: {
      ordersIncluded: dayList.reduce((a, d) => a + d.orders, 0),
      ordersExcluded,
      gross: dayList.reduce((a, d) => a + d.gross, 0),
      refunds: dayList.reduce((a, d) => a + d.refunds, 0),
    },
  };
}
