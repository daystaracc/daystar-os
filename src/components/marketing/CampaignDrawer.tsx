'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { createCampaign, updateCampaign } from '@/app/(app)/marketing/actions';
import { CAMPAIGN_STATUS, type CampaignStatus } from '@/lib/marketing/constants';

export interface CampaignDrawerLabels {
  newCampaign: string; editCampaign: string; name: string; objective: string; status: string; startDate: string; endDate: string;
  budget: string; offer: string; notes: string; advanced: string;
  save: string; saving: string; cancel: string; create: string; close: string; saveFailed: string;
  statusLabels: Record<CampaignStatus, string>;
}

export interface CampaignDraft {
  id: string; name: string; objective: string; status: CampaignStatus; startDate: string; endDate: string;
  budget: string; offer: string; notes: string;
}

/** Create/edit drawer for a campaign. Five fields visible (name/status/start/end/objective) + Advanced (budget/offer/notes) — same disclosure rule as `ContentDrawer.tsx`. */
export function CampaignDrawer({ labels, campaign, onCloseHref }: { labels: CampaignDrawerLabels; campaign?: CampaignDraft; onCloseHref: string }) {
  const router = useRouter();
  const editing = !!campaign;
  const panelRef = useRef<HTMLDivElement>(null);
  const [advanced, setAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const [name, setName] = useState(campaign?.name ?? '');
  const [objective, setObjective] = useState(campaign?.objective ?? '');
  const [status, setStatus] = useState<CampaignStatus>(campaign?.status ?? 'planning');
  const [startDate, setStartDate] = useState(campaign?.startDate ?? '');
  const [endDate, setEndDate] = useState(campaign?.endDate ?? '');
  const [budget, setBudget] = useState(campaign?.budget ?? '');
  const [offer, setOffer] = useState(campaign?.offer ?? '');
  const [notes, setNotes] = useState(campaign?.notes ?? '');

  const close = () => router.push(onCloseHref, { scroll: false });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    panelRef.current?.querySelector<HTMLInputElement>('input[name="name"]')?.focus();
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const base = { name, objective, status, start_date: startDate, end_date: endDate, budget, offer, notes };
      const res = editing ? await updateCampaign(campaign.id, base) : await createCampaign(base);
      if (!res.ok) { setError(labels.saveFailed); return; }
      close();
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button aria-label={labels.close} onClick={close} className="absolute inset-0 bg-ink/20" />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={editing ? labels.editCampaign : labels.newCampaign}
        className="relative flex h-full w-full max-w-[30rem] animate-fade-up flex-col bg-surface shadow-drawer">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide">{editing ? labels.editCampaign : labels.newCampaign}</h2>
          <button onClick={close} aria-label={labels.close} className="btn-ghost h-8 w-8 px-0"><X className="h-4 w-4" /></button>
        </header>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {error && <p className="rounded-md bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}

            <Field label={labels.name}>
              <input name="name" required maxLength={200} value={name} onChange={e => setName(e.target.value)} className="input" />
            </Field>

            <div className="grid grid-cols-3 gap-3">
              <Field label={labels.status}>
                <select value={status} onChange={e => setStatus(e.target.value as CampaignStatus)} className="input">
                  {CAMPAIGN_STATUS.map(s => <option key={s} value={s}>{labels.statusLabels[s]}</option>)}
                </select>
              </Field>
              <Field label={labels.startDate}>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="input" />
              </Field>
              <Field label={labels.endDate}>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="input" />
              </Field>
            </div>

            <Field label={labels.objective}>
              <input maxLength={200} value={objective} onChange={e => setObjective(e.target.value)} className="input" />
            </Field>

            <button type="button" onClick={() => setAdvanced(a => !a)} aria-expanded={advanced}
              className="flex w-full items-center gap-1 border-t border-border pt-4 text-sm text-ink-2 hover:text-ink">
              {labels.advanced}
            </button>

            {advanced && (
              <div className="space-y-4">
                <Field label={labels.budget}>
                  <input type="number" min={0} step="1" value={budget} onChange={e => setBudget(e.target.value)} className="input" />
                </Field>
                <Field label={labels.offer}>
                  <input maxLength={500} value={offer} onChange={e => setOffer(e.target.value)} className="input" />
                </Field>
                <Field label={labels.notes}>
                  <textarea rows={3} maxLength={2000} value={notes} onChange={e => setNotes(e.target.value)} className="input h-auto py-2 leading-relaxed" />
                </Field>
              </div>
            )}
          </div>

          <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-4">
            <button type="button" onClick={close} className="btn-outline">{labels.cancel}</button>
            <button type="submit" disabled={pending || !name.trim()} className="btn-primary">
              {pending ? labels.saving : editing ? labels.save : labels.create}
            </button>
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
