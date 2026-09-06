'use client';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTaskParams } from './params';
import { PRIORITY_TONE } from './bits';
import type { TaskUiLabels } from './labels';
import type { TaskRow } from '@/lib/data/tasks';

const PER_DAY = 3;

/**
 * Month grid of due dates. Tasks without a due date cannot appear on a calendar, so
 * they are listed underneath rather than silently dropped.
 */
export function TaskCalendar({ tasks, labels, month, asOf }: { tasks: TaskRow[]; labels: TaskUiLabels; month: string; asOf: string }) {
  const { href } = useTaskParams();
  const loc = labels.locale === 'en' ? 'en-US' : 'zh-TW';
  const [y, m] = month.split('-').map(Number);

  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const leading = (first.getUTCDay() + 6) % 7; // Monday-first
  const cells: (string | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${y}-${String(m).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const byDate = new Map<string, TaskRow[]>();
  for (const t of tasks) {
    if (!t.due_date) continue;
    const day = byDate.get(t.due_date);
    if (day) day.push(t); else byDate.set(t.due_date, [t]);
  }
  const undated = tasks.filter(t => !t.due_date);

  const shift = (delta: number) => {
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  };
  const weekdayNames = Array.from({ length: 7 }, (_, i) =>
    new Date(Date.UTC(2024, 0, 1 + i)).toLocaleDateString(loc, { weekday: 'short', timeZone: 'UTC' }));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">{first.toLocaleDateString(loc, { month: 'long', year: 'numeric', timeZone: 'UTC' })}</h2>
        <div className="ml-auto flex items-center gap-1">
          <Link href={href({ month: shift(-1) })} scroll={false} aria-label={labels.calendarPrev} className="btn-ghost h-8 w-8 px-0"><ChevronLeft className="h-4 w-4" /></Link>
          <Link href={href({ month: null })} scroll={false} className="btn-outline h-8 px-3 text-sm">{labels.calendarToday}</Link>
          <Link href={href({ month: shift(1) })} scroll={false} aria-label={labels.calendarNext} className="btn-ghost h-8 w-8 px-0"><ChevronRight className="h-4 w-4" /></Link>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border">
          {weekdayNames.map(d => <div key={d} className="label px-2 py-1.5 text-center">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((date, i) => {
            const items = date ? byDate.get(date) ?? [] : [];
            const isToday = date === asOf;
            return (
              <div key={i} className={`min-h-[6.5rem] border-b border-r border-border p-1.5 last:border-r-0 ${date ? '' : 'bg-muted/40'}`}>
                {date && (
                  <>
                    <div className={`mb-1 text-right text-[11px] tabular-nums ${isToday ? 'font-semibold text-ink' : 'text-ink-3'}`}>
                      {isToday ? <span className="inline-grid h-5 w-5 place-items-center rounded-full bg-ink text-white">{Number(date.slice(-2))}</span> : Number(date.slice(-2))}
                    </div>
                    <ul className="space-y-1">
                      {items.slice(0, PER_DAY).map(t => (
                        <li key={t.id}>
                          <Link href={href({ task: t.id })} scroll={false}
                            className={`block truncate rounded-sm bg-muted px-1.5 py-0.5 text-[11px] leading-tight hover:bg-border ${t.status === 'done' ? 'line-through opacity-60' : ''}`}>
                            <span className={`mr-1 ${PRIORITY_TONE[t.priority]}`}>•</span>{t.title}
                          </Link>
                        </li>
                      ))}
                      {items.length > PER_DAY && (
                        <li className="px-1.5 text-[11px] text-ink-3">+{items.length - PER_DAY}</li>
                      )}
                    </ul>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {undated.length > 0 && (
        <section>
          <h3 className="label mb-1.5">{labels.noDueDate}</h3>
          <ul className="card divide-y divide-border">
            {undated.map(t => (
              <li key={t.id}>
                <Link href={href({ task: t.id })} scroll={false} className="row-hover flex items-center gap-3 px-3 py-2 text-sm">
                  <span className={PRIORITY_TONE[t.priority]}>•</span>
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                  <span className="text-xs text-ink-3">{t.assignee?.name ?? labels.unassigned}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
