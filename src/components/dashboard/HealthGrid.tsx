import Link from 'next/link';

/** Business health: 11 systems × 1–5 dots. Scoring happens in /company/health (founders + managers). */
export function HealthGrid({ systems }: { systems: { id: string; key: string; label: string; score: number; owner: string | null; nextAction: string | null }[] }) {
  return (
    <ul className="card grid grid-cols-1 divide-y divide-border sm:grid-cols-2 lg:grid-cols-3 lg:divide-y-0">
      {systems.map(s => (
        <li key={s.id}>
          <Link href={`/company/health#${s.key}`} className="row-hover flex items-center gap-3 px-4 py-3">
            <span className="w-24 text-sm font-medium">{s.label}</span>
            <span className="flex gap-1" aria-label={`${s.score} / 5`}>{[1, 2, 3, 4, 5].map(i => <span key={i} className={`h-2.5 w-2.5 rounded-full ${i <= s.score ? (s.score >= 4 ? 'bg-ok' : s.score >= 2 ? 'bg-warn' : 'bg-bad') : 'bg-muted'}`} />)}</span>
            <span className="ml-auto truncate text-xs text-ink-3">{s.owner ?? '—'}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
