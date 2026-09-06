import { formatTWDCompact, type Locale } from '@/lib/calculations/format';
import type { CommandCenterData } from '@/lib/data/commandCenter';

/** 100M journey strip: Current → 1M → 2.5M → 5M → 8.33M/month. Each stage is a different company; the full interactive view lives at /goals/journey. */
export function JourneyStrip({ journey, locale, labels }: { journey: CommandCenterData['journey']; locale: Locale; labels: Record<'current' | 'runRate' | 'perMonth' | 'perYear' | 'gap', string> }) {
  const cur = journey.currentMonthlyRunRate;
  const next = journey.stages.find(s => !s.reached);
  return (
    <div className="card card-pad">
      <ol className="flex items-center gap-2 overflow-x-auto">
        <li className="shrink-0 rounded-md bg-ink px-3 py-2 text-white"><div className="text-[10px] uppercase tracking-wide opacity-70">{labels.current}</div><div className="text-sm font-semibold tabular-nums">{formatTWDCompact(cur, locale)}{labels.perMonth}</div></li>
        {journey.stages.map(s => (
          <li key={s.label} className="flex shrink-0 items-center gap-2">
            <span className="h-px w-8 bg-border-strong" />
            <div className={`rounded-md border px-3 py-2 ${s.reached ? 'border-ok/40 bg-ok-soft' : 'border-border bg-surface'}`}><div className="text-[10px] uppercase tracking-wide text-ink-3">{s.reached ? '✓' : ''} NT${s.label}</div><div className="text-sm font-semibold tabular-nums">{formatTWDCompact(s.monthly, locale)}{labels.perMonth}</div></div>
          </li>
        ))}
        <li className="flex shrink-0 items-center gap-2"><span className="h-px w-8 bg-border-strong" /><div className="rounded-md border border-brand-gold/60 bg-surface px-3 py-2"><div className="text-[10px] uppercase tracking-wide text-ink-3">100M</div><div className="text-sm font-semibold tabular-nums">NT$100M{labels.perYear}</div></div></li>
      </ol>
      {next && <p className="mt-3 text-sm text-ink-2">{labels.runRate}: <b className="tabular-nums text-ink">{formatTWDCompact(journey.annualRunRate, locale)}{labels.perYear}</b> · {labels.gap} → NT${next.label}: <b className="tabular-nums text-ink">{formatTWDCompact(Math.max(0, next.monthly - cur), locale)}{labels.perMonth}</b></p>}
    </div>
  );
}
