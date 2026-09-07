import { formatTWD, formatTWDCompact, formatPercent, formatDelta, pctChange, type Locale } from '@/lib/calculations/format';

type Kpi = {
  key: string; value: number | null; target: number | null; previous: number | null;
  unit: 'TWD' | 'percent' | 'count';
  /** Set when the figure cannot be computed because source data is missing. */
  incomplete?: { uncostedProducts: number; uncostedUnits: number };
};

/**
 * KPI card: value, target, trend vs previous period, status. Context before data —
 * never a bare number.
 *
 * Narrow screens get the compact currency form (NT$10.4 萬 / NT$103.5K) instead of the
 * full one. A phone-width card has ~125px of inner width, which "NT$103,520" at the KPI
 * size cannot fit: it used to clip at the card edge and, because grid items default to
 * `min-width: auto`, it also stopped the two columns from shrinking and pushed the whole
 * page into horizontal scroll. Both the value and the target/delta line therefore render
 * two variants and let the breakpoint pick one — only the displayed one is in the
 * accessibility tree, since the other is `display: none`.
 */
export function KpiCard({ kpi, locale, label, targetLabel, momLabel, noDataLabel, noDataDetail }: {
  kpi: Kpi; locale: Locale; label: string; targetLabel: string; momLabel: string;
  noDataLabel: string; noDataDetail: string;
}) {
  /** What desktop shows: full digits, compacting only once the number gets long. */
  const wide = (v: number) =>
    kpi.unit === 'TWD' ? (v >= 1e6 ? formatTWDCompact(v, locale) : formatTWD(v, locale))
      : kpi.unit === 'percent' ? formatPercent(v)
        : v.toLocaleString('en-US');
  /** What a phone shows: always compact for money; other units are already short. */
  const narrow = (v: number) => (kpi.unit === 'TWD' ? formatTWDCompact(v, locale) : wide(v));

  const delta = kpi.value !== null ? pctChange(kpi.value, kpi.previous) : null;
  const ratio = kpi.value !== null && kpi.target ? kpi.value / kpi.target : null;
  const status = ratio === null ? null : ratio >= 0.95 ? 'ok' : ratio >= 0.8 ? 'warn' : 'bad';

  return (
    // min-w-0 lets the grid track shrink below the content's intrinsic width.
    <div className="card card-pad min-w-0">
      <div className="label">{label}</div>

      <div className="mt-2 whitespace-nowrap text-2xl font-semibold leading-tight tracking-tight tabular-nums sm:text-kpi">
        {kpi.value !== null
          ? <Responsive narrow={narrow(kpi.value)} wide={wide(kpi.value)} />
          // Missing source data says so. A partial total presented as a whole one —
          // or a 0 cost read as 100% margin — is worse than no number at all.
          : <span className="text-base font-medium text-ink-3 sm:text-lg">{kpi.incomplete ? noDataLabel : '—'}</span>}
      </div>
      {kpi.incomplete && <p className="mt-1 text-xs leading-snug text-ink-3">{noDataDetail}</p>}

      {/* Stacked on a phone so neither phrase can break mid-way; one row once there is space. */}
      <div className="mt-2 flex flex-col gap-0.5 text-xs sm:flex-row sm:items-center sm:justify-between sm:gap-2">
        {kpi.target ? (
          <span className="truncate whitespace-nowrap text-ink-3">
            {targetLabel} <Responsive narrow={narrow(kpi.target)} wide={wide(kpi.target)} />
          </span>
        ) : <span className="hidden sm:inline">&nbsp;</span>}
        {delta !== null && (
          <span className={`whitespace-nowrap ${delta >= 0 ? 'text-ok' : 'text-bad'}`}>
            {formatDelta(delta)} <span className="text-ink-3">{momLabel}</span>
          </span>
        )}
      </div>

      {status && <div className={`mt-2 h-0.5 w-8 rounded-full ${status === 'ok' ? 'bg-ok' : status === 'warn' ? 'bg-warn' : 'bg-bad'}`} aria-hidden />}
    </div>
  );
}

/** Renders one of two strings by breakpoint. Identical strings collapse to a single node. */
function Responsive({ narrow, wide }: { narrow: string; wide: string }) {
  if (narrow === wide) return <>{wide}</>;
  return (
    <>
      <span className="sm:hidden">{narrow}</span>
      <span className="hidden sm:inline">{wide}</span>
    </>
  );
}
