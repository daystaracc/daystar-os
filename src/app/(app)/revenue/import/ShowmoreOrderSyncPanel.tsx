'use client';

import { useState, useTransition } from 'react';
import { RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import { syncShowmoreOrders } from './showmoreOrderSyncActions';
import type { SyncWriteOutcome } from '@/lib/integrations/showmoreSyncWrite';

export interface SyncLabels {
  title: string; subtitle: string; since: string; until: string; run: string; running: string;
  resultTitle: string; ordersIncluded: string; ordersExcluded: string;
  daysWritten: string; productsWritten: string; unmatched: string; unmatchedNote: string; failed: string;
}

/** YYYY-MM-DD, local to the browser — good enough for a date-range picker. */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Manual trigger for the live Showmore order sync (backfill/reconciliation) — the
 * "no file needed" counterpart to the CSV wizard above it on this page. Defaults to
 * the last 7 days, which covers "catch up since the webhook wasn't registered yet"
 * and "spot-check this week" without the user having to think about a range.
 */
export function ShowmoreOrderSyncPanel({ labels }: { labels: SyncLabels }) {
  const today = new Date();
  const weekAgo = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);
  const [since, setSince] = useState(isoDate(weekAgo));
  const [until, setUntil] = useState(isoDate(today));
  const [outcome, setOutcome] = useState<SyncWriteOutcome | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    setOutcome(null);
    startTransition(async () => {
      const result = await syncShowmoreOrders(since, until);
      setOutcome(result);
    });
  }

  return (
    <div className="card card-pad space-y-4">
      <div>
        <h2 className="text-sm font-medium">{labels.title}</h2>
        <p className="mt-1 text-sm text-ink-2">{labels.subtitle}</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="label">{labels.since}</span>
          <input type="date" value={since} max={until} onChange={e => setSince(e.target.value)} className="input" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="label">{labels.until}</span>
          <input type="date" value={until} min={since} onChange={e => setUntil(e.target.value)} className="input" />
        </label>
        <button type="button" onClick={run} disabled={pending} className="btn-primary">
          <RefreshCw className={`h-4 w-4 ${pending ? 'animate-spin' : ''}`} />
          {pending ? labels.running : labels.run}
        </button>
      </div>

      {outcome && (
        <div className={`card card-pad ${outcome.ok ? '' : 'border border-bad'}`}>
          <div className="flex items-start gap-2">
            {outcome.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-bad" />}
            <div className="min-w-0">
              <div className="text-sm font-medium">{outcome.ok ? labels.resultTitle : labels.failed}</div>
              {outcome.message && <p className="mt-1 text-sm text-ink-2">{outcome.message}</p>}
              {outcome.summary && (
                <>
                  <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                    <Stat label={labels.ordersIncluded} value={outcome.summary.ordersIncluded.toLocaleString('en-US')} />
                    <Stat label={labels.ordersExcluded} value={outcome.summary.ordersExcluded.toLocaleString('en-US')} />
                    <Stat label={labels.daysWritten} value={outcome.summary.daysWritten.toLocaleString('en-US')} />
                    <Stat label={labels.productsWritten} value={outcome.summary.productsWritten.toLocaleString('en-US')} />
                    <Stat label={labels.unmatched} value={outcome.summary.unmatched.toLocaleString('en-US')} />
                  </dl>
                  {outcome.summary.unmatched > 0 && <p className="mt-3 text-xs text-ink-2">{labels.unmatchedNote}</p>}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="label">{label}</dt>
      <dd className="tabular-nums font-medium">{value}</dd>
    </div>
  );
}
