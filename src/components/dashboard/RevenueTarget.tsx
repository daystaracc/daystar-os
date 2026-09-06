import type { Pacing } from '@/lib/calculations/pacing';
import { formatTWD, formatTWDCompact, formatPercent, type Locale } from '@/lib/calculations/format';

const tone = { ahead: 'pill-ok', on_pace: 'pill-ok', behind: 'pill-bad' } as const;
const bar = { ahead: 'bg-ok', on_pace: 'bg-brand-gold', behind: 'bg-bad' } as const;

/** Monthly revenue target: the big number, progress vs expected, pace stats. All numbers come from computePacing. */
export function RevenueTarget({ data, locale, t }: { data: Pacing & { month: string }; locale: Locale; t: Record<'title' | 'target' | 'currentPace' | 'requiredPace' | 'projected' | 'daysRemaining' | 'gap' | 'perDay' | 'status' | 'expected', string> }) {
  const pct = Math.min(100, data.progressPct);
  // The unit is typeset as a quiet suffix, not part of the number — it keeps the
  // figure readable and stops "NT$25.9K/day" from outgrowing its column.
  const stats: [label: string, value: string, unit?: string][] = [
    [t.currentPace, formatTWDCompact(data.actualPace, locale), t.perDay],
    [t.requiredPace, formatTWDCompact(data.requiredPace, locale), t.perDay],
    [t.projected, formatTWDCompact(data.projectedFinish, locale)],
    [t.daysRemaining, String(data.remainingDays)],
    [t.gap, formatTWDCompact(Math.max(0, data.target - data.actual), locale)],
  ];
  return (
    <div className="card card-pad h-full">
      <div className="flex items-center justify-between"><div className="label">{t.title}</div><span className={`pill ${tone[data.status]} text-[11px] uppercase tracking-wide`}>{t.status}</span></div>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <div className="kpi-lg">{formatTWD(data.actual, locale)}</div>
        <div className="text-sm text-ink-3">{t.target} {formatTWD(data.target, locale)}</div>
        <div className="ml-auto text-2xl font-semibold tabular-nums">{formatPercent(data.progressPct)}</div>
      </div>
      <div className="relative mt-4 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full rounded-full ${bar[data.status]} transition-[width] duration-slow`} style={{ width: `${pct}%` }} />
        <div className="absolute inset-y-0 w-px bg-ink/40" style={{ left: `${Math.min(100, data.expectedProgressPct)}%` }} title={t.expected} />
      </div>
      {/* Three columns, not five: at five the cell is ~103px and clips "NT$25.9K/day"
          in English and wraps "NT$2.6 萬／天" in 繁中. Three fits both at every width. */}
      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
        {stats.map(([k, v, unit]) => (
          <div key={k}>
            <dt className="label whitespace-nowrap">{k}</dt>
            <dd className="mt-1 whitespace-nowrap text-lg font-semibold tabular-nums">{v}{unit && <span className="text-sm font-normal text-ink-3">{unit}</span>}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
