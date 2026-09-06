import Link from 'next/link';
import { formatTWDCompact, type Locale } from '@/lib/calculations/format';
import type { CommandCenterData } from '@/lib/data/commandCenter';

const tone = { ok: 'pill-ok', low: 'pill-warn', critical: 'pill-bad', overstock: 'pill-neutral', dead: 'pill-neutral' } as const;

export function HeroProducts({ products, locale, stockLabels }: { products: CommandCenterData['heroProducts']; locale: Locale; stockLabels: Record<'critical' | 'low' | 'ok' | 'overstock' | 'dead', string> }) {
  return (
    <ul className="card divide-y divide-border">
      {products.map(p => (
        <li key={p.id}>
          <Link href={`/products/${p.id}`} className="row-hover flex items-center gap-4 px-4 py-3">
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{p.name}</span><span className="text-xs text-ink-3">{p.sku} · {formatTWDCompact(p.revenue30d, locale)} · {p.share.toFixed(0)}%</span></span>
            <span className="text-right text-xs tabular-nums text-ink-3">{p.onHand} <span className="text-ink-3">/ {Number.isFinite(p.weeks) ? `${p.weeks.toFixed(1)}w` : '∞'}</span></span>
            <span className={`pill ${tone[p.status]} w-20 justify-center`}>{stockLabels[p.status]}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
