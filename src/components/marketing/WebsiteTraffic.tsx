import { Globe } from 'lucide-react';
import { getWebsiteTrafficReport, type WebsiteTrafficReport } from '@/lib/integrations/googleAnalytics';
import { formatPercent, formatDelta, pctChange } from '@/lib/calculations/format';
import type { T } from '@/lib/i18n';

export interface WebsiteTrafficLabels {
  heading: string; asOf: string;
  sessions: string; users: string; pageviews: string; avgDuration: string; engagementRate: string;
  topPages: string; trafficSources: string; noPages: string; noSources: string;
  notConfigured: string; loadFailed: string;
}

/** m:ss — "3:42", never a raw seconds count. */
function formatDuration(totalSeconds: number): string {
  const s = Math.round(totalSeconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * "Website traffic" card on the Marketing page (added 2026-09-22) — GA4 sessions,
 * users, pageviews and engagement for yesterday, vs the day before, plus yesterday's
 * top pages and traffic sources. Always visible above the Campaigns/Ad
 * spend/Creators tabs (unlike those, it isn't one of the three sub-areas — it's the
 * "is anyone even showing up" number Lucas wants at a glance every morning, so it
 * doesn't hide behind a tab click). Read-only: no drawer, no write path, same
 * reasoning as why this lives in `lib/integrations/` rather than `lib/data/` — it
 * never touches Supabase.
 */
export async function WebsiteTraffic({ t, labels }: { t: T; labels: WebsiteTrafficLabels }) {
  const report = await getWebsiteTrafficReport();

  if (report.notConfigured) {
    return (
      <div className="card card-pad flex items-center gap-3 text-sm text-ink-3">
        <Globe className="h-4 w-4 shrink-0" />
        <span>{labels.notConfigured}</span>
      </div>
    );
  }
  if (report.error) {
    return <div className="card card-pad text-sm text-bad">{labels.loadFailed}</div>;
  }

  return (
    <div className="card card-pad space-y-4">
      <div className="flex items-baseline justify-between">
        <div className="flex items-center gap-1.5 text-sm font-medium"><Globe className="h-4 w-4 text-ink-3" />{labels.heading}</div>
        <span className="text-xs text-ink-3">{labels.asOf} {report.date}</span>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <TrafficKpi label={labels.sessions} value={report.totals.sessions.toLocaleString()} previous={report.previousTotals?.sessions} current={report.totals.sessions} t={t} />
        <TrafficKpi label={labels.users} value={report.totals.users.toLocaleString()} previous={report.previousTotals?.users} current={report.totals.users} t={t} />
        <TrafficKpi label={labels.pageviews} value={report.totals.pageviews.toLocaleString()} previous={report.previousTotals?.pageviews} current={report.totals.pageviews} t={t} />
        <TrafficKpi label={labels.avgDuration} value={formatDuration(report.totals.avgSessionDurationSeconds)} previous={report.previousTotals?.avgSessionDurationSeconds} current={report.totals.avgSessionDurationSeconds} t={t} />
        <TrafficKpi label={labels.engagementRate} value={formatPercent(report.totals.engagementRate * 100)} previous={report.previousTotals ? report.previousTotals.engagementRate * 100 : undefined} current={report.totals.engagementRate * 100} t={t} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <div className="label mb-1.5">{labels.topPages}</div>
          {report.topPages.length === 0 ? (
            <p className="text-xs text-ink-3">{labels.noPages}</p>
          ) : (
            <ul className="space-y-1">
              {report.topPages.map(p => (
                <li key={p.path} className="flex items-center justify-between gap-3 text-xs">
                  <span className="min-w-0 truncate text-ink-2">{p.path}</span>
                  <span className="shrink-0 tabular-nums text-ink-3">{p.views.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <div className="label mb-1.5">{labels.trafficSources}</div>
          {report.sources.length === 0 ? (
            <p className="text-xs text-ink-3">{labels.noSources}</p>
          ) : (
            <ul className="space-y-1">
              {report.sources.map(s => (
                <li key={s.channel} className="flex items-center justify-between gap-3 text-xs">
                  <span className="min-w-0 truncate text-ink-2">{s.channel}</span>
                  <span className="shrink-0 tabular-nums text-ink-3">{s.sessions.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function TrafficKpi({ label, value, previous, current, t }: { label: string; value: string; previous: number | undefined; current: number; t: T }) {
  const delta = previous !== undefined ? pctChange(current, previous) : null;
  return (
    <div>
      <div className="label">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
      {delta !== null && (
        <span className={`text-xs ${delta >= 0 ? 'text-ok' : 'text-bad'}`}>
          {formatDelta(delta)} <span className="text-ink-3">{t('marketing.trafficVsYesterday')}</span>
        </span>
      )}
    </div>
  );
}
