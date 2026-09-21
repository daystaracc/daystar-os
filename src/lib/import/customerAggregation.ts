/**
 * Aggregates the Showmore order export into per-customer records for
 * `customers`. The read side (`getCustomersPage`, lib/data/crm.ts) has existed
 * since CRM was built; this is the first write path, deliberately deferred
 * until now because it required two decisions: (1) how to tell a repeat
 * customer apart from a new one without ever storing a real phone number, and
 * (2) reading a plaintext phone number out of the export at all, when
 * showmore.ts's `CUSTOMER_COLUMNS` comment explicitly says none of those
 * columns are read into the application. Lucas approved a standard salted hash
 * for (1) on 2026-09-14 ("just do it, standard salted hash is fine"),
 * unblocking this — see migration `0008_customer_phone_hash.sql`.
 *
 * The discipline that keeps (2) honest: this file is the ONLY place in the app
 * that ever reads 訂購人電話 (orderer phone) out of an export, and it is
 * hashed immediately, inside `extractCustomerOrders` — every value that
 * function or `aggregateCustomers` returns, and everything any caller ever
 * sees, logs, or writes to the database, is a hash, never the original number.
 * `normalizePhone` (below) and `hashPhone` (`customerHash.server.ts`) are
 * exported and tested in isolation so that guarantee is independently
 * checkable. Every other `CUSTOMER_COLUMNS` field — address, bank account,
 * gender, birthday, recipient phone/name — is still never read anywhere in
 * this codebase; this file only ever touches 訂購人 (name, kept in plain text,
 * same as any other CRM's customer name field), 訂購人電話 (phone, hashed,
 * never stored), and — as of 2026-09-16 — 收件人 Email (email, kept in plain
 * text, same as name). The email decision is separate from the phone one:
 * Lucas explicitly chose "email only, not phone" when asked (2026-09-16) —
 * real email addresses ARE stored (unlike phone, which stays hash-only), so
 * `customers.email` is a real, readable value once imported, not a hash. This
 * is a smaller privacy footprint than storing phone numbers (no PDPA-relevant
 * financial/identity data), but it is still real PII — do not extend this
 * same "store it plainly" treatment to phone or any other `CUSTOMER_COLUMNS`
 * field without a similarly explicit decision from Lucas first.
 *
 * This file itself never imports `node:crypto` — `extractCustomerOrders`
 * below takes a plain `(normalized: string) => string` hash function instead
 * of a salt, so this module stays safe to import from a Client Component (the
 * `/revenue/import` wizard uses it for a live preview before Confirm). The
 * actual HMAC implementation lives in `customerHash.server.ts`, a
 * `server-only` file the server action wires in; the client preview passes
 * its own non-cryptographic function instead. See that file's doc comment for
 * why this split exists — putting `node:crypto` back in this file broke the
 * client build outright (2026-09-15).
 */
import { EXCLUDED_STATUSES, dateFromOrderNumber, dateFromPaidAt } from './showmore';

const ORDER_COL = '訂單編號';
const STATUS_COL = '訂單狀態';
const TOTAL_COL = '總額';
const PAID_AT_COL = '付款時間';
const NAME_COL = '訂購人';
const PHONE_COL = '訂購人電話';
const EMAIL_COL = '收件人 Email';

export interface CustomerOrder { orderId: string; date: string; amount: number; name: string | null; phoneHash: string | null; email: string | null }
export interface CustomerAggregate { phoneHash: string; name: string | null; email: string | null; ordersCount: number; totalSpent: number; firstOrderAt: string; lastOrderAt: string }

