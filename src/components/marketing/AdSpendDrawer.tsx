'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X, Trash2 } from 'lucide-react';
import { upsertAdSpend, deleteAdSpend } from '@/app/(app)/marketing/actions';
import { AD_PLATFORM, type AdPlatform } from '@/lib/marketing/constants';
import type { AdSpendRow } from '@/lib/data/marketing';

export interface AdSpendDrawerLabels {
  newAdSpend: string; editAdSpend: string; date: string; platform: string; spend: string; revenue: string;
  impressions: string; clicks: string; purchases: string; advanced: string; replaceNote: string;
  save: string; saving: string; cancel: string; create: string; close: string; saveFailed: string; deleteFailed: string;
  deleteAdSpendConfirm: string; deleteEntry: string;
  platformLabels: Record<AdPlatform, string>;
}

/**
 * Add/Edit drawer for one `ad_spend_daily` row (one platform, one day). Saving
 * REPLACES that platform's figures for the date (upsert on
 * `unique(organization_id, date, platform)`) — identical idiom to
 * `RevenueEntryDrawer.tsx`, right down to the `replaceNote` hint text.
 */
export function AdSpendDrawer({ entry, defaultDate, labels, onCloseHref }: {
  entry?: AdSpendRow; defaultDate: string; labels: AdSpendDrawerLabels; onCloseHref: string;
}) {
  const router = useRouter();
  const editing = !!entry;
  const panelRef = useRef<HTMLDivElement>(null);
  const [advanced, setAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const [date, setDate] = useState(entry?.date ?? defaultDate);
  const [platform, setPlatform] = useState<AdPlatform>(entry?.platform ?? AD_PLATFORM[0]);
  const [spend, setSpend] = useState(entry ? String(entry.spend) : '0');
  const [revenue, setRevenue] = useState(entry ? String(entry.revenue) : '0');
  const [impressions, setImpressions] = useState(entry ? String(entry.impressions) : '0');
  const [clicks, setClicks] = useState(entry ? String(entry.clicks) : '0');
  const [purchases, setPurchases] = useState(entry ? String(entry.purchases) : '0');

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
      const res = await upsertAdSpend({ date, platform, spend, revenue, impressions, clicks, purchases });
      if (!res.ok) { setError(labels.saveFailed); return; }
      close();
    });
  }

  function remove() {
    if (!entry) return;
    if (!window.confirm(labels.deleteAdSpendConfirm)) return;
    setError(null);
    start(async () => {
      const res = await deleteAdSpend(entry.id);
      if (!res.ok) { setError(labels.deleteFailed); return; }
      close();
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button aria-label={labels.close} onClick={close} className="absolute inset-0 bg-ink/20" />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={editing ? labels.editAdSpend : labels.newAdSpend}
        className="relative flex h-full w-full max-w-[26rem] animate-fade-up flex-col bg-surface shadow-drawer">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide">{editing ? labels.editAdSpend : labels.newAdSpend}</h2>
          <button onClick={close} aria-label={labels.close} className="btn-ghost h-8 w-8 px-0"><X className="h-4 w-4" /></button>
        </header>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {error && <p className="rounded-md bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}

            <div className="grid grid-cols-2 gap-3">
              <Field label={labels.date}>
                <input type="date" required value={date} onChange={e => setDate(e.target.value)} className="input" />
              </Field>
              <Field label={labels.platform}>
                <select value={platform} onChange={e => setPlatform(e.target.value as AdPlatform)} className="input">
                  {AD_PLATFORM.map(p => <option key={p} value={p}>{labels.platformLabels[p]}</option>)}
                </select>
              </Field>
              <Field label={labels.spend}>
                <input type="number" min={0} step="1" required value={spend} onChange={e => setSpend(e.target.value)} className="input" />
              </Field>
              <Field label={labels.revenue}>
                <input type="number" min={0} step="1" required value={revenue} onChange={e => setRevenue(e.target.value)} className="input" />
              </Field>
            </div>

            <button type="button" onClick={() => setAdvanced(a => !a)} aria-expanded={advanced}
              className="flex w-full items-center gap-1 border-t border-border pt-4 text-sm text-ink-2 hover:text-ink">
              {labels.advanced}
            </button>

            {advanced && (
              <div className="grid grid-cols-3 gap-3">
                <Field label={labels.impressions}>
                  <input type="number" min={0} step="1" value={impressions} onChange={e => setImpressions(e.target.value)} className="input" />
                </Field>
                <Field label={labels.clicks}>
                  <input type="number" min={0} step="1" value={clicks} onChange={e => setClicks(e.target.value)} className="input" />
                </Field>
                <Field label={labels.purchases}>
                  <input type="number" min={0} step="1" value={purchases} onChange={e => setPurchases(e.target.value)} className="input" />
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
