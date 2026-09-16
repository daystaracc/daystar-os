'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { updateBusinessSystem } from '@/app/(app)/company/health/actions';

export interface HealthDrawerOptions { owners: { id: string; name: string }[] }

export interface HealthDrawerLabels {
  editSystem: string; score: string; owner: string; bottleneck: string; nextAction: string;
  futureOwner: string; transferDate: string; goal: string; noOwner: string;
  save: string; saving: string; cancel: string; close: string; saveFailed: string; advanced: string;
}

export interface HealthDraft {
  id: string; name: string; score: number; ownerId: string; bottleneck: string; nextAction: string;
  futureOwner: string; transferDate: string; goal: string;
}

/** Scoring drawer for one of the 11 fixed business systems — edit only, no create/delete (see lib/data/companyHealth.ts). Four fields visible (score/owner/bottleneck/next action) + Advanced — same disclosure rule as `ProductDrawer.tsx`. */
export function HealthDrawer({ options, labels, system, onCloseHref }: {
  options: HealthDrawerOptions; labels: HealthDrawerLabels; system: HealthDraft; onCloseHref: string;
}) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const [advanced, setAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const [score, setScore] = useState(system.score);
  const [ownerId, setOwnerId] = useState(system.ownerId);
  const [bottleneck, setBottleneck] = useState(system.bottleneck);
  const [nextAction, setNextAction] = useState(system.nextAction);
  const [futureOwner, setFutureOwner] = useState(system.futureOwner);
  const [transferDate, setTransferDate] = useState(system.transferDate);
  const [goal, setGoal] = useState(system.goal);

  const close = () => router.push(onCloseHref, { scroll: false });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    panelRef.current?.querySelector<HTMLSelectElement>('select[name="score"]')?.focus();
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await updateBusinessSystem(system.id, {
        score, owner_id: ownerId, bottleneck, next_action: nextAction,
        future_owner: futureOwner, transfer_date: transferDate, goal,
      });
      if (!res.ok) { setError(labels.saveFailed); return; }
      close();
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button aria-label={labels.close} onClick={close} className="absolute inset-0 bg-ink/20" />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={`${labels.editSystem}: ${system.name}`}
        className="relative flex h-full w-full max-w-[30rem] animate-fade-up flex-col bg-surface shadow-drawer">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide">{labels.editSystem} · {system.name}</h2>
          <button onClick={close} aria-label={labels.close} className="btn-ghost h-8 w-8 px-0"><X className="h-4 w-4" /></button>
        </header>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {error && <p className="rounded-md bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}

            <div className="grid grid-cols-2 gap-3">
              <Field label={labels.score}>
                <select name="score" value={score} onChange={e => setScore(Number(e.target.value))} className="input">
                  {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </Field>
              <Field label={labels.owner}>
                <select value={ownerId} onChange={e => setOwnerId(e.target.value)} className="input">
                  <option value="">{labels.noOwner}</option>
                  {options.owners.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </Field>
            </div>
            <Field label={labels.bottleneck}>
              <textarea rows={2} maxLength={2000} value={bottleneck} onChange={e => setBottleneck(e.target.value)} className="input h-auto py-2 leading-relaxed" />
            </Field>
            <Field label={labels.nextAction}>
              <input maxLength={500} value={nextAction} onChange={e => setNextAction(e.target.value)} className="input" />
            </Field>

            <button type="button" onClick={() => setAdvanced(a => !a)} aria-expanded={advanced}
              className="flex w-full items-center gap-1 border-t border-border pt-4 text-sm text-ink-2 hover:text-ink">
              {labels.advanced}
            </button>

            {advanced && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Field label={labels.futureOwner}>
                    <input maxLength={200} value={futureOwner} onChange={e => setFutureOwner(e.target.value)} className="input" />
                  </Field>
                  <Field label={labels.transferDate}>
                    <input type="date" value={transferDate} onChange={e => setTransferDate(e.target.value)} className="input" />
                  </Field>
                </div>
                <Field label={labels.goal}>
                  <textarea rows={3} maxLength={2000} value={goal} onChange={e => setGoal(e.target.value)} className="input h-auto py-2 leading-relaxed" />
                </Field>
              </div>
            )}
          </div>

          <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-4">
            <button type="button" onClick={close} className="btn-outline">{labels.cancel}</button>
            <button type="submit" disabled={pending} className="btn-primary">{pending ? labels.saving : labels.save}</button>
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
