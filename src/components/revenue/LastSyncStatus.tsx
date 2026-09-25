import { Clock, AlertTriangle } from 'lucide-react';
import type { ShowmoreSyncStatus } from '@/lib/data/showmoreSyncStatus';

export interface LastSyncStatusLabels {
  neverSynced: string;
}

/**
 * "Last synced" line under the Revenue page header — the whole point of the
 * scheduled Showmore sync is that Lucas can trust the numbers without wondering
 * when they last refreshed, so this is always visible, not tucked in a menu.
 * Red + warning icon on a failed run; the summary text itself (written server-side
 * by the sync route) already says what happened either way.
 */
export function LastSyncStatus({ status, labels }: { status: ShowmoreSyncStatus | null; labels: LastSyncStatusLabels }) {
  if (!status) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-ink-3">
        <Clock className="h-3.5 w-3.5 shrink-0" />
        {labels.neverSynced}
      </p>
    );
  }

  const when = new Date(status.syncedAt).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });

  return (
    <p className={`flex items-center gap-1.5 text-xs ${status.ok ? 'text-ink-3' : 'text-bad'}`}>
      {status.ok ? <Clock className="h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
      <span>{status.summary}</span>
      <span className="text-ink-3">· {when}</span>
    </p>
  );
}
