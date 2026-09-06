'use client';
import Link from 'next/link';
import { useOptimistic, useTransition } from 'react';
import { actOnAttention } from '@/app/(app)/overview/actions';
import type { AttentionItem } from '@/lib/calculations/rules';

type Item = AttentionItem & { text: string; severityLabel: string };
const dot = { critical: 'bg-bad', high: 'bg-bad/70', medium: 'bg-warn', low: 'bg-ink-3' } as const;

/** What Needs Attention: ranked exceptions with View / Resolve / Dismiss. Optimistic removal; the server re-evaluates rules on next load. */
export function AttentionList({ items, labels }: { items: Item[]; labels: Record<'title' | 'empty' | 'view' | 'resolve' | 'dismiss', string> }) {
  const [list, remove] = useOptimistic(items, (state, key: string) => state.filter(i => `${i.code}:${i.entityId ?? ''}` !== key));
  const [, start] = useTransition();
  const act = (i: Item, action: 'resolved' | 'dismissed') => start(async () => { remove(`${i.code}:${i.entityId ?? ''}`); await actOnAttention({ code: i.code, entityId: i.entityId ?? null, action }); });
  return (
    <div className="card h-full">
      <div className="flex items-center justify-between px-5 pt-5"><div className="label">{labels.title}</div><span className="text-xs tabular-nums text-ink-3">{list.length}</span></div>
      {list.length === 0 ? <p className="px-5 py-8 text-sm text-ink-3">{labels.empty}</p> : (
        <ul className="mt-2 divide-y divide-border">
          {list.slice(0, 6).map(i => (
            <li key={`${i.code}:${i.entityId ?? ''}`} className="group flex items-start gap-3 px-5 py-3">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot[i.severity]}`} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="label">{i.severityLabel}</div>
                <p className="mt-0.5 text-sm leading-snug">{i.text}</p>
                <div className="mt-1.5 flex gap-3 text-xs text-ink-3 opacity-80 group-hover:opacity-100">
                  <Link href={i.href} className="hover:text-ink">{labels.view}</Link>
                  <button onClick={() => act(i, 'resolved')} className="hover:text-ink">{labels.resolve}</button>
                  <button onClick={() => act(i, 'dismissed')} className="hover:text-ink">{labels.dismiss}</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
