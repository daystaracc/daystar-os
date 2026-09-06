import type { CompanyStatus } from '@/lib/calculations/health';

const tone: Record<CompanyStatus, string> = { on_track: 'pill-ok', at_risk: 'pill-warn', off_track: 'pill-bad' };

/** Greeting + company status + 3–5 line executive summary. The first thing a founder reads. */
export function StatusHeader({ greeting, subtitle, status, statusLabel, statusText, summary }: { greeting: string; subtitle: string; status: CompanyStatus; statusLabel: string; statusText: string; summary: string[] }) {
  return (
    <header className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
      <div>
        <h1 className="text-3xl">{greeting}</h1>
        <p className="mt-1 text-ink-2">{subtitle}</p>
      </div>
      <div className="md:max-w-md">
        <div className="flex items-center gap-2"><span className="label">{statusLabel}</span><span className={`pill ${tone[status]} text-[11px] uppercase tracking-wide`}>{statusText}</span></div>
        <ul className="mt-2 space-y-1 text-sm text-ink-2">{summary.map((s, i) => <li key={i} className="flex gap-2"><span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-ink-3" />{s}</li>)}</ul>
      </div>
    </header>
  );
}
