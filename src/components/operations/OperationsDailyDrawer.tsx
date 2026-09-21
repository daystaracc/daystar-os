'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X, Trash2 } from 'lucide-react';
import { upsertOperationsDaily, deleteOperationsDaily } from '@/app/(app)/operations/actions';
import type { OperationsDailyRow } from '@/lib/data/operations';

export interface OperationsDailyDrawerLabels {
  newDay: string; editDay: string; date: string;
  ordersWaiting: string; ordersShipped: string; errors: string; returns: string; csPending: string;
  fulfillmentStartedAt: string; fulfillmentCompletedAt: string; fulfillmentMinutes: string; csAvgResponseMinutes: string;
  employee: string; noEmployee: string; notes: string; advanced: string; replaceNote: string;
  save: string; saving: string; cancel: string; create: string; close: string; saveFailed: string; deleteFailed: string;
  deleteDayConfirm: string; deleteEntry: string;
}

/**
 * Add/Edit drawer for one `operations_daily` row. Saving REPLACES that day's
 * figures (upsert on `unique(organization_id, date)`) — same idiom as Finance's
 * `FinancialMonthlyDrawer`. The four counts fulfillment actually watches day to
 * day (orders waiting/shipped, errors, returns) are up front; the timing fields
 * (start/complete time, minutes, CS response time) and employee attribution sit
 * under Advanced since they're slower to fill in and not every day needs them.
 */
export function OperationsDailyDrawer({ entry, defaultDate, owners, labels, onCloseHref }: {
  entry?: OperationsDailyRow; defaultDate: string; owners: { id: string; name: string }[]; labels: OperationsDailyDrawerLabels; onCloseHref: string;
}) {
  const router = useRouter();
  const editing = !!entry;
  const panelRef = useRef<HTMLDivElement>(null);
  const [advanced, setAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const [date, setDate] = useState(entry?.date ?? defaultDate);
  const [ordersWaiting, setOrdersWaiting] = useState(entry ? String(entry.ordersWaiting) : '0');
  const [ordersShipped, setOrdersShipped] = useState(entry ? String(entry.ordersShipped) : '0');
  const [errors, setErrors] = useState(entry ? String(entry.errors) : '0');
  const [returns, setReturns] = useState(entry ? String(entry.returns) : '0');
  const [csPending, setCsPending] = useState(entry ? String(entry.csPending) : '0');
  const [fulfillmentStartedAt, setFulfillmentStartedAt] = useState(entry?.fulfillmentStartedAt?.slice(0, 5) ?? '');
  const [fulfillmentCompletedAt, setFulfillmentCompletedAt] = useState(entry?.fulfillmentCompletedAt?.slice(0, 5) ?? '');
  const [fulfillmentMinutes, setFulfillmentMinutes] = useState(entry?.fulfillmentMinutes != null ? String(entry.fulfillmentMinutes) : '');
  const [csAvgResponseMinutes, setCsAvgResponseMinutes] = useState(entry?.csAvgResponseMinutes != null ? String(entry.csAvgResponseMinutes) : '');
  const [employeeId, setEmployeeId] = useState(entry?.employeeId ?? '');
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
      const res = await upsertOperationsDaily({
        date, ordersWaiting, ordersShipped, errors, returns, csPending,
        fulfillmentStartedAt, fulfillmentCompletedAt, fulfillmentMinutes, csAvgResponseMinutes, employeeId, notes,
      });
      if (!res.ok) { setError(labels.saveFailed); return; }
      close();
    });
  }

  function remove() {
    if (!entry) return;
    if (!window.confirm(labels.deleteDayConfirm)) return;
    setError(null);
    start(async () => {
      const res = await deleteOperationsDaily(entry.id);
      if (!res.ok) { setError(labels.deleteFailed); return; }
      close();
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button aria-label={labels.close} onClick={close} className="absolute inset-0 bg-ink/20" />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={editing ? labels.editDay : labels.newDay}
        className="relative flex h-full w-full max-w-[28rem] animate-fade-up flex-col bg-surface shadow-drawer">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide">{editing ? labels.editDay : labels.newDay}</h2>
          <button onClick={close} aria-label={labels.close} className="btn-ghost h-8 w-8 px-0"><X className="h-4 w-4" /></button>
        </header>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {error && <p className="rounded-md bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}

            <Field label={labels.date}>
              <input type="date" required value={date} onChange={e => setDate(e.target.value)} className="input" />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label={labels.ordersWaiting}>
                <input type="number" min={0} step="1" value={ordersWaiting} onChange={e => setOrdersWaiting(e.target.value)} className="input" />
              </Field>
              <Field label={labels.ordersShipped}>
                <input type="number" min={0} step="1" value={ordersShipped} onChange={e => setOrdersShipped(e.target.value)} className="input" />
              </Field>
              <Field label={labels.errors}>
                <input type="number" min={0} step="1" value={errors} onChange={e => setErrors(e.target.value)} className="input" />
              </Field>
              <Field label={labels.returns}>
                <input type="number" min={0} step="1" value={returns} onChange={e => setReturns(e.target.value)} className="input" />
              </Field>
              <Field label={labels.csPending}>
                <input type="number" min={0} step="1" value={csPending} onChange={e => setCsPending(e.target.value)} className="input" />
              </Field>
            </div>

            <button type="button" onClick={() => setAdvanced(a => !a)} aria-expanded={advanced}
              className="flex w-full items-center gap-1 border-t border-border pt-4 text-sm text-ink-2 hover:text-ink">
              {labels.advanced}
            </button>

            {advanced && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Field label={labels.fulfillmentStartedAt}>
                    <input type="time" value={fulfillmentStartedAt} onChange={e => setFulfillmentStartedAt(e.target.value)} className="input" />
                  </Field>
                  <Field label={labels.fulfillmentCompletedAt}>
                    <input type="time" value={fulfillmentCompletedAt} onChange={e => setFulfillmentCompletedAt(e.target.value)} className="input" />
                  </Field>
                  <Field label={labels.fulfillmentMinutes}>
                    <input type="number" min={0} step="1" value={fulfillmentMinutes} onChange={e => setFulfillmentMinutes(e.target.value)} className="input" />
                  </Field>
                  <Field label={labels.csAvgResponseMinutes}>
                    <input type="number" min={0} step="1" value={csAvgResponseMinutes} onChange={e => setCsAvgResponseMinutes(e.target.value)} className="input" />
                  </Field>
                </div>

                <Field label={labels.employee}>
                  <select value={employeeId} onChange={e => setEmployeeId(e.target.value)} className="input">
                    <option value="">{labels.noEmployee}</option>
                    {owners.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </Field>

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
