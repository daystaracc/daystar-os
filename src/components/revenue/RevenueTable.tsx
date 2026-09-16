import Link from 'next/link';
import { formatTWD } from '@/lib/calculations/format';
import type { Locale } from '@/lib/i18n';
import type { RevenueEntry, RevenueTotals } from '@/lib/data/revenue';

export interface RevenueTableLabels {
  date: string; channel: string; orders: string; gross: string; refunds: string; fees: string; net: string; aov: string; sessions: string;
  empty: string; totalRow: string;
}

/**
 * One row per `sales_daily` entry for the period, newest first, plus a totals row.
 * Clicking a row opens it in the edit drawer (`?entry=<id>`) — same affordance as
 * the task list opening the detail panel.
 */
export function RevenueTable({ entries, totals, locale, labels }: {
  entries: RevenueEntry[]; totals: RevenueTotals; locale: Locale; labels: RevenueTableLabels;
}) {
  if (!entries.length) {
    return <div className="card card-pad text-sm text-ink-3">{labels.empty}</div>;
  }

  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-3">
            <th className="px-4 py-2.5 font-medium">{labels.date}</th>
            <th className="px-4 py-2.5 font-medium">{labels.channel}</th>
            <th className="px-4 py-2.5 text-right font-medium">{labels.orders}</th>
            <th className="px-4 py-2.5 text-right font-medium">{labels.gross}</th>
            <th className="px-4 py-2.5 text-right font-medium">{labels.refunds}</th>
            <th className="px-4 py-2.5 text-right font-medium">{labels.fees}</th>
            <th className="px-4 py-2.5 text-right font-medium">{labels.net}</th>
            <th className="px-4 py-2.5 text-right font-medium">{labels.sessions}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {entries.map(e => (
            <tr key={e.id} className="hover:bg-muted">
              <td className="px-0 py-0">
                <Link href={`?entry=${e.id}`} scroll={false} className="block px-4 py-2.5 tabular-nums">{e.date}</Link>
              </td>
              <td className="px-4 py-2.5">{e.channel_name || e.channel_key}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{e.orders.toLocaleString('en-US')}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{formatTWD(e.gross_revenue, locale)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-ink-3">{e.refunds ? formatTWD(e.refunds, locale) : '—'}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-ink-3">{e.platform_fees ? formatTWD(e.platform_fees, locale) : '—'}</td>
              <td className="px-4 py-2.5 text-right tabular-nums font-medium">{formatTWD(e.net_revenue ?? (e.gross_revenue - e.refunds - e.platform_fees), locale)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-ink-3">{e.sessions ?? '—'}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-border font-medium">
            <td className="px-4 py-2.5" colSpan={2}>{labels.totalRow}</td>
            <td className="px-4 py-2.5 text-right tabular-nums">{totals.orders.toLocaleString('en-US')}</td>
            <td className="px-4 py-2.5 text-right tabular-nums">{formatTWD(totals.gross, locale)}</td>
            <td className="px-4 py-2.5 text-right tabular-nums text-ink-3">{totals.refunds ? formatTWD(totals.refunds, locale) : '—'}</td>
            <td className="px-4 py-2.5 text-right tabular-nums text-ink-3">{totals.fees ? formatTWD(totals.fees, locale) : '—'}</td>
            <td className="px-4 py-2.5 text-right tabular-nums">{formatTWD(totals.net, locale)}</td>
            <td className="px-4 py-2.5 text-right" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
