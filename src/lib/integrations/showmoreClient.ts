import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ShowmoreApiOrder, ShowmoreOrderItem } from './showmoreOrders';

/**
 * Thin I/O layer for Showmore's gateway API (https://gateway-showmore.showmore.cc),
 * spec at /api-integration-documentation/. All the business logic (what counts as
 * revenue, matching) lives in showmoreOrders.ts, which this module feeds — kept
 * separate so that logic stays testable without a network call.
 *
 * Auth: `X-API-KEY` header, value from `SHOWMORE_API_KEY` (Vercel env var, set
 * 2026-09-21). Never logged, never sent anywhere except this one host.
 */

const BASE_URL = 'https://gateway-showmore.showmore.cc';

function apiKey(): string {
  const key = process.env.SHOWMORE_API_KEY;
  if (!key) throw new Error('SHOWMORE_API_KEY is not set.');
  return key;
}

/** Raw shapes as Showmore's API actually returns them (snake_case), before mapping. */
interface RawOrderItem {
  sku: string | null;
  product_name?: string;
  variant_name?: string;
  additional_purchase_name?: string;
  bundle_name?: string;
  quantity: number;
  subtotal_price: number;
}
interface RawBundle extends RawOrderItem {
  items?: RawOrderItem[];
}
interface RawOrder {
  order_number: string;
  created_at: string;
  total_price: number;
  order_status: number;
  items?: RawOrderItem[];
  additional_purchase_items?: RawOrderItem[];
  bundles?: RawBundle[];
}

/**
 * Flattens `items` and each bundle's nested `items` into one list — both are real
 * products leaving inventory. `additional_purchase_items` (add-ons) and `giveaways`
 * (free) are deliberately left out of v1: add-ons have no catalogue counterpart yet,
 * and giveaways carry no price, so neither belongs in a revenue/units sync.
 */
function toApiOrder(raw: RawOrder): ShowmoreApiOrder {
  const items: ShowmoreOrderItem[] = [];
  for (const i of raw.items ?? []) {
    items.push({ sku: i.sku ?? null, productName: i.product_name ?? '', variantName: i.variant_name ?? null, quantity: i.quantity, subtotalPrice: i.subtotal_price });
  }
  for (const b of raw.bundles ?? []) {
    for (const i of b.items ?? []) {
      items.push({ sku: i.sku ?? null, productName: i.product_name ?? '', variantName: i.variant_name ?? null, quantity: i.quantity, subtotalPrice: i.subtotal_price });
    }
  }
  return {
    orderNumber: raw.order_number,
    createdAt: raw.created_at,
    totalPrice: raw.total_price,
    orderStatus: raw.order_status,
    items,
  };
}

async function get<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(BASE_URL + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { 'X-API-KEY': apiKey() }, cache: 'no-store' });
  if (!res.ok) throw new Error(`Showmore API ${path} → ${res.status}: ${await res.text().catch(() => '')}`);
  return res.json() as Promise<T>;
}

/** `GET /api/v1/order` — full detail on one order, by its order_number. Null if Showmore has no such order. */
export async function fetchOrder(orderNumber: string): Promise<ShowmoreApiOrder | null> {
  const body = await get<{ code: number; data: RawOrder | null }>('/api/v1/order', { order_number: orderNumber });
  return body.data ? toApiOrder(body.data) : null;
}

/**
 * `GET /api/v1/order/allorders` — every order in a date range, already carrying full
 * item detail (no per-order follow-up call needed). Used for backfill/reconciliation
 * and for the webhook's "resync this whole day" step. Paginates internally — the
 * endpoint has no documented page cap, so this keeps requesting until a page comes
 * back short.
 */
export async function fetchOrdersInRange(sinceIso: string, untilIso: string): Promise<ShowmoreApiOrder[]> {
  const all: ShowmoreApiOrder[] = [];
  const pageSize = 200;
  for (let offset = 0; ; offset += pageSize) {
    const body = await get<{ total: number; raws: RawOrder[] }>('/api/v1/order/allorders', {
      since: sinceIso, until: untilIso, offset: String(offset), limit: String(pageSize),
    });
    all.push(...body.raws.map(toApiOrder));
    if (body.raws.length < pageSize) break;
  }
  return all;
}

/**
 * Verifies `X-Hub-Signature-256`: HMAC-SHA256 of the raw request body, keyed with
 * the same API key, as `sha256=<hex>`. Takes the RAW body text (not a re-serialized
 * JSON.stringify of a parsed object) — signing is byte-exact, and re-serializing can
 * reorder keys or change whitespace and silently break verification.
 * `timingSafeEqual` avoids leaking the secret through a response-time side channel;
 * it throws on a length mismatch, so that's checked first.
 */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', apiKey()).update(rawBody).digest('hex');
  const given = signatureHeader.slice('sha256='.length);
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(given, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
