'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Pencil, Trash2, Plus } from 'lucide-react';
import { deleteObjective, deleteKeyResult, updateKeyResultValue } from '@/app/(app)/goals/actions';
import type { ObjectiveRow, KeyResultRow } from '@/lib/data/goals';
import type { GoalStatus } from '@/lib/goals/constants';

const STATUS_TONE: Record<GoalStatus, string> = { on_track: 'pill-ok', completed: 'pill-ok', at_risk: 'pill-warn', off_track: 'pill-bad', draft: 'pill-neutral' };
const KR_STATUS_TONE = { on_track: 'pill-ok', completed: 'pill-ok', at_risk: 'pill-warn', off_track: 'pill-bad' } as const;

export interface GoalObjectivesLabels {
  objectives: string; newObjective: string; objectivesEmpty: string;
  keyResults: string; newKeyResult: string; keyResultsEmpty: string;
  updateProgress: string; updateProgressLabel: string; noOwner: string;
  edit: string; deleteObjective: string; deleteObjectiveConfirm: string;
  deleteKeyResult: string; deleteKeyResultConfirm: string; saveFailed: string; noProgress: string;
  statusLabels: Record<GoalStatus, string>;
}

/**
 * Objectives + key results for a goal's detail page. Read-only rendering plus, for
 * managers/founders, add/edit/delete on both levels and a quick inline control to
 * update a key result's `current_value` (the routine weekly action) without opening
 * the full edit drawer.
 */
export function GoalObjectives({ goalId, objectives, canManage, canDelete, labels }: {
  goalId: string; objectives: ObjectiveRow[]; canManage: boolean; canDelete: boolean; labels: GoalObjectivesLabels;
}) {
  return (
    <div className="card">
      <div className="flex items-center justify-between px-5 py-3">
        <span className="label">{labels.objectives}</span>
        {canManage && <Link href="?newObjective=1" scroll={false} className="btn-outline h-8 text-xs"><Plus className="h-3.5 w-3.5" />{labels.newObjective}</Link>}
      </div>

      {objectives.length === 0 ? (
        <p className="px-5 pb-4 text-sm text-ink-3">{labels.objectivesEmpty}</p>
      ) : (
        <ul className="divide-y divide-border">
          {objectives.map(o => (
            <li key={o.id} className="space-y-3 px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{o.title}</span>
                <span className={`pill ${STATUS_TONE[o.status]}`}>{labels.statusLabels[o.status]}</span>
                <span className="w-10 shrink-0 text-right text-xs tabular-nums text-ink-3">{o.progress === null ? labels.noProgress : `${o.progress}%`}</span>
                {canManage && <Link href={`?editObjective=${o.id}`} scroll={false} aria-label={labels.edit} className="btn-ghost h-7 w-7 shrink-0 px-0"><Pencil className="h-3.5 w-3.5" /></Link>}
                {canDelete && <DeleteObjectiveButton goalId={goalId} objectiveId={o.id} labels={labels} />}
              </div>
              {o.progress !== null && (
                <span className="block h-1 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full rounded-full bg-accent" style={{ width: `${o.progress}%` }} />
                </span>
              )}

              <div className="space-y-2 border-t border-border pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wide text-ink-3">{labels.keyResults}</span>
                  {canManage && <Link href={`?newKr=${o.id}`} scroll={false} className="text-xs text-ink-3 hover:text-ink">+ {labels.newKeyResult}</Link>}
                </div>
                {o.keyResults.length === 0 ? (
                  <p className="text-xs text-ink-3">{labels.keyResultsEmpty}</p>
                ) : (
                  <ul className="space-y-2">
                    {o.keyResults.map(kr => (
                      <KeyResultLine key={kr.id} goalId={goalId} kr={kr} canManage={canManage} canDelete={canDelete} labels={labels} />
                    ))}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function KeyResultLine({ goalId, kr, canManage, canDelete, labels }: {
  goalId: string; kr: KeyResultRow; canManage: boolean; canDelete: boolean; labels: GoalObjectivesLabels;
}) {
  const router = useRouter();
  const [value, setValue] = useState(String(kr.currentValue));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dirty = value !== String(kr.currentValue);

  function save() {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) { setError(labels.saveFailed); return; }
    setError(null);
    start(async () => {
      const res = await updateKeyResultValue(kr.id, goalId, parsed);
      if (!res.ok) { setError(labels.saveFailed); return; }
      router.refresh();
    });
  }

  return (
    <li className="rounded-md border border-border/60 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="min-w-0 flex-1 truncate">{kr.title}</span>
        <span className={`pill ${KR_STATUS_TONE[kr.status]}`}>{labels.statusLabels[kr.status]}</span>
        <span className="shrink-0 text-xs tabular-nums text-ink-3">{kr.currentValue} / {kr.targetValue}</span>
        {canManage && <Link href={`?editKr=${kr.id}`} scroll={false} aria-label={labels.edit} className="btn-ghost h-7 w-7 shrink-0 px-0"><Pencil className="h-3.5 w-3.5" /></Link>}
        {canDelete && <DeleteKeyResultButton goalId={goalId} krId={kr.id} labels={labels} />}
      </div>
      <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-muted">
        <span className="block h-full rounded-full bg-accent" style={{ width: `${kr.progress}%` }} />
      </span>
      {canManage && (
        <div className="mt-2 flex items-center gap-2">
          <input type="number" step="any" value={value} onChange={e => setValue(e.target.value)}
            aria-label={labels.updateProgressLabel} className="input h-8 w-28 text-xs" />
          <button type="button" onClick={save} disabled={pending || !dirty} className="btn-outline h-8 text-xs">{labels.updateProgress}</button>
          {error && <span className="text-xs text-bad">{error}</span>}
        </div>
      )}
    </li>
  );
}

function DeleteObjectiveButton({ goalId, objectiveId, labels }: { goalId: string; objectiveId: string; labels: GoalObjectivesLabels }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  function remove() {
    if (!window.confirm(labels.deleteObjectiveConfirm)) return;
    start(async () => {
      const res = await deleteObjective(objectiveId, goalId);
      if (!res.ok) { window.alert(labels.saveFailed); return; }
      router.refresh();
    });
  }
  return <button type="button" onClick={remove} disabled={pending} aria-label={labels.deleteObjective} className="btn-ghost h-7 w-7 shrink-0 px-0 text-bad"><Trash2 className="h-3.5 w-3.5" /></button>;
}

function DeleteKeyResultButton({ goalId, krId, labels }: { goalId: string; krId: string; labels: GoalObjectivesLabels }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  function remove() {
    if (!window.confirm(labels.deleteKeyResultConfirm)) return;
    start(async () => {
      const res = await deleteKeyResult(krId, goalId);
      if (!res.ok) { window.alert(labels.saveFailed); return; }
      router.refresh();
    });
  }
  return <button type="button" onClick={remove} disabled={pending} aria-label={labels.deleteKeyResult} className="btn-ghost h-7 w-7 shrink-0 px-0 text-bad"><Trash2 className="h-3.5 w-3.5" /></button>;
}
