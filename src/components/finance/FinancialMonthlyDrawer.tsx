'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X, Trash2 } from 'lucide-react';
import { upsertFinancialMonthly, deleteFinancialMonthly } from '@/app/(app)/finance/actions';
import type { FinancialMonthlyRow } from '@/lib/data/finance';

export interface FinancialMonthlyDrawerLabels {
  newMonth: string; editMonth: string; month: string; revenue: string; cogs: string; cashBalance: string; inventoryValue: string;
  paymentFees: string; shipping: string; packaging: string; advertising: string; returns: string; operatingExpenses: string; notes: string;
  advanced: string; replaceNote: string;
  save: string; saving: string; cancel: string; create: string; close: string; saveFailed: string; deleteFailed: string;
  deleteMonthConfirm: string; deleteEntry: string;
}

/**
 * Add/Edit drawer for one `financial_monthly` row. Saving REPLACES that month's
 * figures (upsert on `unique(organization_id, month)`) — same idiom as
 * `RevenueEntryDrawer.tsx` / `AdSpendDrawer.tsx` / CRM's `MonthlyMetricDrawer.tsx`.
 * Visible fields are the four numbers Lucas actually looks at first (revenue,
 * COGS, cash, inventory value — the last two also feed the Command Center);
 * the full contribution-margin waterfall (payment fees / shipping / packaging /
 * ads / returns / opex) lives under Advanced, since most months it's filled in
 * once from a bookkeeping export, not eyeballed line by line.
 */
export function FinancialMonthlyDrawer({ entry, defaultMonth, labels, onCloseHref }: {
  entry?: FinancialMonthlyRow; defaultMonth: string; labels: FinancialMonthlyDrawerLabels; onCloseHref: string;
}) {
  const router = useRouter();
  const editing = !!entry;
  const panelRef = useRef<HTMLDivElement>(null);
  const [advanced, setAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const [month, setMonth] = useState(entry?.month ?? defaultMonth);
  const [revenue, setRevenue] = useState(entry ? String(entry.revenue) : '0');
  const [cogs, setCogs] = useState(entry ? String(entry.cogs) : '0');
  const [cashBalance, setCashBalance] = useState(entry?.cashBalance != null ? String(entry.cashBalance) : '');
  const [inventoryValue, setInventoryValue] = useState(entry?.inventoryValue != null ? String(entry.inventoryValue) : '');
  const [paymentFees, setPaymentFees] = useState(entry ? String(entry.paymentFees) : '0');
  const [shipping, setShipping] = useState(entry ? String(entry.shipping) : '0');
  const [packaging, setPackaging] = useState(entry ? String(entry.packaging) : '0');
  const [advertising, setAdvertising] = useState(entry ? String(entry.advertising) : '0');
  const [returns, setReturns] = useState(entry ? String(entry.returns) : '0');
  const [operatingExpenses, setOperatingExpenses] = useState(entry ? String(entry.operatingExpenses) : '0');
  const [notes, setNotes] = useState(entry?.notes ?? '');

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
      const res = await upsertFinancialMonthly({
        month, revenue, cogs, cashBalance, inventoryValue, paymentFees, shipping, packaging, advertising, returns, operatingExpenses, notes,
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
      const res = await deleteFinancialMonthly(entry.id);
      if (!res.ok) { setError(labels.deleteFailed); return; }
      close();
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button aria-label={labels.close} onClick={close} className="absolute inset-0 bg-ink/20" />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={editing ? labels.editMonth : labels.newMonth}
        className="relative flex h-full w-full max-w-[28rem] animate-fade-up flex-col bg-surface shadow-drawer">
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
              <Field label={labels.revenue}>
                <input type="number" min={0} step="1" required value={revenue} onChange={e => setRevenue(e.target.value)} className="input" />
              </Field>
              <Field label={labels.cogs}>
                <input type="number" min={0} step="1" value={cogs} onChange={e => setCogs(e.target.value)} className="input" />
              </Field>
              <Field label={labels.cashBalance}>
                <input type="number" step="1" value={cashBalance} onChange={e => setCashBalance(e.target.value)} className="input" />
              </Field>
              <Field label={labels.inventoryValue}>
                <input type="number" min={0} step="1" value={inventoryValue} onChange={e => setInventoryValue(e.target.value)} className="input" />
              </Field>
            </div>

            <button type="button" onClick={() => setAdvanced(a => !a)} aria-expanded={advanced}
              className="flex w-full items-center gap-1 border-t border-border pt-4 text-sm text-ink-2 hover:text-ink">
              {labels.advanced}
            </button>

            {advanced && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Field label={labels.paymentFees}>
                    <input type="number" min={0} step="1" value={paymentFees} onChange={e => setPaymentFees(e.target.value)} className="input" />
                  </Field>
                  <Field label={labels.shipping}>
                    <input type="number" min={0} step="1" value={shipping} onChange={e => setShipping(e.target.value)} className="input" />
                  </Field>
                  <Field label={labels.packaging}>
                    <input type="number" min={0} step="1" value={packaging} onChange={e => setPackaging(e.target.value)} className="input" />
                  </Field>
                  <Field label={labels.advertising}>
                    <input type="number" min={0} step="1" value={advertising} onChange={e => setAdvertising(e.target.value)} className="input" />
                  </Field>
                  <Field label={labels.returns}>
                    <input type="number" min={0} step="1" value={returns} onChange={e => setReturns(e.target.value)} className="input" />
                  </Field>
                  <Field label={labels.operatingExpenses}>
                    <input type="number" min={0} step="1" value={operatingExpenses} onChange={e => setOperatingExpenses(e.target.value)} className="input" />
                  </Field>
                </div>
                <Field label={labels.notes}>
                  <textarea rows={3} maxLength={2000} value={notes} onChange={e => setNotes(e.target.value)} className="input h-auto py-2 leading-relaxed" />
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