const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());
const num = (v: unknown): number => {
  const n = Number(text(v).replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Taiwan phone normalization: strips everything but digits, then folds a
 * leading country code (+886 / 886) back to a domestic leading 0, so
 * "0912-345-678", "+886 912 345 678" and "886912345678" all normalize
 * identically. Returns null for anything that doesn't look like a real number
 * (empty, or fewer than 8 digits after normalizing) — an unparseable phone is
 * excluded from customer aggregation entirely, never guessed into a fake
 * grouping (same "missing denominator is not zero" rule as everywhere else in
 * this app).
 */
export function normalizePhone(raw: string): string | null {
  let digits = text(raw).replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('886')) digits = '0' + digits.slice(3);
  if (digits.length < 8) return null;
  return digits;
}

/**
 * Reads only 訂購人 / 訂購人電話 out of the raw sheet — see the file-level note
 * for why this is the one place that's allowed to. One row per order
 * (multi-line orders collapse the same way `parseShowmore` does), and the
 * date/status/amount rules are identical to revenue's own (訂單編號 prefix or
 * 付款時間 for the date, 總額 for the amount, `EXCLUDED_STATUSES` dropped), so
 * a customer's `total_spent` and the store's own revenue never disagree about
 * which orders count.
 *
 * @param rows sheet rows including the header row, as read from the CSV/XLSX.
 * @param hash turns a normalized phone number into its hash. The server
 *   action passes `(n) => hashPhone(n, CUSTOMER_PHONE_HASH_SALT)`
 *   (`customerHash.server.ts`); the client-side preview passes its own
 *   non-cryptographic function, since it never needs to match the server's
 *   real hash — only to group repeats consistently within one preview. The
 *   phone number itself never leaves this function; only whatever `hash`
 *   returns does.
 */
export function extractCustomerOrders(rows: unknown[][], hash: (normalized: string) => string): { orders: CustomerOrder[]; warnings: string[] } {
  const warnings: string[] = [];
  if (!rows.length) return { orders: [], warnings: ['The sheet is empty.'] };

  const header = rows[0].map(h => text(h));
  const at = (name: string) => header.indexOf(name);
  const iOrder = at(ORDER_COL);
  if (iOrder < 0) return { orders: [], warnings: [`Column "${ORDER_COL}" not found — is this a Showmore order export?`] };
  const iStatus = at(STATUS_COL), iTotal = at(TOTAL_COL), iPaidAt = at(PAID_AT_COL), iName = at(NAME_COL), iPhone = at(PHONE_COL), iEmail = at(EMAIL_COL);
  if (iPhone < 0) warnings.push(`Column "${PHONE_COL}" is missing — no customers can be identified from this file.`);

  const cell = (row: unknown[], i: number) => (i >= 0 ? row[i] : null);
  const byOrder = new Map<string, { date: string; status: string; amount: number; name: string | null; phone: string | null; email: string | null }>();

  for (const row of rows.slice(1)) {
    const id = text(cell(row, iOrder));
    if (!id) continue; // trailing product-list block, same as parseShowmore
    let o = byOrder.get(id);
    if (!o) {
      const fromId = dateFromOrderNumber(id);
      const fromPaid = dateFromPaidAt(text(cell(row, iPaidAt)));
      o = {
        date: fromId ?? fromPaid ?? '',
        status: text(cell(row, iStatus)),
        amount: 0,
        name: text(cell(row, iName)) || null,
        phone: iPhone >= 0 ? text(cell(row, iPhone)) || null : null,
        // Unlike phone, a missing 收件人 Email column is not warned about — email is
        // opportunistic enrichment, not the identity key a customer is grouped by.
        email: iEmail >= 0 ? text(cell(row, iEmail)) || null : null,
      };
      byOrder.set(id, o);
    }
    o.amount += num(cell(row, iTotal));
  }

  const orders: CustomerOrder[] = [];
  for (const [id, o] of byOrder) {
    if (!o.date) continue; // no derivable date — same exclusion as revenue
    if ((EXCLUDED_STATUSES as readonly string[]).includes(o.status)) continue;
    const normalized = o.phone ? normalizePhone(o.phone) : null;
    orders.push({ orderId: id, date: o.date, amount: o.amount, name: o.name, phoneHash: normalized ? hash(normalized) : null, email: o.email });
  }
  return { orders, warnings };
}

/**
 * Groups already-hashed orders by phone hash. An order with no usable phone
 * (`phoneHash: null`) contributes nothing to any customer's totals, rather
 * than being folded into a fake "unknown" bucket — same missing-denominator
 * discipline as everywhere else in this app. `total_spent` is deliberately a
 * *gross* lifetime figure (a `已退貨` order still counts, same as revenue's own
 * gross total) — a returns-aware net figure would need a column this table
 * doesn't have yet; flagged here rather than silently decided. `name` and
 * `email` both take whichever order has the latest date, so a rare legal-name
 * change or a customer switching emails doesn't get stuck on an old order's
 * value — same "most recent wins" rule for both.
 */
export function aggregateCustomers(orders: CustomerOrder[]): CustomerAggregate[] {
  const byHash = new Map<string, CustomerAggregate>();
  for (const o of orders) {
    if (!o.phoneHash) continue;
    const c = byHash.get(o.phoneHash) ?? { phoneHash: o.phoneHash, name: null, email: null, ordersCount: 0, totalSpent: 0, firstOrderAt: o.date, lastOrderAt: o.date };
    const isLatest = o.date >= c.lastOrderAt;
    c.ordersCount += 1;
    c.totalSpent += o.amount;
    if (o.date < c.firstOrderAt) c.firstOrderAt = o.date;
    if (o.date > c.lastOrderAt) c.lastOrderAt = o.date;
    if (isLatest && o.name) c.name = o.name;
    if (isLatest && o.email) c.email = o.email;
    byHash.set(o.phoneHash, c);
  }
  return [...byHash.values()].sort((a, b) => b.totalSpent - a.totalSpent);
}
