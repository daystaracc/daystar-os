/** Inventory calculations: weeks of supply, sell-through, ABC, stock status. */
export type StockStatus = 'critical' | 'low' | 'ok' | 'overstock' | 'dead';
export type AbcClass = 'A' | 'B' | 'C';

export interface StockInput {
  onHand: number;
  reserved?: number;
  incoming?: number;
  safetyStock?: number;
  reorderPoint?: number;
  /** average units sold per day over the trailing window (e.g. 30 days) */
  unitsPerDay: number;
  /** what "critical" means in weeks; default 1.5 */
  criticalWeeks?: number;
  /** above this many weeks of supply we call it overstock; default 26 */
  overstockWeeks?: number;
}

export function available(s: { onHand: number; reserved?: number }): number {
  return Math.max(0, s.onHand - (s.reserved ?? 0));
}

/** Weeks of supply = available / (units per day × 7). Infinity when nothing sells. */
export function weeksOfSupply(s: StockInput): number {
  const perWeek = s.unitsPerDay * 7;
  if (perWeek <= 0) return Number.POSITIVE_INFINITY;
  return available(s) / perWeek;
}

/** Days until stockout at the current rate. */
export function stockCoverDays(s: StockInput): number {
  return s.unitsPerDay > 0 ? available(s) / s.unitsPerDay : Number.POSITIVE_INFINITY;
}

/** Sell-through % = units sold / (units sold + on hand) over the window. */
export function sellThroughPct(unitsSold: number, onHand: number): number | null {
  const denom = unitsSold + onHand;
  return denom > 0 ? (unitsSold / denom) * 100 : null;
}

/** Annualized inventory turnover = COGS in window / average inventory value, scaled to a year. */
export function inventoryTurnover(cogsInWindow: number, avgInventoryValue: number, windowDays: number): number | null {
  if (avgInventoryValue <= 0 || windowDays <= 0) return null;
  return (cogsInWindow / avgInventoryValue) * (365 / windowDays);
}

export function stockStatus(s: StockInput): StockStatus {
  const avail = available(s);
  const wos = weeksOfSupply(s);
  if (s.unitsPerDay <= 0 && avail > 0) return 'dead';
  if (avail <= 0 || avail <= (s.safetyStock ?? 0) || wos < (s.criticalWeeks ?? 1.5)) return 'critical';
  if (avail <= (s.reorderPoint ?? 0) || wos < 4) return 'low';
  if (wos > (s.overstockWeeks ?? 26)) return 'overstock';
  return 'ok';
}

/** Reorder quantity suggestion: cover lead time + target weeks, respect MOQ, net of incoming. */
export function reorderSuggestion(s: StockInput & { leadTimeDays?: number; moq?: number; targetWeeks?: number }): number {
  const targetDays = (s.leadTimeDays ?? 14) + (s.targetWeeks ?? 6) * 7;
  const need = Math.ceil(s.unitsPerDay * targetDays + (s.safetyStock ?? 0) - available(s) - (s.incoming ?? 0));
  if (need <= 0) return 0;
  return Math.max(need, s.moq ?? 0);
}

/** ABC classification by cumulative revenue share: A ≤ 80%, B ≤ 95%, C rest. */
export function abcClassify<T extends { id: string; revenue: number }>(items: T[]): Map<string, AbcClass> {
  const total = items.reduce((a, i) => a + i.revenue, 0);
  const sorted = [...items].sort((a, b) => b.revenue - a.revenue);
  const out = new Map<string, AbcClass>();
  let cum = 0;
  for (const it of sorted) {
    cum += it.revenue;
    const share = total > 0 ? cum / total : 1;
    out.set(it.id, share <= 0.8 ? 'A' : share <= 0.95 ? 'B' : 'C');
  }
  return out;
}

export interface InventoryValuation {
  /** Value of the stock we can actually cost. */
  value: number;
  /** Rows holding stock whose unit cost is unknown — excluded from `value`. */
  uncostedProducts: number;
  /** Units sitting in those uncosted rows. */
  uncostedUnits: number;
  /** True when every row holding stock has a cost, i.e. `value` is the whole picture. */
  complete: boolean;
}

/**
 * Values stock at unit cost, and says how much it could not value.
 *
 * A missing cost is unknown, not zero: Showmore carries no cost, so imported
 * products arrive with `cost = null`. Silently treating that as 0 understates
 * inventory value while looking like a confident number, so uncosted stock is
 * counted separately and the UI shows "no cost data" instead of a total.
 */
export function inventoryValuation(rows: { onHand: number; unitCost?: number | null }[]): InventoryValuation {
  let value = 0, uncostedProducts = 0, uncostedUnits = 0;
  for (const r of rows) {
    const known = r.unitCost !== null && r.unitCost !== undefined && Number.isFinite(Number(r.unitCost));
    if (known) { value += r.onHand * Number(r.unitCost); continue; }
    if (r.onHand > 0) { uncostedProducts += 1; uncostedUnits += r.onHand; }
  }
  return { value, uncostedProducts, uncostedUnits, complete: uncostedProducts === 0 };
}

/** Gross margin on a unit: null when the cost is unknown, never a fabricated 100%. */
export function productMarginPct(price: number | null | undefined, cost: number | null | undefined): number | null {
  if (price === null || price === undefined || !(Number(price) > 0)) return null;
  if (cost === null || cost === undefined || !Number.isFinite(Number(cost))) return null;
  return ((Number(price) - Number(cost)) / Number(price)) * 100;
}
