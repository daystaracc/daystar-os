'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X, ChevronDown, Plus, Trash2 } from 'lucide-react';
import { createTask, updateTask } from '@/app/(app)/tasks/actions';
import { PRIORITY, type TaskPriority } from '@/lib/tasks/constants';
import { useTaskParams } from './params';
import { ErrorNote } from './TaskList';
import type { TaskUiLabels } from './labels';
import type { TaskOptions, TaskDetail } from '@/lib/data/tasks';

const REPEAT_VALUES = ['', 'daily', 'weekdays', 'weekly:MON', 'monthly:1', 'monthly:last'] as const;

/**
 * Right-side drawer for creating and editing. Five fields are visible; description,
 * labels, checklist, dependencies and the recurrence rule live behind Advanced options,
 * per the interface rules (≤ 5 fields before disclosure).
 */
export function TaskDrawer({ options, labels, task }: { options: TaskOptions; labels: TaskUiLabels; task?: TaskDetail }) {
  const router = useRouter();
  const { href } = useTaskParams();
  const editing = !!task;
  const panelRef = useRef<HTMLDivElement>(null);
  const [advanced, setAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const [title, setTitle] = useState(task?.title ?? '');
  const [assignee, setAssignee] = useState(task?.assignee?.id ?? '');
  const [dueDate, setDueDate] = useState(task?.due_date ?? '');
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'medium');
  const [project, setProject] = useState(task?.project?.id ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [labelText, setLabelText] = useState((task?.labels ?? []).join(', '));
  const [recurring, setRecurring] = useState(task?.recurring_rule ?? '');
  const [checklist, setChecklist] = useState<string[]>([]);
  const [checklistDraft, setChecklistDraft] = useState('');
  const [dependsOn, setDependsOn] = useState<string[]>([]);

  const close = () => router.push(href({ new: null, task: task ? task.id : null }), { scroll: false });

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
    const labelList = labelText.split(',').map(s => s.trim()).filter(Boolean);
    start(async () => {
      const base = {
        title, assignee_id: assignee, due_date: dueDate, priority, project_id: project,
        description, recurring_rule: recurring, labels: labelList,
      };
      const res = editing
        ? await updateTask(task.id, base)
        : await createTask({ ...base, checklist, dependsOn });
      if (!res.ok) {
        setError(res.error === 'forbidden' ? labels.readOnly : res.error === 'invalid' ? labels.saveFailed : labels.saveFailed);
        return;
      }
      close();
    });
  }

  const dependencyOptions = task?.linkable ?? [];

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button aria-label={labels.close} onClick={close} className="absolute inset-0 bg-ink/20" />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={editing ? title : labels.newTask}
        className="relative flex h-full w-full max-w-[30rem] animate-fade-up flex-col bg-surface shadow-drawer">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide">{editing ? labels.save : labels.newTask}</h2>
          <button onClick={close} aria-label={labels.close} className="btn-ghost h-8 w-8 px-0"><X className="h-4 w-4" /></button>
        </header>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {error && <ErrorNote text={error} />}

            <Field label={labels.field.title}>
              <input name="title" required maxLength={200} value={title} onChange={e => setTitle(e.target.value)} className="input" />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label={labels.field.assignee}>
                <select value={assignee} onChange={e => setAssignee(e.target.value)} className="input">
                  <option value="">{labels.unassigned}</option>
                  {options.people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
              <Field label={labels.field.dueDate}>
                <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="input" />
              </Field>
              <Field label={labels.field.priority}>
                <select value={priority} onChange={e => setPriority(e.target.value as TaskPriority)} className="input">
                  {PRIORITY.map(p => <option key={p} value={p}>{labels.priority[p]}</option>)}
                </select>
              </Field>
              <Field label={labels.field.project}>
                <select value={project} onChange={e => setProject(e.target.value)} className="input">
                  <option value="">{labels.noProject}</option>
                  {options.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
            </div>

            <button type="button" onClick={() => setAdvanced(a => !a)} aria-expanded={advanced}
              className="flex w-full items-center gap-1 border-t border-border pt-4 text-sm text-ink-2 hover:text-ink">
              <ChevronDown className={`h-4 w-4 transition-transform duration-fast ${advanced ? 'rotate-180' : ''}`} />{labels.advanced}
            </button>

            {advanced && (
              <div className="space-y-4">
                <Field label={labels.field.description}>
                  <textarea rows={4} maxLength={5000} value={description} onChange={e => setDescription(e.target.value)}
                    className="input h-auto py-2 leading-relaxed" />
                </Field>

                <Field label={labels.field.labels} hint={labels.field.labelsHint}>
                  <input list="task-label-options" maxLength={1000} value={labelText} onChange={e => setLabelText(e.target.value)} className="input" />
                  <datalist id="task-label-options">{options.labels.map(l => <option key={l} value={l} />)}</datalist>
                </Field>

                <Field label={labels.field.recurring}>
                  <select value={recurring} onChange={e => setRecurring(e.target.value)} className="input">
                    {REPEAT_VALUES.map(v => (
                      <option key={v} value={v}>
                        {v === '' ? labels.repeat.none : v === 'daily' ? labels.repeat.daily : v === 'weekdays' ? labels.repeat.weekdays
                          : v === 'weekly:MON' ? labels.repeat.weekly : v === 'monthly:last' ? labels.repeat.monthlyLast : labels.repeat.monthly}
                      </option>
                    ))}
                  </select>
                  {recurring && <p className="mt-1 text-xs text-ink-3">{labels.recurringHint}</p>}
                </Field>

                {/* Checklist and dependencies are set at creation; on an existing task they are
                    edited live in the detail panel, so they are not duplicated here. */}
                {!editing && (
                  <>
                    <Field label={labels.checklist}>
                      <div className="space-y-1.5">
                        {checklist.map((item, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm">
                            <span className="flex-1 truncate rounded-md bg-muted px-2 py-1">{item}</span>
                            <button type="button" onClick={() => setChecklist(c => c.filter((_, j) => j !== i))}
                              aria-label={`${labels.close}: ${item}`} className="btn-ghost h-7 w-7 px-0"><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                        ))}
                        <div className="flex gap-2">
                          <input maxLength={200} value={checklistDraft} onChange={e => setChecklistDraft(e.target.value)} placeholder={labels.checklistAdd}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (checklistDraft.trim()) { setChecklist(c => [...c, checklistDraft.trim()]); setChecklistDraft(''); } } }}
                            className="input" />
                          <button type="button" aria-label={labels.checklistAdd}
                            onClick={() => { if (checklistDraft.trim()) { setChecklist(c => [...c, checklistDraft.trim()]); setChecklistDraft(''); } }}
                            className="btn-outline h-9 w-9 shrink-0 px-0"><Plus className="h-4 w-4" /></button>
                        </div>
                      </div>
                    </Field>

                    {dependencyOptions.length > 0 && (
                      <Field label={labels.dependencies}>
                        <select multiple size={4} value={dependsOn}
                          onChange={e => setDependsOn(Array.from(e.target.selectedOptions, o => o.value))}
                          className="input h-auto py-1">
                          {dependencyOptions.map(o => <option key={o.id} value={o.id}>{o.title}</option>)}
                        </select>
                      </Field>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-4">
            <button type="button" onClick={close} className="btn-outline">{labels.cancel}</button>
            <button type="submit" disabled={pending || !title.trim()} className="btn-primary">
              {editing ? labels.save : labels.create}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-ink-3">{hint}</span>}
    </label>
  );
}
