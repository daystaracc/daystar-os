'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { createObjective, updateObjective } from '@/app/(app)/goals/actions';
import { OBJECTIVE_PERIOD, GOAL_STATUS, type ObjectivePeriod, type GoalStatus } from '@/lib/goals/constants';

export interface ObjectiveDrawerLabels {
  newObjective: string; editObjective: string; title: string; periodType: string; status: string; owner: string;
  startDate: string; endDate: string; noOwner: string;
  save: string; saving: string; cancel: string; create: string; close: string; saveFailed: string;
  periodLabels: Record<ObjectivePeriod, string>; statusLabels: Record<GoalStatus, string>;
}

export interface ObjectiveDraft {
  id: string; title: string; periodType: ObjectivePeriod; status: GoalStatus;
  ownerId: string; startDate: string; endDate: string;
}

/** Create/edit drawer for one objective under a goal. Same shape as `GoalDrawer`/`ProjectDrawer`. */
export function ObjectiveDrawer({ goalId, options, labels, objective, onCloseHref }: {
  goalId: string; options: { people: { id: string; name: string }[] }; labels: ObjectiveDrawerLabels; objective?: ObjectiveDraft; onCloseHref: string;
}) {
  const router = useRouter();
  const editing = !!objective;
  const panelRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const [title, setTitle] = useState(objective?.title ?? '');
  const [periodType, setPeriodType] = useState<ObjectivePeriod>(objective?.periodType ?? 'quarterly');
  const [status, setStatus] = useState<GoalStatus>(objective?.status ?? 'draft');
  const [ownerId, setOwnerId] = useState(objective?.ownerId ?? '');
  const [startDate, setStartDate] = useState(objective?.startDate ?? '');
  const [endDate, setEndDate] = useState(objective?.endDate ?? '');

  const close = () => router.push(onCloseHref, { scroll: false });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    panelRef.current?.querySelector<HTMLInputElement>('input[name="title"]')?.focus();
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = editing
        ? await updateObjective(objective.id, goalId, { title, period_type: periodType, status, owner_id: ownerId, start_date: startDate, end_date: endDate })
        : await createObjective({ goal_id: goalId, title, period_type: periodType, status, owner_id: ownerId, start_date: startDate, end_date: endDate });
      if (!res.ok) { setError(labels.saveFailed); return; }
      close();
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button aria-label={labels.close} onClick={close} className="absolute inset-0 bg-ink/20" />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={editing ? labels.editObjective : labels.newObjective}
        className="relative flex h-full w-full max-w-[30rem] animate-fade-up flex-col bg-surface shadow-drawer">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide">{editing ? labels.editObjective : labels.newObjective}</h2>
          <button onClick={close} aria-label={labels.close} className="btn-ghost h-8 w-8 px-0"><X className="h-4 w-4" /></button>
        </header>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {error && <p className="rounded-md bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}

            <Field label={labels.title}>
              <input name="title" required maxLength={200} value={title} onChange={e => setTitle(e.target.value)} className="input" />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label={labels.periodType}>
                <select value={periodType} onChange={e => setPeriodType(e.target.value as ObjectivePeriod)} className="input">
                  {OBJECTIVE_PERIOD.map(p => <option key={p} value={p}>{labels.periodLabels[p]}</option>)}
                </select>
              </Field>
              <Field label={labels.status}>
                <select value={status} onChange={e => setStatus(e.target.value as GoalStatus)} className="input">
                  {GOAL_STATUS.map(s => <option key={s} value={s}>{labels.statusLabels[s]}</option>)}
                </select>
              </Field>
              <Field label={labels.owner}>
                <select value={ownerId} onChange={e => setOwnerId(e.target.value)} className="input">
                  <option value="">{labels.noOwner}</option>
                  {options.people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
              <div />
              <Field label={labels.startDate}>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="input" />
              </Field>
              <Field label={labels.endDate}>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="input" />
              </Field>
            </div>
          </div>

          <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-4">
            <button type="button" onClick={close} className="btn-outline">{labels.cancel}</button>
            <button type="submit" disabled={pending || !title.trim()} className="btn-primary">
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
