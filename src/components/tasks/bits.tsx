'use client';
import { Repeat, Ban, ListChecks } from 'lucide-react';
import type { TaskRow } from '@/lib/data/tasks';
import type { TaskPriority, TaskStatus } from '@/lib/tasks/constants';

export const PRIORITY_TONE: Record<TaskPriority, string> = {
  urgent: 'text-bad', high: 'text-warn', medium: 'text-ink-3', low: 'text-ink-3',
};
export const STATUS_TONE: Record<TaskStatus, string> = {
  backlog: 'pill-neutral', todo: 'pill-neutral', in_progress: 'pill-warn',
  blocked: 'pill-bad', review: 'pill-warn', done: 'pill-ok',
};

export function PriorityTag({ priority, label }: { priority: TaskPriority; label: string }) {
  return <span className={`text-[11px] font-medium uppercase tracking-wide ${PRIORITY_TONE[priority]}`}>{label}</span>;
}

export function StatusPill({ status, label }: { status: TaskStatus; label: string }) {
  return <span className={`pill ${STATUS_TONE[status]} justify-center whitespace-nowrap`}>{label}</span>;
}

/** Due date, red once it is in the past and the task is not finished. */
export function DueDate({ task, locale, asOf, noDate }: { task: Pick<TaskRow, 'due_date' | 'status'>; locale: string; asOf: string; noDate: string }) {
  if (!task.due_date) return <span className="text-xs text-ink-3">{noDate}</span>;
  const overdue = task.due_date < asOf && task.status !== 'done';
  return (
    <time dateTime={task.due_date} className={`text-xs tabular-nums ${overdue ? 'font-medium text-bad' : 'text-ink-3'}`}>
      {new Date(`${task.due_date}T00:00:00Z`).toLocaleDateString(locale === 'en' ? 'en-US' : 'zh-TW', { month: 'short', day: 'numeric', timeZone: 'UTC' })}
    </time>
  );
}

/** The quiet metadata row shared by list rows and kanban cards. */
export function TaskMeta({ task, labels }: { task: TaskRow; labels: { checklist: string } }) {
  return (
    <>
      {task.checklist.total > 0 && (
        <span className="inline-flex items-center gap-1 text-xs tabular-nums text-ink-3" title={labels.checklist}>
          <ListChecks className="h-3.5 w-3.5" />{task.checklist.done}/{task.checklist.total}
        </span>
      )}
      {task.blockedBy > 0 && <Ban className="h-3.5 w-3.5 text-bad" aria-hidden />}
      {task.recurring_rule && <Repeat className="h-3.5 w-3.5 text-ink-3" aria-hidden />}
    </>
  );
}

export function LabelChips({ labels }: { labels: string[] }) {
  if (!labels.length) return null;
  return (
    <>
      {labels.map(l => <span key={l} className="pill pill-neutral text-[11px]">{l}</span>)}
    </>
  );
}
