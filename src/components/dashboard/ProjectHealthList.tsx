import Link from 'next/link';
import type { CommandCenterData } from '@/lib/data/commandCenter';

const tone = { healthy: 'pill-ok', at_risk: 'pill-warn', critical: 'pill-bad' } as const;
const bar = { healthy: 'bg-ok', at_risk: 'bg-warn', critical: 'bg-bad' } as const;

export function ProjectHealthList({ projects, healthLabels }: { projects: CommandCenterData['projects']; healthLabels: Record<'healthy' | 'at_risk' | 'critical', string> }) {
  return (
    <ul className="card divide-y divide-border">
      {projects.slice(0, 6).map(p => (
        <li key={p.id}>
          <Link href={`/projects/${p.id}`} className="row-hover flex items-center gap-4 px-4 py-3">
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
            <span className="hidden w-28 sm:block"><span className="block h-1.5 overflow-hidden rounded-full bg-muted"><span className={`block h-full rounded-full ${bar[p.health]}`} style={{ width: `${p.progress}%` }} /></span></span>
            <span className="w-10 text-right text-sm tabular-nums">{p.progress}%</span>
            <span className={`pill ${tone[p.health]} w-20 justify-center`}>{healthLabels[p.health]}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
