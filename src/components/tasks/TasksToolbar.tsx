'use client';
import Link from 'next/link';
import { useState } from 'react';
import { LayoutList, KanbanSquare, CalendarDays, SlidersHorizontal, Plus, X } from 'lucide-react';
import { useTaskParams, FILTER_KEYS, type FilterKey } from './params';
import type { TaskUiLabels } from './labels';
import type { TaskOptions, TaskView, TaskLayout } from '@/lib/data/tasks';
import { STATUS, PRIORITY } from '@/lib/tasks/constants';

const VIEWS: TaskView[] = ['my', 'today', 'week', 'all', 'overdue'];
const LAYOUT_ICON = { list: LayoutList, kanban: KanbanSquare, calendar: CalendarDays } as const;

export function TasksToolbar({ view, layout, options, counts, labels }: {
  view: TaskView; layout: TaskLayout; options: TaskOptions;
  counts: Record<'my' | 'today' | 'week' | 'overdue', number>;
  labels: TaskUiLabels;
}) {
  const { params, href, set } = useTaskParams();
  const [open, setOpen] = useState(false);

  const active = FILTER_KEYS.map(k => [k, params.get(k)] as const).filter((e): e is [FilterKey, string] => !!e[1]);
  const nameFor = (k: FilterKey, v: string): string => {
    if (k === 'assignee') return v === 'none' ? labels.unassigned : options.people.find(p => p.id === v)?.name ?? v;
    if (k === 'project') return v === 'none' ? labels.noProject : options.projects.find(p => p.id === v)?.name ?? v;
    if (k === 'status') return labels.status[v as keyof typeof labels.status] ?? v;
    if (k === 'priority') return labels.priority[v as keyof typeof labels.priority] ?? v;
    return v;
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* view tabs */}
        <div role="tablist" aria-label={labels.view.all} className="flex flex-wrap items-center gap-0.5 rounded-md bg-muted p-0.5">
          {VIEWS.map(v => {
            const n = v === 'all' ? null : counts[v];
            return (
              <Link key={v} href={href({ view: v === 'my' ? null : v })} role="tab" aria-selected={view === v} scroll={false}
                className={`inline-flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-sm transition-colors duration-fast ${view === v ? 'bg-surface font-medium text-ink shadow-card' : 'text-ink-2 hover:text-ink'}`}>
                {labels.view[v]}
                {n != null && n > 0 && <span className="text-[11px] tabular-nums text-ink-3">{n}</span>}
              </Link>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* layout switcher */}
          <div className="flex items-center gap-0.5 rounded-md bg-muted p-0.5">
            {(Object.keys(LAYOUT_ICON) as TaskLayout[]).map(l => {
              const Icon = LAYOUT_ICON[l];
              return (
                <Link key={l} href={href({ layout: l === 'list' ? null : l })} title={labels.layout[l]} aria-label={labels.layout[l]} aria-current={layout === l ? 'page' : undefined} scroll={false}
                  className={`grid h-7 w-7 place-items-center rounded-sm transition-colors duration-fast ${layout === l ? 'bg-surface text-ink shadow-card' : 'text-ink-3 hover:text-ink'}`}>
                  <Icon className="h-4 w-4" />
                </Link>
              );
            })}
          </div>

          <button onClick={() => setOpen(o => !o)} aria-expanded={open} className={`btn-outline h-8 px-3 text-sm ${active.length ? 'border-border-strong' : ''}`}>
            <SlidersHorizontal className="h-4 w-4" />{labels.filters}
            {active.length > 0 && <span className="ml-0.5 rounded-sm bg-accent px-1.5 text-[11px] tabular-nums text-white">{active.length}</span>}
          </button>

          <Link href={href({ new: '1' })} scroll={false} className="btn-primary h-8 px-3 text-sm"><Plus className="h-4 w-4" />{labels.newTask}</Link>
        </div>
      </div>

      {open && (
        <div className="card card-pad grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Select label={labels.field.assignee} value={params.get('assignee') ?? ''} onChange={v => set({ assignee: v })}
            options={[{ value: 'none', label: labels.unassigned }, ...options.people.map(p => ({ value: p.id, label: p.name }))]} />
          <Select label={labels.field.project} value={params.get('project') ?? ''} onChange={v => set({ project: v })}
            options={[{ value: 'none', label: labels.noProject }, ...options.projects.map(p => ({ value: p.id, label: p.name }))]} />
          <Select label={labels.field.status} value={params.get('status') ?? ''} onChange={v => set({ status: v })}
            options={STATUS.map(s => ({ value: s, label: labels.status[s] }))} />
          <Select label={labels.field.priority} value={params.get('priority') ?? ''} onChange={v => set({ priority: v })}
            options={PRIORITY.map(p => ({ value: p, label: labels.priority[p] }))} />
          <Select label={labels.field.labels} value={params.get('label') ?? ''} onChange={v => set({ label: v })}
            options={options.labels.map(l => ({ value: l, label: l }))} />
        </div>
      )}

      {active.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {active.map(([k, v]) => (
            <Link key={k} href={href({ [k]: null })} scroll={false}
              className="pill pill-neutral gap-1 pr-1 hover:bg-border" title={`${labels.clearAll}: ${nameFor(k, v)}`}>
              {nameFor(k, v)}<X className="h-3 w-3" />
            </Link>
          ))}
          <Link href={href(Object.fromEntries(FILTER_KEYS.map(k => [k, null])))} scroll={false} className="text-xs text-ink-3 underline-offset-2 hover:text-ink hover:underline">
            {labels.clearAll}
          </Link>
        </div>
      )}
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="block space-y-1">
      <span className="label">{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} className="input">
        <option value="">—</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
