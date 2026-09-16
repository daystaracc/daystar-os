'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Upload, AlertTriangle, CheckCircle2, ArrowLeft } from 'lucide-react';
import { parseCsv } from '@/lib/import/csv';
import { parseShowmore, type ShowmoreParseResult } from '@/lib/import/showmore';
import { extractCustomerOrders, aggregateCustomers } from '@/lib/import/customerAggregation';
import { importShowmoreOrders, importShowmoreCustomers, type RevenueImportOutcome, type CustomerImportOutcome } from './actions';
import { formatTWD } from '@/lib/calculations/format';
import type { Locale } from '@/lib/i18n';

// Used only to compute preview COUNTS in the browser (unique/repeat customers) —
// never the real secret. The write path re-parses the raw file text server-side
// with the real `CUSTOMER_PHONE_HASH_SALT`, so this value never has to be, and
// never is, the actual salt. See app/(app)/revenue/import/actions.ts.
const PREVIEW_SALT = 'preview-only-not-a-secret';

// A plain, non-cryptographic string hash (FNV-1a) — NOT `customerHash.server.ts`'s
// HMAC-SHA256, and deliberately so: that one imports `node:crypto`, which has no
// browser build, so it can only ever run in the server action. This function only
// needs to group the same phone number together consistently within one preview
// (for the "N customers, M repeat" counts shown before Confirm) — it is never sent
// anywhere, never compared against the real hash, and never determines what gets
// written. See the file-level note in lib/import/customerAggregation.ts.
function previewHash(normalized: string): string {
  let h = 0x811c9dc5;
  const s = normalized + PREVIEW_SALT;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16);
}

export interface RevenueImportLabels {
  title: string; subtitle: string; choose: string; chooseHint: string;
  previewTitle: string; dateRange: string; orders: string; gross: string; refunds: string; days: string;
  channelWebsite: string; channelShopee: string; channelOther: string;
  excluded: string; warnings: string; replaceNote: string;
  confirm: string; importing: string; cancel: string;
  doneTitle: string; created: string; updated: string; unchanged: string;
  nothing: string; failed: string; backToRevenue: string;
  customersTitle: string; customersFound: string; customersRepeat: string; customersReplaceNote: string;
  customersDone: string; customersFailed: string;
}

const CHANNEL_LABEL: Record<string, keyof RevenueImportLabels> = { website: 'channelWebsite', shopee: 'channelShopee', other: 'channelOther' };

/**
 * Order-export import: choose a file → see exactly what it aggregates to (day ×
 * channel totals, excluded orders, warnings) → confirm. The preview runs the same
 * pure `parseShowmore` the server action re-runs on the raw text — nothing is
 * written on the strength of a number the user has not already seen, and nothing at
 * all is written before Confirm. Mirrors `settings/import/ImportWizard.tsx`.
 */
