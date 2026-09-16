'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { createKeyResult, updateKeyResult } from '@/app/(app)/goals/actions';
import { KR_UNIT, KR_DIRECTION, type KrUnit, type KrDirection } from '@/lib/goals/constants';

export interface KeyResultDrawerLabels {
  newKeyResult: string; editKeyResult: string; title: string; unit: string; direction: string;
  startValue: string; currentValue: string; targetValue: string; deadline: string; owner: string; notes: string; noOwner: string;
  save: string; saving: string; cancel: string; create: string; close: string; saveFailed: string;
  unitLabels: Record<KrUnit, string>; directionLabels: Record<KrDirection, string>;
}

export interface KeyResultDraft {
  id: string; title: string; unit: KrUnit; direction: KrDirection;
  startValue: string; currentValue: string; targetValue: string; deadline: string; ownerId: string; notes: string;
}

/** Create/edit drawer for one key result under an objective. */
export function KeyResultDrawer({ objectiveId, goalId, options, labels, keyResult, onCloseHref }: {
  objectiveId: string; goalId: string; options: { people: { id: string; name: string }[] }; labels: KeyResultDrawerLabels; keyResult?: KeyResultDraft; onCloseHref: string;
}) {
  const router = useRouter();
  const editing = !!keyResult;
  const panelRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const [title, setTitle] = useState(keyResult?.title ?? '');
  const [unit, setUnit] = useState<KrUnit>(keyResult?.unit ?? 'count');
  const [direction, setDirection] = useState<KrDirection>(keyResult?.direction ?? 'increase');
  const [startValue, setStartValue] = useState(keyResult?.startValue ?? '0');
  const [currentValue, setCurrentValue] = useState(keyResult?.currentValue ?? '0');
  const [targetValue, setTargetValue] = useState(keyResult?.targetValue ?? '');
  const [deadline, setDeadline] = useState(keyResult?.deadline ?? '');
  const [ownerId, setOwnerId] = useState(keyResult?.ownerId ?? '');
  const [notes, setNotes] = useState(keyResult?.notes ?? '');

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
      const base = { title, unit, direction, start_value: startValue, current_value: currentValue, target_value: targetValue, deadline, owner_id: ownerId, notes };
      const res = editing
        ? await updateKeyResult(keyResult.id, goalId, base)
        : await createKeyResult({ objective_id: objectiveId, ...base });
      if (!res.ok) { setError(labels.saveFailed); return; }
      close();
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button aria-label={labels.close} onClick={close} className="absolute inset-0 bg-ink/20" />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={editing ? labels.editKeyResult : labels.newKeyResult}
        className="relative flex h-full w-full max-w-[30rem] animate-fade-up flex-col bg-surface shadow-drawer">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide">{editing ? labels.editKeyResult : labels.newKeyResult}</h2>
          <button onClick={close} aria-label={labels.close} className="btn-ghost h-8 w-8 px-0"><X className="h-4 w-4" /></button>
        </header>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {error && <p className="rounded-md bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}

            <Field label={labels.title}>
              <input name="title" required maxLength={200} value={title} onChange={e => setTitle(e.target.value)} className="input" />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label={labels.unit}>
                <select value={unit} onChange={e => setUnit(e.target.value as KrUnit)} className="input">
                  {KR_UNIT.map(u => <option key={u} value={u}>{labels.unitLabels[u]}</option>)}
                </select>
              </Field>
              <Field label={labels.direction}>
                <select value={direction} onChange={e => setDirection(e.target.value as KrDirection)} className="input">
                  {KR_DIRECTION.map(d => <option key={d} value={d}>{labels.directionLabels[d]}</option>)}
                </select>
              </Field>
              <Field label={labels.startValue}>
                <input type="number" step="any" value={startValue} onChange={e => setStartValue(e.target.value)} className="input" />
              </Field>
              <Field label={labels.currentValue}>
                <input type="number" step="any" value={currentValue} onChange={e => setCurrentValue(e.target.value)} className="input" />
              </Field>
              <Field label={labels.targetValue}>
                <input type="number" step="any" required value={targetValue} onChange={e => setTargetValue(e.target.value)} className="input" />
              </Field>
              <Field label={labels.deadline}>
                <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className="input" />
              </Field>
              <Field label={labels.owner}>
                <select value={ownerId} onChange={e => setOwnerId(e.target.value)} className="input">
                  <option value="">{labels.noOwner}</option>
                  {options.people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
            </div>

            <Field label={labels.notes}>
              <textarea rows={3} maxLength={2000} value={notes} onChange={e => setNotes(e.target.value)} className="input h-auto py-2 leading-relaxed" />
            </Field>
          </div>

          <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-4">
            <button type="button" onClick={close} className="btn-outline">{labels.cancel}</button>
            <button type="submit" disabled={pending || !title.trim() || targetValue === ''} className="btn-primary">
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
