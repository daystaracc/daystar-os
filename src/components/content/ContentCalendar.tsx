'use client';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ContentRow } from '@/lib/data/content';

const PER_DAY = 3;

export interface ContentCalendarLabels {
  calendarPrev: string; calendarToday: string; calendarNext: string;
  noPublishDate: string; noOwner: string;
}

/**
 * Month grid of `publishDate`. Content without a publish date (most of the pipeline —
 * only `scheduled`/`published` pieces normally carry one) cannot appear on a calendar,
 * so it is listed underneath rather than silently dropped — same approach as
 * TaskCalendar.tsx's undated-tasks section. `month` and the active `?view=` are both
 * URL state (see content/page.tsx), so a specific month is linkable/shareable.
 */
export function ContentCalendar({ items, month, asOf, locale, labels }: {
  items: ContentRow[]; month: string; asOf: string; locale: string; labels: ContentCalendarLabels;
}) {
  const loc = locale === 'en' ? 'en-US' : 'zh-TW';
  const [y, m] = month.split('-').map(Number);

  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const leading = (first.getUTCDay() + 6) % 7; // Monday-first
  const cells: (string | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${y}-${String(m).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const byDate = new Map<string, ContentRow[]>();
  for (const c of items) {
    if (!c.publishDate) continue;
    const day = byDate.get(c.publishDate);
    if (day) day.push(c); else byDate.set(c.publishDate, [c]);
  }
  const unscheduled = items.filter(c => !c.publishDate);

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
          <Link href={`?view=calendar&month=${shift(-1)}`} scroll={false} aria-label={labels.calendarPrev} className="btn-ghost h-8 w-8 px-0"><ChevronLeft className="h-4 w-4" /></Link>
          <Link href="?view=calendar" scroll={false} className="btn-outline h-8 px-3 text-sm">{labels.calendarToday}</Link>
          <Link href={`?view=calendar&month=${shift(1)}`} scroll={false} aria-label={labels.calendarNext} className="btn-ghost h-8 w-8 px-0"><ChevronRight className="h-4 w-4" /></Link>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border">
          {weekdayNames.map(d => <div key={d} className="label px-2 py-1.5 text-center">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((date, i) => {
            const dayItems = date ? byDate.get(date) ?? [] : [];
            const isToday = date === asOf;
            return (
              <div key={i} className={`min-h-[6.5rem] border-b border-r border-border p-1.5 last:border-r-0 ${date ? '' : 'bg-muted/40'}`}>
                {date && (
                  <>
                    <div className={`mb-1 text-right text-[11px] tabular-nums ${isToday ? 'font-semibold text-ink' : 'text-ink-3'}`}>
                      {isToday ? <span className="inline-grid h-5 w-5 place-items-center rounded-full bg-ink text-white">{Number(date.slice(-2))}</span> : Number(date.slice(-2))}
                    </div>
                    <ul className="space-y-1">
                      {dayItems.slice(0, PER_DAY).map(c => (
                        <li key={c.id}>
                          {c.canEdit ? (
                            <Link href={`?view=calendar&month=${month}&edit=${c.id}`} scroll={false}
                              className={`block truncate rounded-sm bg-muted px-1.5 py-0.5 text-[11px] leading-tight hover:bg-border ${c.status === 'published' ? 'opacity-70' : ''}`}>
                              {c.title}
                            </Link>
                          ) : (
                            <span className={`block truncate rounded-sm bg-muted px-1.5 py-0.5 text-[11px] leading-tight ${c.status === 'published' ? 'opacity-70' : ''}`}>
                              {c.title}
                            </span>
                          )}
                        </li>
                      ))}
                      {dayItems.length > PER_DAY && (
                        <li className="px-1.5 text-[11px] text-ink-3">+{dayItems.length - PER_DAY}</li>
                      )}
                    </ul>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {unscheduled.length > 0 && (
        <section>
          <h3 className="label mb-1.5">{labels.noPublishDate}</h3>
          <ul className="card divide-y divide-border">
            {unscheduled.map(c => (
              <li key={c.id}>
                {c.canEdit ? (
                  <Link href={`?view=calendar&month=${month}&edit=${c.id}`} scroll={false} className="row-hover flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{c.title}</span>
                    <span className="text-xs text-ink-3">{c.owner?.name ?? labels.noOwner}</span>
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{c.title}</span>
                    <span className="text-xs text-ink-3">{c.owner?.name ?? labels.noOwner}</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
