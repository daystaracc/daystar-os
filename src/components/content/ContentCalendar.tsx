'use client';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ContentRow } from '@/lib/data/content';
import { STATUS_GLYPH } from '@/lib/content/constants';
import { PILLAR_VAR, NO_PILLAR_VAR } from '@/components/content/pillarColors';

const PER_DAY = 3;

export interface ContentCalendarLabels {
  calendarPrev: string; calendarToday: string; calendarNext: string;
  noPublishDate: string; noOwner: string;
}

/**
 * Month grid of `publishDate`. Content without a publish date (most of the pipeline —
 * only `shot`/`posted` pieces normally carry one) cannot appear on a calendar, so it
 * is listed underneath rather than silently dropped — same approach as
 * TaskCalendar.tsx's undated-tasks section. `month` and the active `?view=` are both
 * URL state (see content/page.tsx), so a specific month is linkable/shareable.
 *
 * Each post chip's border color is now the piece's *pillar* (added 2026-10-02,
 * migration 0012 — see content/page.tsx's doc comment), not its production status;
 * status shows instead as a small glyph (○/◐/●/✓, from STATUS_GLYPH) next to the
 * title, matching the artifact this redesign is based on.
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
          <Link href={`?view=calendar&month=${shift(-1)}`} scroll={false} aria-label={labels.calendarPrev} className="ct-btn ct-btn-ghost ct-btn-icon h-8 w-8"><ChevronLeft className="h-4 w-4" /></Link>
          <Link href="?view=calendar" scroll={false} className="ct-btn h-8 px-3 text-sm">{labels.calendarToday}</Link>
          <Link href={`?view=calendar&month=${shift(1)}`} scroll={false} aria-label={labels.calendarNext} className="ct-btn ct-btn-ghost ct-btn-icon h-8 w-8"><ChevronRight className="h-4 w-4" /></Link>
        </div>
      </div>

      <div className="ct-cal-panel overflow-hidden">
        <div className="grid grid-cols-7">
          {weekdayNames.map(d => <div key={d} className="ct-dow">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((date, i) => {
            const dayItems = date ? byDate.get(date) ?? [] : [];
            const isToday = date === asOf;
            return (
              <div key={i} className={`ct-cal-day flex flex-col gap-1 last:border-r-0 ${date ? (isToday ? 'is-today' : '') : 'is-empty'}`}>
                {date && (
                  <>
                    <div className={`mb-1 text-right text-[11px] tabular-nums ct-mono ${isToday ? '' : 'ct-muted'}`}>
                      {isToday ? <span className="ct-cal-today-badge">{Number(date.slice(-2))}</span> : Number(date.slice(-2))}
                    </div>
                    <ul className="space-y-1">
                      {dayItems.slice(0, PER_DAY).map(c => {
                        const borderColor = c.pillar ? PILLAR_VAR[c.pillar.color] : NO_PILLAR_VAR;
                        const chip = (
                          <>
                            <span aria-hidden="true" className="ct-status-glyph">{STATUS_GLYPH[c.status]}</span>
                            {c.title}
                          </>
                        );
                        return (
                          <li key={c.id}>
                            {c.canEdit ? (
                              <Link href={`?view=calendar&month=${month}&edit=${c.id}`} scroll={false}
                                className={`ct-post-chip truncate ${c.status === 'posted' ? 'opacity-70' : ''}`}
                                style={{ borderLeftColor: borderColor }}>
                                {chip}
                              </Link>
                            ) : (
                              <span className={`ct-post-chip truncate block ${c.status === 'posted' ? 'opacity-70' : ''}`}
                                style={{ borderLeftColor: borderColor }}>
                                {chip}
                              </span>
                            )}
                          </li>
                        );
                      })}
                      {dayItems.length > PER_DAY && (
                        <li className="px-1.5 text-[11px] ct-muted ct-mono">+{dayItems.length - PER_DAY}</li>
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
          <h3 className="ct-label mb-1.5">{labels.noPublishDate}</h3>
          <ul className="ct-card ct-divide-y">
            {unscheduled.map(c => (
              <li key={c.id}>
                {c.canEdit ? (
                  <Link href={`?view=calendar&month=${month}&edit=${c.id}`} scroll={false} className="ct-row-hover flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{c.title}</span>
                    <span className="text-xs ct-muted">{c.owner?.name ?? labels.noOwner}</span>
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{c.title}</span>
                    <span className="text-xs ct-muted">{c.owner?.name ?? labels.noOwner}</span>
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
