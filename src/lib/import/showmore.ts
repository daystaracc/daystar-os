/**
 * Showmore order-export parser (訂單管理 → 匯出).
 *
 * Pure: it takes the already-read sheet rows and returns everything the import
 * wizard previews and then writes. No database, no I/O, so it is testable.
 *
 * What the real export forced:
 *  - 訂單編號 is an 18-digit number. Read as a float it loses precision and orders
 *    collide, so it is coerced to text and never to Number.
 *  - 付款時間 is empty for 貨到付款 orders (57 of 80 in the reference file). The order
 *    date therefore comes from the YYMMDD prefix of 訂單編號, with 付款時間 only as a
 *    fallback.
 *  - 總額 already includes 運費 and is net of 折扣紀錄 — it is the amount actually
 *    charged, so it is the revenue figure. Adding 運費 on top double-counts it.
 *  - The sheet ends with a product-list block whose rows have no 訂單編號.
 *  - 銷售渠道 arrives padded (" DAYSTAR ").
 *  - 成本 is unreliable (0 on most lines); cost comes from the products table.
 */
import { aov } from '@/lib/calculations/finance';

export const COL = {
  order: '訂單編號',
  status: '訂單狀態',
  sku: '商品編號(sku)',
  productName: '商品名稱',
  variant: '款式',
  unitPrice: '單價',
  qty: '數量',
  total: '總額',
  shipping: '運費',
  paidAt: '付款時間',
  channel: '銷售渠道',
  discount: '折扣紀錄',
} as const;

/** Never read into the application — DAYSTAR does not store customer personal data. */
export const CUSTOMER_COLUMNS = [
  '訂購人', '訂購人性別', '訂購人生日', '訂購人電話',
  '收件人', '收件人市話', '收件人電話', '收件人 Email',
  '地址(含縣市)', '郵遞區號', '縣市', '行政區', '地址',
  '戶名', '銀行帳號', '退款銀行代號', '退款銀行', '退款分行代號', '退款分行',
] as const;

/** Orders in these states never count towards revenue or order counts. */
export const EXCLUDED_STATUSES = ['已棄單', '棄單審核中'] as const;

/**
 * A returned order still happened: it counts in orders and gross on its order date,
 * and its value is also recorded as a refund, so net_revenue is right and the return
 * rate stays visible. Dropping it would quietly understate both demand and returns.
 */
export const RETURNED_STATUS = '已退貨';

/** Showmore's 銷售渠道 values mapped onto sales_channels.key. */
const CHANNEL_KEYS: Record<string, 'website' | 'shopee' | 'other'> = {
  DAYSTAR: 'website',
  SHOPEE: 'shopee',
};

export interface OrderLine { productName: string; variant: string | null; sku: string | null; qty: number; unitPrice: number; lineTotal: number }
export interface ParsedOrder { id: string; date: string; status: string; channelKey: 'website' | 'shopee' | 'other'; gross: number; shipping: number; lines: OrderLine[] }
export interface ExcludedOrder { id: string; reason: 'status' | 'no-date'; detail: string; gross: number }
export interface DayChannelTotals { date: string; channelKey: 'website' | 'shopee' | 'other'; orders: number; gross: number; refunds: number; returnedOrders: number }
export interface ProductDayTotals { date: string; productName: string; units: number; revenue: number }

export interface ShowmoreParseResult {
  rows: { total: number; skippedNoOrderNumber: number };
  orders: { parsed: number; included: number; excluded: ExcludedOrder[] };
  totals: { orders: number; gross: number; refunds: number; returnedOrders: number; aov: number | null };
  dateRange: { from: string; to: string } | null;
  days: DayChannelTotals[];
  products: ProductDayTotals[];
  channels: string[];
  warnings: string[];
}

