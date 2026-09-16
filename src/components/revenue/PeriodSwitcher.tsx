'use client';
import Link from 'next/link';
import { useRevenueParams } from './params';
import type { RevenuePeriodPreset } from '@/lib/calculations/pacing';

const PRESETS: RevenuePeriodPreset[] = ['today', '7d', '30d', 'month', 'quarter', 'year'];

/** Pill row for the six period presets. Mirrors the KpiCard/StatusHeader visual language, not a new pattern. */
export function PeriodSwitcher({ active, labels }: { active: RevenuePeriodPreset; labels: Record<RevenuePeriodPreset, string> }) {
  const { href } = useRevenueParams();
  return (
    <div className="inline-flex rounded-md border border-border bg-surface p-0.5">
      {PRESETS.map(p => (
        <Link key={p} href={href({ period: p === '30d' ? null : p })} scroll={false}
          aria-current={p === active ? 'true' : undefined}
          className={`rounded-[5px] px-2.5 py-1 text-sm transition-colors duration-fast ${p === active ? 'bg-ink text-white' : 'text-ink-2 hover:text-ink'}`}>
          {labels[p]}
        </Link>
      ))}
    </div>
  );
}
