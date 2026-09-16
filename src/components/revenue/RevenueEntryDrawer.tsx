'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X, Trash2 } from 'lucide-react';
import { upsertRevenue, deleteRevenue } from '@/app/(app)/revenue/actions';
import { CHANNEL_KEYS, type ChannelKey } from '@/lib/revenue/constants';
import { useRevenueParams } from './params';
import type { RevenueEntry, RevenueChannel } from '@/lib/data/revenue';

export interface RevenueDrawerLabels {
  addEntry: string; editEntry: string; deleteEntry: string; deleteConfirm: string;
  date: string; channel: string; orders: string; grossRevenue: string; refunds: string; platformFees: string; sessions: string; notes: string;
  channelWebsite: string; channelShopee: string; channelOther: string; replaceNote: string;
  save: string; saving: string; saveFailed: string; deleteFailed: string;
  close: string; cancel: string;
}

const CHANNEL_LABEL_KEY: Record<ChannelKey, keyof RevenueDrawerLabels> = { website: 'channelWebsite', shopee: 'channelShopee', other: 'channelOther' };

/**
 * Add/Edit drawer for one `sales_daily` row (one channel, one day). Mirrors
 * `components/tasks/TaskDrawer.tsx`'s structure and error handling exactly.
 */
export function RevenueEntryDrawer({ channels, entry, defaultDate, labels }: {
  channels: RevenueChannel[]; entry?: RevenueEntry; defaultDate: string; labels: RevenueDrawerLabels;
}) {
  const router = useRouter();
  const { href } = useRevenueParams();
  const editing = !!entry;
  const panelRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const [date, setDate] = useState(entry?.date ?? defaultDate);
  const [channelKey, setChannelKey] = useState<ChannelKey>((entry?.channel_key as ChannelKey) || channels.find(c => c.key === 'website')?.key as ChannelKey || CHANNEL_KEYS[0]);
  const [orders, setOrders] = useState(entry ? String(entry.orders) : '0');
  const [gross, setGross] = useState(entry ? String(entry.gross_revenue) : '0');
  const [refunds, setRefunds] = useState(entry ? String(entry.refunds) : '0');
  const [fees, setFees] = useState(entry ? String(entry.platform_fees) : '0');
  const [sessions, setSessions] = useState(entry?.sessions != null ? String(entry.sessions) : '');
  const [notes, setNotes] = useState(entry?.notes ?? '');

  const close = () => router.push(href({ new: null, entry: null }), { scroll: false });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    panelRef.current?.querySelector<HTMLInputElement>('input[name="date"]')?.focus();
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await upsertRevenue({
        date, channelKey, orders, gross_revenue: gross, refunds, platform_fees: fees,
        sessions: sessions.trim() === '' ? '' : sessions, notes,
      });
      if (!res.ok) { setError(labels.saveFailed); return; }
      close();
    });
  }

  function remove() {
    if (!entry) return;
    if (!window.confirm(labels.deleteConfirm)) return;
    setError(null);
    start(async () => {
      const res = await deleteRevenue(entry.id);
      if (!res.ok) { setError(labels.deleteFailed); return; }
      close();
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button aria-label={labels.close} onClick={close} className="absolute inset-0 bg-ink/20" />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={editing ? labels.editEntry : labels.addEntry}
        className="relative flex h-full w-full max-w-[26rem] animate-fade-up flex-col bg-surface shadow-drawer">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide">{editing ? labels.editEntry : labels.addEntry}</h2>
          <button onClick={close} aria-label={labels.close} className="btn-ghost h-8 w-8 px-0"><X className="h-4 w-4" /></button>
        </header>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {error && <p className="rounded-md bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}

            <div className="grid grid-cols-2 gap-3">
              <Field label={labels.date}>
                <input type="date" name="date" required value={date} onChange={e => setDate(e.target.value)} className="input" />
              </Field>
              <Field label={labels.channel}>
                <select value={channelKey} onChange={e => setChannelKey(e.target.value as ChannelKey)} className="input">
                  {CHANNEL_KEYS.map(k => <option key={k} value={k}>{labels[CHANNEL_LABEL_KEY[k]]}</option>)}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label={labels.grossRevenue}>
                <input type="number" min={0} step="1" required value={gross} onChange={e => setGross(e.target.value)} className="input" />
              </Field>
              <Field label={labels.orders}>
                <input type="number" min={0} step="1" required value={orders} onChange={e => setOrders(e.target.value)} className="input" />
              </Field>
              <Field label={labels.refunds}>
                <input type="number" min={0} step="1" value={refunds} onChange={e => setRefunds(e.target.value)} className="input" />
              </Field>
              <Field label={labels.platformFees}>
                <input type="number" min={0} step="1" value={fees} onChange={e => setFees(e.target.value)} className="input" />
              </Field>
              <Field label={labels.sessions}>
                <input type="number" min={0} step="1" value={sessions} onChange={e => setSessions(e.target.value)} className="input" />
              </Field>
            </div>

            <Field label={labels.notes}>
              <textarea rows={3} maxLength={2000} value={notes} onChange={e => setNotes(e.target.value)} className="input h-auto py-2 leading-relaxed" />
            </Field>

            <p className="text-xs text-ink-3">{labels.replaceNote}</p>
          </div>

          <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-5 py-4">
            {editing
              ? <button type="button" onClick={remove} disabled={pending} className="btn-ghost text-bad"><Trash2 className="h-4 w-4" />{labels.deleteEntry}</button>
              : <span />}
            <div className="flex items-center gap-2">
              <button type="button" onClick={close} className="btn-outline">{labels.cancel}</button>
              <button type="submit" disabled={pending} className="btn-primary">{pending ? labels.saving : labels.save}</button>
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
