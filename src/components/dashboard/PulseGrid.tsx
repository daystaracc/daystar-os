import { formatTWD, type Locale } from '@/lib/calculations/format';
import type { CommandCenterData } from '@/lib/data/commandCenter';

/** Today at DAYSTAR: eight scannable numbers. Problem numbers turn red only when non-zero. */
export function PulseGrid({ pulse, locale, labels }: { pulse: CommandCenterData['pulse']; locale: Locale; labels: Record<keyof CommandCenterData['pulse'], string> }) {
  const cells: [keyof CommandCenterData['pulse'], string, boolean][] = [
    ['revenueToday', formatTWD(pulse.revenueToday, locale), false], ['ordersToday', String(pulse.ordersToday), false], ['waiting', String(pulse.waiting), pulse.waiting > 0],
    ['csPending', String(pulse.csPending), pulse.csPending > 5], ['lowStock', String(pulse.lowStock), pulse.lowStock > 0], ['tasksDue', String(pulse.tasksDue), false],
    ['overdue', String(pulse.overdue), pulse.overdue > 0], ['publishing', String(pulse.publishing), false],
  ];
  return (
    <div className="card grid grid-cols-2 divide-y divide-border md:grid-cols-4 md:divide-y-0 md:divide-x">
      {cells.map(([k, v, warn]) => <div key={k} className="px-5 py-4"><div className="label">{labels[k]}</div><div className={`mt-1 text-xl font-semibold tabular-nums ${warn ? 'text-bad' : ''}`}>{v}</div></div>)}
    </div>
  );
}
