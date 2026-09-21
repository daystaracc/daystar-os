'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useOptimistic, useState, useTransition } from 'react';
import { X, Plus, Trash2, Check, Pencil } from 'lucide-react';
import {
  addChecklistItem, setChecklistItemDone, deleteChecklistItem,
  addComment, addDependency, removeDependency, deleteTask, setTaskStatus,
} from '@/app/(app)/tasks/actions';
import { STATUS, type TaskStatus } from '@/lib/tasks/constants';
import { useTaskParams } from './params';
import { ErrorNote } from './TaskList';
import { StatusPill, PriorityTag } from './bits';
import { repeatLabel, type TaskUiLabels } from './labels';
import type { TaskDetail } from '@/lib/data/tasks';

/** Right-hand detail panel: the task, its checklist, dependencies, comments and audit trail. */
export function TaskPanel({ task, labels }: { task: TaskDetail; labels: TaskUiLabels }) {
  const router = useRouter();
  const { href } = useTaskParams();
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const close = () => router.push(href({ task: null }), { scroll: false });
  const loc = labels.locale === 'en' ? 'en-US' : 'zh-TW';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id]);

  const [items, patchItem] = useOptimistic(task.checklistItems,
    (state, next: { id: string; is_done: boolean }) => state.map(i => (i.id === next.id ? { ...i, is_done: next.is_done } : i)));

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, optimistic?: () => void) => {
    setError(null);
    start(async () => {
      optimistic?.();
      const res = await fn();
      if (!res.ok) setError(res.error === 'forbidden' ? labels.readOnly : labels.saveFailed);
    });
  };

  const doneCount = items.filter(i => i.is_done).length;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button aria-label={labels.close} onClick={close} className="absolute inset-0 bg-ink/20" />
      <aside role="dialog" aria-modal="true" aria-label={task.title}
        className="relative flex h-full w-full max-w-[34rem] animate-fade-up flex-col bg-surface shadow-drawer">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-5">
          <StatusPill status={task.status} label={labels.status[task.status]} />
          <PriorityTag priority={task.priority} label={labels.priority[task.priority]} />
          <div className="ml-auto flex items-center gap-1">
            {task.canEdit && (
              <Link href={href({ new: '1' })} scroll={false} aria-label={labels.save} title={labels.save} className="btn-ghost h-8 w-8 px-0"><Pencil className="h-4 w-4" /></Link>
            )}
            <button onClick={close} aria-label={labels.close} className="btn-ghost h-8 w-8 px-0"><X className="h-4 w-4" /></button>
          </div>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          {error && <ErrorNote text={error} />}
          {!task.canEdit && <p className="rounded-md bg-muted px-3 py-2 text-xs text-ink-2">{labels.readOnly}</p>}

          <div>
            <h2 className="text-lg font-semibold leading-snug">{task.title}</h2>
            {task.description && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-2">{task.description}</p>}
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Row label={labels.field.status}>
              <select value={task.status} disabled={!task.canEdit}
                onChange={e => run(() => setTaskStatus(task.id, e.target.value as TaskStatus))}
                className="h-8 w-full rounded-md border border-border bg-surface px-2 text-sm disabled:opacity-50">
                {STATUS.map(s => <option key={s} value={s}>{labels.status[s]}</option>)}
              </select>
            </Row>
            <Row label={labels.field.assignee}>{task.assignee?.name ?? labels.unassigned}</Row>
            <Row label={labels.field.dueDate}>
              {task.due_date ? new Date(`${task.due_date}T00:00:00Z`).toLocaleDateString(loc, { dateStyle: 'medium', timeZone: 'UTC' }) : labels.noDueDate}
            </Row>
            <Row label={labels.field.project}>{task.project?.name ?? labels.noProject}</Row>
            <Row label={labels.field.owner}>{task.owner?.name ?? '—'}</Row>
            <Row label={labels.field.recurring}>{repeatLabel(task.recurring_rule, labels.repeat)}</Row>
            {task.labels.length > 0 && (
              <div className="col-span-2">
                <dt className="label">{labels.field.labels}</dt>
                <dd className="mt-1 flex flex-wrap gap-1">{task.labels.map(l => <span key={l} className="pill pill-neutral">{l}</span>)}</dd>
              </div>
            )}
          </dl>

          {/* checklist */}
          <Section title={`${labels.checklist}${items.length ? ` · ${doneCount}/${items.length}` : ''}`}>
            <ul className="space-y-1.5">
              {items.map(i => (
                <li key={i.id} className="group flex items-center gap-2">
                  <button
                    disabled={!task.canEdit}
                    aria-label={i.title}
                    aria-pressed={i.is_done}
                    onClick={() => run(() => setChecklistItemDone(i.id, !i.is_done), () => patchItem({ id: i.id, is_done: !i.is_done }))}
                    className={`grid h-4 w-4 shrink-0 place-items-center rounded-[4px] border transition-colors duration-fast disabled:opacity-40
                      ${i.is_done ? 'border-ok bg-ok text-white' : 'border-border-strong text-transparent hover:border-ok'}`}>
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </button>
                  <span className={`flex-1 text-sm ${i.is_done ? 'text-ink-3 line-through' : ''}`}>{i.title}</span>
                  {task.canEdit && (
                    <button onClick={() => run(() => deleteChecklistItem(i.id))} aria-label={`${labels.close}: ${i.title}`}
                      className="btn-ghost h-6 w-6 px-0 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {task.canEdit && <AddLine placeholder={labels.checklistAdd} maxLength={200} onAdd={v => run(() => addChecklistItem(task.id, v))} />}
          </Section>

          {/* dependencies */}
          <Section title={labels.dependencies}>
            {task.dependencies.length ? (
              <ul className="space-y-1.5">
                {task.dependencies.map(d => (
                  <li key={d.id} className="flex items-center gap-2 text-sm">
                    <StatusPill status={d.status} label={labels.status[d.status]} />
                    <Link href={href({ task: d.id })} scroll={false} className="min-w-0 flex-1 truncate hover:underline">{d.title}</Link>
                    {task.canEdit && (
                      <button onClick={() => run(() => removeDependency(task.id, d.id))} aria-label={`${labels.close}: ${d.title}`} className="btn-ghost h-6 w-6 px-0">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-ink-3">{labels.dependencyNone}</p>}
            {task.canEdit && task.linkable.length > 0 && (
              <select defaultValue="" onChange={e => { if (e.target.value) { run(() => addDependency(task.id, e.target.value)); e.target.value = ''; } }}
                aria-label={labels.dependenciesAdd} className="input mt-2">
                <option value="">{labels.dependenciesAdd}</option>
                {task.linkable.map(o => <option key={o.id} value={o.id}>{o.title}</option>)}
              </select>
            )}
          </Section>

          {/* comments */}
          <Section title={labels.comments}>
            {task.comments.length ? (
              <ul className="space-y-3">
                {task.comments.map(c => (
                  <li key={c.id} className="text-sm">
                    <div className="flex items-baseline gap-2">
                      <span className="font-medium">{c.author ?? '—'}</span>
                      <time dateTime={c.at} className="text-xs text-ink-3">{new Date(c.at).toLocaleString(loc, { dateStyle: 'short', timeStyle: 'short' })}</time>
                    </div>
                    <p className="mt-0.5 whitespace-pre-wrap text-ink-2">{c.body}</p>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-ink-3">{labels.commentsEmpty}</p>}
            <AddLine placeholder={labels.commentAdd} submitLabel={labels.commentSend} maxLength={4000} onAdd={v => run(() => addComment(task.id, v))} />
          </Section>

          {/* activity */}
          <Section title={labels.activity}>
            {task.activity.length ? (
              <ul className="space-y-1.5 text-sm">
                {task.activity.map(a => (
                  <li key={a.id} className="flex items-baseline gap-2">
                    <time dateTime={a.at} className="shrink-0 text-xs tabular-nums text-ink-3">{new Date(a.at).toLocaleString(loc, { dateStyle: 'short', timeStyle: 'short' })}</time>
                    <span className="text-ink-2">{a.actor && <b className="font-medium text-ink">{a.actor} </b>}{a.summary}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-ink-3">{labels.activityEmpty}</p>}
          </Section>

          <p className="border-t border-border pt-4 text-xs text-ink-3">
            {labels.field.createdBy}: {task.createdBy ?? '—'} · {new Date(task.createdAt).toLocaleDateString(loc, { dateStyle: 'medium' })}
          </p>
        </div>

        {task.canDelete && (
          <footer className="shrink-0 border-t border-border px-5 py-3">
            <button
              onClick={() => { if (confirm(labels.deleteConfirm)) run(async () => { const r = await deleteTask(task.id); if (r.ok) close(); return r; }); }}
              className="btn-ghost h-8 px-2 text-sm text-bad hover:bg-bad-soft">
              <Trash2 className="h-4 w-4" />{labels.deleteTask}
            </button>
          </footer>
        )}
      </aside>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><dt className="label">{label}</dt><dd className="mt-0.5">{children}</dd></div>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border pt-4">
      <h3 className="label mb-2">{title}</h3>
      {children}
    </section>
  );
}

function AddLine({ placeholder, submitLabel, maxLength, onAdd }: { placeholder: string; submitLabel?: string; maxLength?: number; onAdd: (value: string) => void }) {
  const [value, setValue] = useState('');
  const send = () => { const v = value.trim(); if (v) { onAdd(v); setValue(''); } };
  return (
    <div className="mt-2 flex gap-2">
      <input value={value} onChange={e => setValue(e.target.value)} placeholder={placeholder} aria-label={placeholder} maxLength={maxLength}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); send(); } }} className="input" />
      <button type="button" onClick={send} disabled={!value.trim()} aria-label={submitLabel ?? placeholder}
        className="btn-outline h-9 shrink-0 px-2.5 disabled:opacity-40">
        {submitLabel ?? <Plus className="h-4 w-4" />}
      </button>
    </div>
  );
}
