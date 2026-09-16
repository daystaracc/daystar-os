import 'server-only';
import { createHmac } from 'node:crypto';

/**
 * HMAC-SHA256, not a bare hash — resists a rainbow-table attack even if
 * `customers` were ever exposed, since the salt is a server-only secret
 * (`CUSTOMER_PHONE_HASH_SALT`, read from `process.env` in
 * app/(app)/revenue/import/actions.ts, never written to the database or
 * returned to the browser). The same phone number plus the same salt always
 * hashes identically — that determinism is what makes "is this a repeat
 * customer" detectable at all without ever storing the real number.
 *
 * Deliberately its own file (moved out of customerAggregation.ts 2026-09-15):
 * `node:crypto` has no browser build, so a file that imports it can never be
 * pulled into a client bundle. `customerAggregation.ts` is imported by
 * `RevenueImportWizard.tsx` (a Client Component, for the live preview before
 * Confirm) — when `hashPhone` lived in that same file, webpack's client build
 * failed outright: `UnhandledSchemeError: Reading from "node:crypto" is not
 * handled by plugins`. The `server-only` import above turns any *future*
 * repeat of that mistake into a clear build-time error instead of an obscure
 * webpack one. `extractCustomerOrders` (customerAggregation.ts) now takes a
 * plain hash *function* instead of a salt string, so it never needs to import
 * this file — only the server action does.
 */
export function hashPhone(normalizedPhone: string, salt: string): string {
  return createHmac('sha256', salt).update(normalizedPhone).digest('hex');
}
