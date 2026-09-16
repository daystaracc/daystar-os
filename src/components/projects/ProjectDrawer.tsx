'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X, ChevronDown } from 'lucide-react';
import { createProject, updateProject } from '@/app/(app)/projects/actions';
import { PROJECT_STATUS, type ProjectStatus } from '@/lib/projects/constants';

export interface ProjectDrawerOptions {
  people: { id: string; name: string }[];
  departments: { id: string; name: string }[];
}

export interface ProjectDrawerLabels {
  newProject: string; editProject: string; name: string; owner: string; department: string; status: string;
  startDate: string; deadline: string; budget: string; description: string; notes: string;
  noOwner: string; noDepartment: string;
  save: string; saving: string; cancel: string; create: string; close: string; saveFailed: string;
  statusLabels: Record<ProjectStatus, string>;
  advanced: string;
}

export interface ProjectDraft {
  id: string; name: string; ownerId: string; departmentId: string; status: ProjectStatus;
  startDate: string; deadline: string; budget: string; description: string; notes: string;
}

/**
 * Create/edit drawer for a project. Five fields visible (name, owner, department,
 * status, deadline); start date, budget, description and notes live behind Advanced
 * options — same disclosure rule as `components/tasks/TaskDrawer.tsx`.
 *
 * `onCloseHref` lets the caller decide where closing goes: the list page removes
 * `?new=1`, the detail page removes `?edit=1` — both via `router.push(..., {scroll:false})`.
 */
export function ProjectDrawer({ options, labels, project, onCloseHref }: {
  options: ProjectDrawerOptions; labels: ProjectDrawerLabels; project?: ProjectDraft; onCloseHref: string;
}) {
  const router = useRouter();
  const editing = !!project;
  const panelRef = useRef<HTMLDivElement>(null);
  const [advanced, setAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const [name, setName] = useState(project?.name ?? '');
  const [ownerId, setOwnerId] = useState(project?.ownerId ?? '');
  const [departmentId, setDepartmentId] = useState(project?.departmentId ?? '');
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? 'planning');
  const [deadline, setDeadline] = useState(project?.deadline ?? '');
  const [startDate, setStartDate] = useState(project?.startDate ?? '');
  const [budget, setBudget] = useState(project?.budget ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [notes, setNotes] = useState(project?.notes ?? '');

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
      const base = {
        name, owner_id: ownerId, department_id: departmentId, status,
        start_date: startDate, deadline, budget, description, notes,
      };
      const res = editing ? await updateProject(project.id, base) : await createProject(base);
      if (!res.ok) { setError(labels.saveFailed); return; }
      close();
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button aria-label={labels.close} onClick={close} className="absolute inset-0 bg-ink/20" />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={editing ? labels.editProject : labels.newProject}
        className="relative flex h-full w-full max-w-[30rem] animate-fade-up flex-col bg-surface shadow-drawer">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide">{editing ? labels.editProject : labels.newProject}</h2>
          <button onClick={close} aria-label={labels.close} className="btn-ghost h-8 w-8 px-0"><X className="h-4 w-4" /></button>
        </header>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {error && <p className="rounded-md bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}

            <Field label={labels.name}>
              <input name="name" required maxLength={200} value={name} onChange={e => setName(e.target.value)} className="input" />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label={labels.owner}>
                <select value={ownerId} onChange={e => setOwnerId(e.target.value)} className="input">
                  <option value="">{labels.noOwner}</option>
                  {options.people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
              <Field label={labels.department}>
                <select value={departmentId} onChange={e => setDepartmentId(e.target.value)} className="input">
                  <option value="">{labels.noDepartment}</option>
                  {options.departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </Field>
              <Field label={labels.status}>
                <select value={status} onChange={e => setStatus(e.target.value as ProjectStatus)} className="input">
                  {PROJECT_STATUS.map(s => <option key={s} value={s}>{labels.statusLabels[s]}</option>)}
                </select>
              </Field>
              <Field label={labels.deadline}>
                <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className="input" />
              </Field>
            </div>

            <button type="button" onClick={() => setAdvanced(a => !a)} aria-expanded={advanced}
              className="flex w-full items-center gap-1 border-t border-border pt-4 text-sm text-ink-2 hover:text-ink">
              <ChevronDown className={`h-4 w-4 transition-transform duration-fast ${advanced ? 'rotate-180' : ''}`} />{labels.advanced}
            </button>

            {advanced && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Field label={labels.startDate}>
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="input" />
                  </Field>
                  <Field label={labels.budget}>
                    <input type="number" min={0} step="1" value={budget} onChange={e => setBudget(e.target.value)} className="input" />
                  </Field>
                </div>
                <Field label={labels.description}>
                  <textarea rows={4} maxLength={5000} value={description} onChange={e => setDescription(e.target.value)} className="input h-auto py-2 leading-relaxed" />
                </Field>
                <Field label={labels.notes}>
                  <textarea rows={3} maxLength={5000} value={notes} onChange={e => setNotes(e.target.value)} className="input h-auto py-2 leading-relaxed" />
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
