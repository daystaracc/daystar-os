'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { createGoal, updateGoal } from '@/app/(app)/goals/actions';
import { GOAL_LEVEL, GOAL_STATUS, type GoalLevel, type GoalStatus } from '@/lib/goals/constants';

export interface GoalDrawerOptions { people: { id: string; name: string }[] }

export interface GoalDrawerLabels {
  newGoal: string; editGoal: string; title: string; level: string; status: string; owner: string;
  startDate: string; endDate: string; description: string; noOwner: string;
  save: string; saving: string; cancel: string; create: string; close: string; saveFailed: string;
  levelLabels: Record<GoalLevel, string>; statusLabels: Record<GoalStatus, string>;
}

export interface GoalDraft {
  id: string; title: string; level: GoalLevel; status: GoalStatus;
  ownerId: string; startDate: string; endDate: string; description: string;
}

/** Create/edit drawer for a goal — same shape as `components/projects/ProjectDrawer.tsx`. */
export function GoalDrawer({ options, labels, goal, onCloseHref }: {
  options: GoalDrawerOptions; labels: GoalDrawerLabels; goal?: GoalDraft; onCloseHref: string;
}) {
  const router = useRouter();
  const editing = !!goal;
  const panelRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const [title, setTitle] = useState(goal?.title ?? '');
  const [level, setLevel] = useState<GoalLevel>(goal?.level ?? 'quarterly');
  const [status, setStatus] = useState<GoalStatus>(goal?.status ?? 'draft');
  const [ownerId, setOwnerId] = useState(goal?.ownerId ?? '');
  const [startDate, setStartDate] = useState(goal?.startDate ?? '');
  const [endDate, setEndDate] = useState(goal?.endDate ?? '');
  const [description, setDescription] = useState(goal?.description ?? '');

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
      const base = { title, level, status, owner_id: ownerId, start_date: startDate, end_date: endDate, description };
      const res = editing ? await updateGoal(goal.id, base) : await createGoal(base);
      if (!res.ok) { setError(labels.saveFailed); return; }
      close();
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button aria-label={labels.close} onClick={close} className="absolute inset-0 bg-ink/20" />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={editing ? labels.editGoal : labels.newGoal}
        className="relative flex h-full w-full max-w-[30rem] animate-fade-up flex-col bg-surface shadow-drawer">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide">{editing ? labels.editGoal : labels.newGoal}</h2>
          <button onClick={close} aria-label={labels.close} className="btn-ghost h-8 w-8 px-0"><X className="h-4 w-4" /></button>
        </header>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {error && <p className="rounded-md bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}

            <Field label={labels.title}>
              <input name="title" required maxLength={200} value={title} onChange={e => setTitle(e.target.value)} className="input" />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label={labels.level}>
                <select value={level} onChange={e => setLevel(e.target.value as GoalLevel)} className="input">
                  {GOAL_LEVEL.map(l => <option key={l} value={l}>{labels.levelLabels[l]}</option>)}
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

            <Field label={labels.description}>
              <textarea rows={4} maxLength={5000} value={description} onChange={e => setDescription(e.target.value)} className="input h-auto py-2 leading-relaxed" />
            </Field>
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