const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());
const num = (v: unknown): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = Number(text(v).replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/**
 * 260831092812387156 → 2026-08-31. Returns null when the prefix is not a real date,
 * so the caller can fall back rather than inventing one.
 */
export function dateFromOrderNumber(orderNumber: string): string | null {
  const m = /^(\d{2})(\d{2})(\d{2})/.exec(orderNumber);
  if (!m) return null;
  const [, yy, mm, dd] = m;
  const year = 2000 + Number(yy), month = Number(mm), day = Number(dd);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCMonth() + 1 !== month || d.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** "2026/09/05" or "2026/09/05 13:22" → 2026-09-05. */
export function dateFromPaidAt(paidAt: string): string | null {
  const m = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/.exec(paidAt);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

export function channelKeyFor(raw: string): 'website' | 'shopee' | 'other' {
  return CHANNEL_KEYS[raw.trim().toUpperCase()] ?? 'other';
}

/**
 * @param rows sheet rows including the header row, as read from the CSV/XLSX.
 */
export function parseShowmore(rows: unknown[][]): ShowmoreParseResult {
  const warnings: string[] = [];
  if (!rows.length) return empty(['The sheet is empty.']);

  const header = rows[0].map(h => text(h));
  const at = (name: string) => header.indexOf(name);
  const iOrder = at(COL.order);
  if (iOrder < 0) return empty([`Column "${COL.order}" not found — is this a Showmore order export?`]);

  const idx = Object.fromEntries(Object.entries(COL).map(([k, v]) => [k, at(v)])) as Record<keyof typeof COL, number>;
  for (const [key, i] of Object.entries(idx)) {
    if (i < 0) warnings.push(`Column "${COL[key as keyof typeof COL]}" is missing; treated as empty.`);
  }
  const cell = (row: unknown[], i: number) => (i >= 0 ? row[i] : null);

  const body = rows.slice(1);
  let skipped = 0;
  const byOrder = new Map<string, ParsedOrder & { rawDates: string[] }>();

  for (const row of body) {
    const id = text(cell(row, iOrder));
    if (!id) { skipped += 1; continue; } // trailing product-list block

    let order = byOrder.get(id);
    if (!order) {
      const fromId = dateFromOrderNumber(id);
      const fromPaid = dateFromPaidAt(text(cell(row, idx.paidAt)));
      order = {
        id,
        date: fromId ?? fromPaid ?? '',
        status: text(cell(row, idx.status)),
        channelKey: channelKeyFor(text(cell(row, idx.channel))),
        gross: 0,
        shipping: num(cell(row, idx.shipping)),
        lines: [],
        rawDates: [],
      };
      byOrder.set(id, order);
    }
    order.gross += num(cell(row, idx.total));
    order.lines.push({
      productName: text(cell(row, idx.productName)),
      variant: text(cell(row, idx.variant)) || null,
      sku: text(cell(row, idx.sku)) || null,
      qty: num(cell(row, idx.qty)),
      unitPrice: num(cell(row, idx.unitPrice)),
      lineTotal: num(cell(row, idx.total)),
    });
  }

  const excluded: ExcludedOrder[] = [];
  const included: ParsedOrder[] = [];
  for (const o of byOrder.values()) {
    if ((EXCLUDED_STATUSES as readonly string[]).includes(o.status)) {
      excluded.push({ id: o.id, reason: 'status', detail: o.status, gross: o.gross });
    } else if (!o.date) {
      excluded.push({ id: o.id, reason: 'no-date', detail: 'no date in 訂單編號 or 付款時間', gross: o.gross });
    } else {
      included.push(o);
    }
  }

  const days = new Map<string, DayChannelTotals>();
  const products = new Map<string, ProductDayTotals>();
  for (const o of included) {
    const dk = `${o.date}|${o.channelKey}`;
    const day = days.get(dk) ?? { date: o.date, channelKey: o.channelKey, orders: 0, gross: 0, refunds: 0, returnedOrders: 0 };
    day.orders += 1;
    day.gross += o.gross;
    if (o.status === RETURNED_STATUS) { day.refunds += o.gross; day.returnedOrders += 1; }
    days.set(dk, day);

    for (const l of o.lines) {
      if (!l.productName) continue;
      const pk = `${o.date}|${l.productName}`;
      const p = products.get(pk) ?? { date: o.date, productName: l.productName, units: 0, revenue: 0 };
      p.units += l.qty;
      p.revenue += l.lineTotal;
      products.set(pk, p);
    }
  }

  const dates = included.map(o => o.date).sort();
  const gross = included.reduce((a, o) => a + o.gross, 0);
  const returned = included.filter(o => o.status === RETURNED_STATUS);
  const refunds = returned.reduce((a, o) => a + o.gross, 0);
  const channels = [...new Set([...byOrder.values()].map(o => o.channelKey))];
  if (channels.includes('other')) warnings.push('Some rows have a 銷售渠道 that does not map to a known channel; they are recorded against "Other".');

  return {
    rows: { total: body.length, skippedNoOrderNumber: skipped },
    orders: { parsed: byOrder.size, included: included.length, excluded },
    totals: { orders: included.length, gross, refunds, returnedOrders: returned.length, aov: aov(gross, included.length) },
    dateRange: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null,
    days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date) || a.channelKey.localeCompare(b.channelKey)),
    products: [...products.values()].sort((a, b) => a.date.localeCompare(b.date) || a.productName.localeCompare(b.productName)),
    channels,
    warnings,
  };
}

function empty(warnings: string[]): ShowmoreParseResult {
  return {
    rows: { total: 0, skippedNoOrderNumber: 0 },
    orders: { parsed: 0, included: 0, excluded: [] },
    totals: { orders: 0, gross: 0, refunds: 0, returnedOrders: 0, aov: null },
    dateRange: null, days: [], products: [], channels: [], warnings,
  };
}
