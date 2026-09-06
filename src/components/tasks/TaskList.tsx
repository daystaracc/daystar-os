'use client';
import Link from 'next/link';
import { useOptimistic, useState, useTransition } from 'react';
import { Check } from 'lucide-react';
import { setTaskStatus } from '@/app/(app)/tasks/actions';
import { STATUS, type TaskStatus } from '@/lib/tasks/constants';
import { useTaskParams } from './params';
import { DueDate, PriorityTag, TaskMeta, LabelChips } from './bits';
import type { TaskUiLabels } from './labels';
import type { TaskRow } from '@/lib/data/tasks';

/**
 * List view. The status <select> is the accessible, touch-friendly counterpart of the
 * Kanban drag: same server action, works with a keyboard and on a phone.
 */
export function TaskList({ tasks, labels, asOf, emptyText }: { tasks: TaskRow[]; labels: TaskUiLabels; asOf: string; emptyText: string }) {
  const { href } = useTaskParams();
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const [rows, patch] = useOptimistic(tasks, (state: TaskRow[], next: { id: string; status: TaskStatus }) =>
    state.map(t => (t.id === next.id ? { ...t, status: next.status } : t)));

  function change(id: string, status: TaskStatus) {
    setError(null);
    start(async () => {
      patch({ id, status });
      const res = await setTaskStatus(id, status);
      if (!res.ok) setError(labels.saveFailed);
    });
  }

  if (!rows.length) return <EmptyState text={emptyText} />;

  return (
    <div className="space-y-2">
      {error && <ErrorNote text={error} />}
      <ul className="card divide-y divide-border">
        {rows.map(t => (
          <li key={t.id} className={`row-hover flex items-start gap-3 px-3 py-2.5 ${t.status === 'done' ? 'opacity-60' : ''}`}>
            <button
              onClick={() => change(t.id, t.status === 'done' ? 'todo' : 'done')}
              disabled={!t.canEdit}
              aria-label={`${labels.status.done}: ${t.title}`}
              aria-pressed={t.status === 'done'}
              title={t.canEdit ? undefined : labels.readOnly}
              className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-[5px] border transition-colors duration-fast disabled:cursor-not-allowed disabled:opacity-40
                ${t.status === 'done' ? 'border-ok bg-ok text-white' : 'border-border-strong text-transparent hover:border-ok hover:bg-ok-soft hover:text-ok'}`}>
              <Check className="h-3.5 w-3.5" strokeWidth={3} />
            </button>

            {/* One line on a desktop row; title above its metadata on a phone, so the
                title keeps its width instead of collapsing to an ellipsis. */}
            <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
            <Link href={href({ task: t.id })} scroll={false} className="min-w-0 flex-1 truncate text-sm hover:underline" title={labels.openTask}>
              <span className={t.status === 'done' ? 'line-through' : ''}>{t.title}</span>
            </Link>

            <div className="flex min-w-0 flex-wrap items-center gap-2 sm:shrink-0 sm:flex-nowrap">
              <TaskMeta task={t} labels={{ checklist: labels.checklist }} />
              <LabelChips labels={t.labels} />
              {t.project && <span className="hidden max-w-[10rem] truncate text-xs text-ink-3 md:inline">{t.project.name}</span>}
              <span className="hidden w-20 truncate text-xs text-ink-3 sm:inline">{t.assignee?.name ?? labels.unassigned}</span>
              <DueDate task={t} locale={labels.locale} asOf={asOf} noDate={labels.noDueDate} />
              <PriorityTag priority={t.priority} label={labels.priority[t.priority]} />
              <select
                value={t.status}
                onChange={e => change(t.id, e.target.value as TaskStatus)}
                disabled={!t.canEdit}
                aria-label={`${labels.field.status}: ${t.title}`}
                title={t.canEdit ? undefined : labels.readOnly}
                className="h-7 rounded-md border border-border bg-surface px-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50">
                {STATUS.map(s => <option key={s} value={s}>{labels.status[s]}</option>)}
              </select>
            </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function EmptyState({ text, action }: { text: string; action?: React.ReactNode }) {
  return (
    <div className="card grid place-items-center gap-3 px-6 py-14 text-center">
      <p className="max-w-sm text-sm text-ink-3">{text}</p>
      {action}
    </div>
  );
}

export function ErrorNote({ text }: { text: string }) {
  return <p role="alert" className="rounded-md bg-bad-soft px-3 py-2 text-sm text-bad">{text}</p>;
}
