'use client';
import { useOptimistic, useState, useTransition } from 'react';
import { Check } from 'lucide-react';
import { completeTask } from '@/app/(app)/tasks/actions';

type Task = { id: string; title: string; status: string; priority: string; due_date: string | null; assignee: string | null };
const prio = { urgent: 'text-bad', high: 'text-warn', medium: 'text-ink-3', low: 'text-ink-3' } as const;

/**
 * Today's tasks with a satisfying, professional completion: optimistic check, then the
 * server action persists (and spawns the next recurrence).
 *
 * `completeLabel` is the raw "Complete: {title}" template, not a formatter function:
 * a Server Component cannot pass a function across the boundary to a Client Component.
 */
export function TodayTasks({ tasks, priorityLabels, empty, failed, completeLabel }: { tasks: Task[]; priorityLabels: Record<string, string>; empty: string; failed: string; completeLabel: string }) {
  const [list, markDone] = useOptimistic(tasks, (s, id: string) => s.filter(t => t.id !== id));
  const [, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (!list.length) return <div className="card px-5 py-8 text-sm text-ink-3">{empty}</div>;
  return (
    <ul className="card divide-y divide-border">
      {error && <li role="alert" className="bg-bad-soft px-4 py-2 text-sm text-bad">{error}</li>}
      {list.map(t => (
        <li key={t.id} className="row-hover flex items-center gap-3 px-4 py-2.5">
          <button aria-label={completeLabel.replace('{title}', t.title)} onClick={() => start(async () => { setError(null); markDone(t.id); const r = await completeTask(t.id); if (!r.ok) setError(failed); })}
            className="grid h-5 w-5 shrink-0 place-items-center rounded-[5px] border border-border-strong text-transparent transition-colors duration-fast hover:border-ok hover:bg-ok-soft hover:text-ok">
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          </button>
          <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
          {t.assignee && <span className="hidden text-xs text-ink-3 sm:inline">{t.assignee}</span>}
          <span className={`text-[11px] font-medium uppercase tracking-wide ${prio[t.priority as keyof typeof prio] ?? 'text-ink-3'}`}>{priorityLabels[t.priority]}</span>
        </li>
      ))}
    </ul>
  );
}
