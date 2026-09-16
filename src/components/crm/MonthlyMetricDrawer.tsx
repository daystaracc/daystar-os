'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X, Trash2 } from 'lucide-react';
import { upsertMonthlyMetric, deleteMonthlyMetric } from '@/app/(app)/crm/actions';
import type { MonthlyMetricRow } from '@/lib/data/crm';

export interface MonthlyMetricDrawerLabels {
  newMonth: string; editMonth: string; month: string; customers: string; newCustomers: string; returningCustomers: string;
  repeatRate: string; repeatRevenue: string; retentionRevenue: string; avgOrders: string; ltv: string; advanced: string; replaceNote: string;
  save: string; saving: string; cancel: string; create: string; close: string; saveFailed: string; deleteFailed: string;
  deleteMonthConfirm: string; deleteEntry: string;
}

/**
 * Add/Edit drawer for one `crm_metrics_monthly` row. Saving REPLACES that month's
 * figures (upsert on `unique(organization_id, month)`) — same idiom as
 * `RevenueEntryDrawer.tsx` / `AdSpendDrawer.tsx`. Every field here is typed in by
 * hand today (see the scope note in lib/data/crm.ts: there's no `customers` data
 * yet to compute this from automatically).
 */
export function MonthlyMetricDrawer({ entry, defaultMonth, labels, onCloseHref }: {
  entry?: MonthlyMetricRow; defaultMonth: string; labels: MonthlyMetricDrawerLabels; onCloseHref: string;
}) {
  const router = useRouter();
  const editing = !!entry;
  const panelRef = useRef<HTMLDivElement>(null);
  const [advanced, setAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const [month, setMonth] = useState(entry?.month ?? defaultMonth);
  const [customers, setCustomers] = useState(entry ? String(entry.customers) : '0');
  const [newCustomers, setNewCustomers] = useState(entry ? String(entry.newCustomers) : '0');
  const [returningCustomers, setReturningCustomers] = useState(entry ? String(entry.returningCustomers) : '0');
  const [repeatRate, setRepeatRate] = useState(entry?.repeatRate != null ? String(entry.repeatRate) : '');
  const [repeatRevenue, setRepeatRevenue] = useState(entry ? String(entry.repeatRevenue) : '0');
  const [retentionRevenue, setRetentionRevenue] = useState(entry ? String(entry.retentionRevenue) : '0');
  const [avgOrders, setAvgOrders] = useState(entry?.avgOrders != null ? String(entry.avgOrders) : '');
  const [ltv, setLtv] = useState(entry?.ltv != null ? String(entry.ltv) : '');

  const close = () => router.push(onCloseHref, { scroll: false });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await upsertMonthlyMetric({
        month, customers, newCustomers, returningCustomers, repeatRate, repeatRevenue, retentionRevenue, avgOrders, ltv,
      });
      if (!res.ok) { setError(labels.saveFailed); return; }
      close();
    });
  }

  function remove() {
    if (!entry) return;
    if (!window.confirm(labels.deleteMonthConfirm)) return;
    setError(null);
    start(async () => {
      const res = await deleteMonthlyMetric(entry.id);
      if (!res.ok) { setError(labels.deleteFailed); return; }
      close();
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button aria-label={labels.close} onClick={close} className="absolute inset-0 bg-ink/20" />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={editing ? labels.editMonth : labels.newMonth}
        className="relative flex h-full w-full max-w-[26rem] animate-fade-up flex-col bg-surface shadow-drawer">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide">{editing ? labels.editMonth : labels.newMonth}</h2>
          <button onClick={close} aria-label={labels.close} className="btn-ghost h-8 w-8 px-0"><X className="h-4 w-4" /></button>
        </header>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {error && <p className="rounded-md bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}

            <div className="grid grid-cols-2 gap-3">
              <Field label={labels.month}>
                <input type="month" required value={month.slice(0, 7)} onChange={e => setMonth(`${e.target.value}-01`)} className="input" />
              </Field>
              <Field label={labels.customers}>
                <input type="number" min={0} step="1" required value={customers} onChange={e => setCustomers(e.target.value)} className="input" />
              </Field>
              <Field label={labels.newCustomers}>
                <input type="number" min={0} step="1" value={newCustomers} onChange={e => setNewCustomers(e.target.value)} className="input" />
              </Field>
              <Field label={labels.returningCustomers}>
                <input type="number" min={0} step="1" value={returningCustomers} onChange={e => setReturningCustomers(e.target.value)} className="input" />
              </Field>
            </div>

            <button type="button" onClick={() => setAdvanced(a => !a)} aria-expanded={advanced}
              className="flex w-full items-center gap-1 border-t border-border pt-4 text-sm text-ink-2 hover:text-ink">
              {labels.advanced}
            </button>

            {advanced && (
              <div className="grid grid-cols-2 gap-3">
                <Field label={labels.repeatRate}>
                  <input type="number" min={0} max={100} step="0.1" value={repeatRate} onChange={e => setRepeatRate(e.target.value)} className="input" />
                </Field>
                <Field label={labels.avgOrders}>
                  <input type="number" min={0} step="0.1" value={avgOrders} onChange={e => setAvgOrders(e.target.value)} className="input" />
                </Field>
                <Field label={labels.repeatRevenue}>
                  <input type="number" min={0} step="1" value={repeatRevenue} onChange={e => setRepeatRevenue(e.target.value)} className="input" />
                </Field>
                <Field label={labels.retentionRevenue}>
                  <input type="number" min={0} step="1" value={retentionRevenue} onChange={e => setRetentionRevenue(e.target.value)} className="input" />
                </Field>
                <Field label={labels.ltv}>
                  <input type="number" min={0} step="1" value={ltv} onChange={e => setLtv(e.target.value)} className="input" />
                </Field>
              </div>
            )}

            <p className="text-xs text-ink-3">{labels.replaceNote}</p>
          </div>

          <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-5 py-4">
            {editing
              ? <button type="button" onClick={remove} disabled={pending} className="btn-ghost text-bad"><Trash2 className="h-4 w-4" />{labels.deleteEntry}</button>
              : <span />}
            <div className="flex items-center gap-2">
              <button type="button" onClick={close} className="btn-outline">{labels.cancel}</button>
              <button type="submit" disabled={pending} className="btn-primary">{pending ? labels.saving : editing ? labels.save : labels.create}</button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
