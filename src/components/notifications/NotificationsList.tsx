'use client';

import { useMemo, useState, useTransition, useOptimistic } from 'react';
import { markNotificationRead, markAllNotificationsRead } from '@/app/(app)/notifications/actions';
import type { NotificationRow } from '@/lib/data/notifications';
import type { Locale } from '@/lib/i18n';

const DOT = { critical: 'bg-bad', high: 'bg-bad/70', medium: 'bg-warn', low: 'bg-ink-3' } as const;

export interface NotificationsLabels {
  empty: string; unreadTab: string; allTab: string;
  markAllRead: string; markRead: string;
  loadFailed: string;
}

/** Notifications (`/notifications`, the bell icon's destination). Mirrors AttentionList's
    optimistic mark-as-read pattern: the click clears it from view immediately, the server
    action runs in the background, and a full reload would show the real persisted state
    either way. */
export function NotificationsList({ locale, items, labels, error }: { locale: Locale; items: NotificationRow[]; labels: NotificationsLabels; error: boolean }) {
  const [tab, setTab] = useState<'unread' | 'all'>('unread');
  const [readIds, markRead] = useOptimistic(new Set<string>(), (state, id: string) => new Set(state).add(id));
  const [, start] = useTransition();

  const visible = useMemo(() => {
    const withOptimistic = items.map(n => (readIds.has(n.id) ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n));
    return tab === 'unread' ? withOptimistic.filter(n => !n.readAt) : withOptimistic;
  }, [items, readIds, tab]);

  const unreadCount = useMemo(() => items.filter(n => !n.readAt && !readIds.has(n.id)).length, [items, readIds]);

  const onMarkRead = (id: string) => start(async () => { markRead(id); await markNotificationRead(id); });
  const onMarkAllRead = () => start(async () => { items.forEach(n => markRead(n.id)); await markAllNotificationsRead(); });

  const fmt = (iso: string) => new Date(iso).toLocaleString(locale === 'en' ? 'en-US' : 'zh-TW', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  if (error) return <div className="card card-pad text-sm text-ink-2">{labels.loadFailed}</div>;

  return (
    <div className="card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div className="flex gap-1">
          <button onClick={() => setTab('unread')} className={`rounded-md px-2.5 py-1 text-sm ${tab === 'unread' ? 'bg-muted font-medium text-ink' : 'text-ink-2 hover:text-ink'}`}>
            {labels.unreadTab}{unreadCount > 0 ? ` · ${unreadCount}` : ''}
          </button>
          <button onClick={() => setTab('all')} className={`rounded-md px-2.5 py-1 text-sm ${tab === 'all' ? 'bg-muted font-medium text-ink' : 'text-ink-2 hover:text-ink'}`}>
            {labels.allTab}
          </button>
        </div>
        {unreadCount > 0 && <button onClick={onMarkAllRead} className="text-sm text-ink-2 hover:text-ink">{labels.markAllRead}</button>}
      </div>

      {visible.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-ink-3">{labels.empty}</p>
      ) : (
        <ul className="divide-y divide-border">
          {visible.map(n => (
            <li key={n.id} className="group flex items-start gap-3 px-5 py-3">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[n.severity]} ${n.readAt ? 'opacity-30' : ''}`} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className={`text-sm leading-snug ${n.readAt ? 'text-ink-2' : 'font-medium text-ink'}`}>{n.title}</p>
                {n.body && <p className="mt-0.5 text-sm text-ink-2">{n.body}</p>}
                <div className="mt-1 text-xs tabular-nums text-ink-3">{fmt(n.createdAt)}</div>
              </div>
              {!n.readAt && (
                <button onClick={() => onMarkRead(n.id)} className="shrink-0 text-xs text-ink-3 opacity-0 hover:text-ink group-hover:opacity-100">
                  {labels.markRead}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