export function RevenueImportWizard({ locale, labels }: { locale: Locale; labels: RevenueImportLabels }) {
  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<ShowmoreParseResult | null>(null);
  const [customerPreview, setCustomerPreview] = useState<{ count: number; repeat: number; totalSpent: number } | null>(null);
  const [outcome, setOutcome] = useState<RevenueImportOutcome | null>(null);
  const [customerOutcome, setCustomerOutcome] = useState<CustomerImportOutcome | null>(null);
  const [pending, startTransition] = useTransition();

  async function onFile(file: File | undefined) {
    if (!file) return;
    setOutcome(null);
    setCustomerOutcome(null);
    const content = await file.text();
    setText(content);
    setFileName(file.name);
    const rows = parseCsv(content);
    setPreview(parseShowmore(rows));
    const { orders } = extractCustomerOrders(rows, previewHash);
    const customers = aggregateCustomers(orders);
    setCustomerPreview({ count: customers.length, repeat: customers.filter(c => c.ordersCount > 1).length, totalSpent: customers.reduce((a, c) => a + c.totalSpent, 0) });
  }

  function confirm() {
    if (!text) return;
    startTransition(async () => {
      const [result, customerResult] = await Promise.all([importShowmoreOrders(text), importShowmoreCustomers(text)]);
      setOutcome(result);
      setCustomerOutcome(customerResult);
      if (result.ok) { setPreview(null); setText(null); setCustomerPreview(null); }
    });
  }

  const empty = preview && preview.days.length === 0;

  return (
    <div className="space-y-6">
      <Link href="/revenue" className="inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" />{labels.backToRevenue}</Link>

      <div className="card card-pad">
        <label className="flex cursor-pointer items-center gap-3">
          <span className="btn-outline"><Upload className="h-4 w-4" />{labels.choose}</span>
          <input type="file" accept=".csv,text/csv" className="sr-only"
            onChange={e => void onFile(e.target.files?.[0])} />
          <span className="min-w-0 truncate text-sm text-ink-3">{fileName || labels.chooseHint}</span>
        </label>
      </div>

      {outcome && (
        <div className={`card card-pad ${outcome.ok ? '' : 'border border-bad'}`}>
          <div className="flex items-start gap-2">
            {outcome.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-bad" />}
            <div className="min-w-0">
              <div className="text-sm font-medium">{outcome.ok ? labels.doneTitle : labels.failed}</div>
              {outcome.message && <p className="mt-1 text-sm text-ink-2">{outcome.message}</p>}
              {outcome.summary && (
                <dl className="mt-3 grid grid-cols-3 gap-x-6 gap-y-1 text-sm">
                  <Stat label={labels.created} value={outcome.summary.created.toLocaleString('en-US')} />
                  <Stat label={labels.updated} value={outcome.summary.updated.toLocaleString('en-US')} />
                  <Stat label={labels.unchanged} value={outcome.summary.unchanged.toLocaleString('en-US')} />
                </dl>
              )}
            </div>
          </div>
        </div>
      )}

      {customerOutcome && (
        <div className={`card card-pad ${customerOutcome.ok ? '' : 'border border-bad'}`}>
          <div className="flex items-start gap-2">
            {customerOutcome.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-bad" />}
            <div className="min-w-0">
              <div className="text-sm font-medium">{customerOutcome.ok ? labels.customersDone : labels.customersFailed}</div>
              {customerOutcome.message && <p className="mt-1 text-sm text-ink-2">{customerOutcome.message}</p>}
              {customerOutcome.summary && (
                <dl className="mt-3 grid grid-cols-3 gap-x-6 gap-y-1 text-sm">
                  <Stat label={labels.customersFound} value={customerOutcome.summary.customers.toLocaleString('en-US')} />
                  <Stat label={labels.customersRepeat} value={customerOutcome.summary.repeatCustomers.toLocaleString('en-US')} />
                  <Stat label={labels.gross} value={formatTWD(customerOutcome.summary.totalSpent, locale)} />
                </dl>
              )}
            </div>
          </div>
        </div>
      )}

      {empty && (
        <div className="card card-pad border border-bad">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-bad" />
            <p className="text-sm text-ink-2">{preview.warnings[0] ?? labels.nothing}</p>
          </div>
        </div>
      )}

      {preview && preview.days.length > 0 && (
        <div className="card card-pad space-y-5">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide">{labels.previewTitle}</h2>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
              <Stat label={labels.dateRange} value={preview.dateRange ? `${preview.dateRange.from} → ${preview.dateRange.to}` : '—'} />
              <Stat label={labels.orders} value={preview.totals.orders.toLocaleString('en-US')} big />
              <Stat label={labels.gross} value={formatTWD(preview.totals.gross, locale)} big />
              <Stat label={labels.refunds} value={formatTWD(preview.totals.refunds, locale)} big />
            </dl>
          </div>

          <div>
            <div className="label mb-2">{labels.days}</div>
            <div className="max-h-64 overflow-y-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-border">
                  {preview.days.map(d => (
                    <tr key={`${d.date}|${d.channelKey}`}>
                      <td className="px-3 py-1.5 tabular-nums">{d.date}</td>
                      <td className="px-3 py-1.5">{labels[CHANNEL_LABEL[d.channelKey]]}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-ink-3">{d.orders} {labels.orders.toLowerCase()}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-medium">{formatTWD(d.gross, locale)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-ink-3">{d.refunds ? formatTWD(d.refunds, locale) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {preview.orders.excluded.length > 0 && (
            <div>
              <div className="label mb-2">{labels.excluded} · {preview.orders.excluded.length}</div>
              <ul className="max-h-32 space-y-1 overflow-y-auto text-sm text-ink-2">
                {preview.orders.excluded.map(e => (
                  <li key={e.id} className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />
                    <span>{e.id} — {e.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {preview.warnings.length > 0 && (
            <div>
              <div className="label mb-2">{labels.warnings}</div>
              <ul className="space-y-1 text-sm text-ink-2">
                {preview.warnings.map(w => (
                  <li key={w} className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />{w}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {customerPreview && customerPreview.count > 0 && (
            <div className="border-t border-border pt-4">
              <div className="label mb-2">{labels.customersTitle}</div>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
                <Stat label={labels.customersFound} value={customerPreview.count.toLocaleString('en-US')} big />
                <Stat label={labels.customersRepeat} value={customerPreview.repeat.toLocaleString('en-US')} big />
                <Stat label={labels.gross} value={formatTWD(customerPreview.totalSpent, locale)} big />
              </dl>
              <p className="mt-2 text-xs text-ink-3">{labels.customersReplaceNote}</p>
            </div>
          )}

          <p className="text-xs text-ink-3">{labels.replaceNote}</p>

          <div className="flex items-center gap-2 border-t border-border pt-4">
            <button className="btn-primary" onClick={confirm} disabled={pending}>
              {pending ? labels.importing : labels.confirm}
            </button>
            <button className="btn-ghost" onClick={() => { setPreview(null); setText(null); setFileName(''); setCustomerPreview(null); }} disabled={pending}>
              {labels.cancel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="label">{label}</dt>
      <dd className={`tabular-nums ${big ? 'text-xl font-semibold' : 'font-medium'}`}>{value}</dd>
    </div>
  );
}
