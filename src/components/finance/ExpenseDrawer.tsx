'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X, Trash2 } from 'lucide-react';
import { createExpense, updateExpense, deleteExpense } from '@/app/(app)/finance/actions';
import type { ExpenseRow } from '@/lib/data/finance';

export interface ExpenseDrawerLabels {
  newExpense: string; editExpense: string; date: string; category: string; amount: string; vendor: string; note: string;
  save: string; saving: string; cancel: string; create: string; close: string; saveFailed: string; deleteFailed: string;
  deleteExpense: string; deleteExpenseConfirm: string;
}

/**
 * Create/edit drawer for one `expenses` row. Just 5 fields — no Advanced toggle
 * needed, unlike every other drawer this session. `category` is plain free text:
 * the `expenses` table has no CHECK constraint on it (unlike every enum this app
 * has built against — campaign status, ad platform, etc.), so the form doesn't
 * invent a fixed list either.
 */
export function ExpenseDrawer({ entry, defaultDate, labels, onCloseHref }: {
  entry?: ExpenseRow; defaultDate: string; labels: ExpenseDrawerLabels; onCloseHref: string;
}) {
  const router = useRouter();
  const editing = !!entry;
  const panelRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const [date, setDate] = useState(entry?.date ?? defaultDate);
  const [category, setCategory] = useState(entry?.category ?? '');
  const [amount, setAmount] = useState(entry ? String(entry.amount) : '');
  const [vendor, setVendor] = useState(entry?.vendor ?? '');
  const [note, setNote] = useState(entry?.note ?? '');

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
      const base = { date, category, amount, vendor, note };
      const res = editing ? await updateExpense(entry.id, base) : await createExpense(base);
      if (!res.ok) { setError(labels.saveFailed); return; }
      close();
    });
  }

  function remove() {
    if (!entry) return;
    if (!window.confirm(labels.deleteExpenseConfirm)) return;
    setError(null);
    start(async () => {
      const res = await deleteExpense(entry.id);
      if (!res.ok) { setError(labels.deleteFailed); return; }
      close();
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button aria-label={labels.close} onClick={close} className="absolute inset-0 bg-ink/20" />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={editing ? labels.editExpense : labels.newExpense}
        className="relative flex h-full w-full max-w-[26rem] animate-fade-up flex-col bg-surface shadow-drawer">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide">{editing ? labels.editExpense : labels.newExpense}</h2>
          <button onClick={close} aria-label={labels.close} className="btn-ghost h-8 w-8 px-0"><X className="h-4 w-4" /></button>
        </header>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {error && <p className="rounded-md bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}

            <div className="grid grid-cols-2 gap-3">
              <Field label={labels.date}>
                <input type="date" required value={date} onChange={e => setDate(e.target.value)} className="input" />
              </Field>
              <Field label={labels.amount}>
                <input type="number" min={0.01} step="0.01" required value={amount} onChange={e => setAmount(e.target.value)} className="input" />
              </Field>
            </div>

            <Field label={labels.category}>
              <input required maxLength={100} value={category} onChange={e => setCategory(e.target.value)} className="input" />
            </Field>

            <Field label={labels.vendor}>
              <input maxLength={200} value={vendor} onChange={e => setVendor(e.target.value)} className="input" />
            </Field>

            <Field label={labels.note}>
              <textarea rows={3} maxLength={2000} value={note} onChange={e => setNote(e.target.value)} className="input h-auto py-2 leading-relaxed" />
            </Field>
          </div>

          <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-5 py-4">
            {editing
              ? <button type="button" onClick={remove} disabled={pending} className="btn-ghost text-bad"><Trash2 className="h-4 w-4" />{labels.deleteExpense}</button>
              : <span />}
            <div className="flex items-center gap-2">
              <button type="button" onClick={close} className="btn-outline">{labels.cancel}</button>
              <button type="submit" disabled={pending || !category.trim() || !amount} className="btn-primary">
                {pending ? labels.saving : editing ? labels.save : labels.create}
              </button>
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
