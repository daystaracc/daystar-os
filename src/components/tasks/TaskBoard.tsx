'use client';
import Link from 'next/link';
import { useOptimistic, useRef, useState, useTransition } from 'react';
import { setTaskStatus } from '@/app/(app)/tasks/actions';
import { STATUS, type TaskStatus } from '@/lib/tasks/constants';
import { useTaskParams } from './params';
import { DueDate, PriorityTag, TaskMeta, LabelChips } from './bits';
import { EmptyState, ErrorNote } from './TaskList';
import type { TaskUiLabels } from './labels';
import type { TaskRow } from '@/lib/data/tasks';

/** Custom MIME type so the board only accepts its own cards, not arbitrary dragged text. */
const DRAG_TYPE = 'application/x-daystar-task';

/**
 * Kanban across the six task statuses. Drag-and-drop uses the native HTML5 API — no
 * library, and it degrades honestly: every card also carries a status <select>, which
 * is what keyboard users and phones (where HTML5 drag does not fire) actually use.
 */
export function TaskBoard({ tasks, labels, asOf, emptyText }: { tasks: TaskRow[]; labels: TaskUiLabels; asOf: string; emptyText: string }) {
  const { href } = useTaskParams();
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<TaskStatus | null>(null);
  // A ref, not state: `dragging` has not committed yet when the drop handler runs.
  // dataTransfer is still set for standards-correct drag behaviour and drop effects.
  const draggedId = useRef<string | null>(null);
  const [, start] = useTransition();
  const [rows, patch] = useOptimistic(tasks, (state: TaskRow[], next: { id: string; status: TaskStatus }) =>
    state.map(t => (t.id === next.id ? { ...t, status: next.status } : t)));

  function move(id: string, status: TaskStatus) {
    const task = rows.find(t => t.id === id);
    if (!task || task.status === status) return;
    if (!task.canEdit) { setError(labels.readOnly); return; }
    setError(null);
    start(async () => {
      patch({ id, status });
      const res = await setTaskStatus(id, status);
      if (!res.ok) setError(res.error === 'forbidden' ? labels.readOnly : labels.saveFailed);
    });
  }

  if (!rows.length) return <EmptyState text={emptyText} />;

  return (
    <div className="space-y-2">
      {error && <ErrorNote text={error} />}
      {/* horizontal scroll keeps all six columns reachable on a phone */}
      <div className="-mx-6 overflow-x-auto px-6 pb-2 lg:-mx-10 lg:px-10">
        <div className="flex min-w-max gap-3">
          {STATUS.map(status => {
            const column = rows.filter(t => t.status === status);
            return (
              <section
                key={status}
                onDragOver={e => { if (draggedId.current || e.dataTransfer.types.includes(DRAG_TYPE)) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOver(status); } }}
                onDragLeave={() => setOver(o => (o === status ? null : o))}
                onDrop={e => {
                  e.preventDefault();
                  setOver(null);
                  setDragging(null);
                  const id = e.dataTransfer.getData(DRAG_TYPE) || draggedId.current;
                  draggedId.current = null;
                  if (id) move(id, status);
                }}
                aria-label={labels.status[status]}
                className={`flex w-[17rem] shrink-0 flex-col rounded-lg border p-2 transition-colors duration-fast
                  ${over === status ? 'border-accent bg-accent-soft' : 'border-transparent bg-muted/50'}`}>
                <header className="flex items-center justify-between px-1.5 pb-2">
                  <h3 className="label">{labels.status[status]}</h3>
                  <span className="text-[11px] tabular-nums text-ink-3">{column.length}</span>
                </header>
                <ul className="flex flex-col gap-2">
                  {column.map(t => (
                    <li key={t.id}
                      draggable={t.canEdit}
                      onDragStart={e => { draggedId.current = t.id; setDragging(t.id); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData(DRAG_TYPE, t.id); } catch { /* scripted drags cannot write dataTransfer */ } }}
                      onDragEnd={() => { draggedId.current = null; setDragging(null); setOver(null); }}
                      className={`card space-y-2 p-3 ${t.canEdit ? 'cursor-grab active:cursor-grabbing' : ''} ${dragging === t.id ? 'opacity-40' : ''}`}>
                      <Link href={href({ task: t.id })} scroll={false} className="block text-sm leading-snug hover:underline">
                        <span className={t.status === 'done' ? 'line-through opacity-70' : ''}>{t.title}</span>
                      </Link>
                      {t.labels.length > 0 && <div className="flex flex-wrap gap-1"><LabelChips labels={t.labels} /></div>}
                      <div className="flex flex-wrap items-center gap-2">
                        <PriorityTag priority={t.priority} label={labels.priority[t.priority]} />
                        <DueDate task={t} locale={labels.locale} asOf={asOf} noDate={labels.noDueDate} />
                        <TaskMeta task={t} labels={{ checklist: labels.checklist }} />
                      </div>
                      <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
                        <span className="truncate text-xs text-ink-3">{t.assignee?.name ?? labels.unassigned}</span>
                        <select
                          value={t.status}
                          onChange={e => move(t.id, e.target.value as TaskStatus)}
                          disabled={!t.canEdit}
                          aria-label={`${labels.moveTo}: ${t.title}`}
                          title={t.canEdit ? labels.moveTo : labels.readOnly}
                          className="h-7 rounded-md border border-border bg-surface px-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50">
                          {STATUS.map(s => <option key={s} value={s}>{labels.status[s]}</option>)}
                        </select>
                      </div>
                    </li>
                  ))}
                  {!column.length && (
                    <li className="grid h-16 place-items-center rounded-md border border-dashed border-border text-xs text-ink-3">
                      {over === status ? labels.moveTo : '—'}
                    </li>
                  )}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
