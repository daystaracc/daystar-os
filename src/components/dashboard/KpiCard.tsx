import { formatTWD, formatTWDCompact, formatPercent, formatDelta, pctChange, type Locale } from '@/lib/calculations/format';

type Kpi = { key: string; value: number | null; target: number | null; previous: number | null; unit: 'TWD' | 'percent' | 'count' };

/** KPI card: value, target, trend vs previous period, status. Context before data — never a bare number. */
export function KpiCard({ kpi, locale, label, targetLabel, momLabel }: { kpi: Kpi; locale: Locale; label: string; targetLabel: string; momLabel: string }) {
  const fmt = (v: number) => (kpi.unit === 'TWD' ? (v >= 1e6 ? formatTWDCompact(v, locale) : formatTWD(v, locale)) : kpi.unit === 'percent' ? formatPercent(v) : v.toLocaleString('en-US'));
  const delta = kpi.value !== null ? pctChange(kpi.value, kpi.previous) : null;
  const ratio = kpi.value !== null && kpi.target ? kpi.value / kpi.target : null;
  const status = ratio === null ? null : ratio >= 0.95 ? 'ok' : ratio >= 0.8 ? 'warn' : 'bad';
  return (
    <div className="card card-pad">
      <div className="label">{label}</div>
      <div className="kpi mt-2">{kpi.value === null ? <span className="text-ink-3">—</span> : fmt(kpi.value)}</div>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="text-ink-3">{kpi.target ? `${targetLabel} ${fmt(kpi.target)}` : '\u00a0'}</span>
        {delta !== null && <span className={delta >= 0 ? 'text-ok' : 'text-bad'}>{formatDelta(delta)} <span className="text-ink-3">{momLabel}</span></span>}
      </div>
      {status && <div className={`mt-2 h-0.5 w-8 rounded-full ${status === 'ok' ? 'bg-ok' : status === 'warn' ? 'bg-warn' : 'bg-bad'}`} aria-hidden />}
    </div>
  );
}
