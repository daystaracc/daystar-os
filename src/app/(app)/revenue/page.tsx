import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Plus, Upload } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import { can, type Role } from '@/lib/permissions';
import { getRevenue } from '@/lib/data/revenue';
import { resolvePeriod, type RevenuePeriodPreset } from '@/lib/calculations/pacing';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { PeriodSwitcher } from '@/components/revenue/PeriodSwitcher';
import { RevenueTable } from '@/components/revenue/RevenueTable';
import { RevenueEntryDrawer } from '@/components/revenue/RevenueEntryDrawer';

export const dynamic = 'force-dynamic';

type Search = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const PRESETS: readonly RevenuePeriodPreset[] = ['today', '7d', '30d', 'month', 'quarter', 'year'];

/**
 * REVENUE — manual (and, eventually, imported) daily figures per channel: what
 * actually happened vs the previous period, one row per `sales_daily` entry.
 * Founder + manager only (`can.viewRevenue`), matching the `sales_daily_select` /
 * `sales_daily_write` RLS policies (manager-or-above) — a member is redirected
 * before any query runs, same as Command Center.
 */
export default async function RevenuePage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: profile }, { data: m }] = await Promise.all([
    sb.from('profiles').select('locale').eq('id', user.id).single(),
    sb.from('memberships').select('organization_id, role').eq('profile_id', user.id).eq('status', 'active').limit(1).single(),
  ]);
  if (!m) redirect('/no-organization');
  const role = m.role as Role;
  if (!can.viewRevenue(role)) redirect('/my-work');

  const { t, locale } = await getT(profile?.locale);

  const preset = (PRESETS as readonly string[]).includes(first(sp.period) ?? '') ? (first(sp.period) as RevenuePeriodPreset) : '30d';
  const asOf = new Date().toISOString().slice(0, 10);
  const data = await getRevenue(m.organization_id, preset, asOf);

  const openEntryId = first(sp.entry);
  const editingEntry = openEntryId ? data.entries.find(e => e.id === openEntryId) : undefined;
  const drawerOpen = first(sp.new) === '1' || !!editingEntry;

  const periodLabels: Record<RevenuePeriodPreset, string> = {
    today: t('common.today'), '7d': t('common.d7'), '30d': t('common.d30'),
    month: t('common.thisMonth'), quarter: t('common.quarter'), year: t('common.year'),
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1>{t('revenue.heading')}</h1>
          <p className="mt-1 text-sm text-ink-3">{t('revenue.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <PeriodSwitcher active={preset} labels={periodLabels} />
          <Link href="/revenue/import" className="btn-outline"><Upload className="h-4 w-4" />{t('revenue.importOrders')}</Link>
          <Link href="?new=1" scroll={false} className="btn-primary"><Plus className="h-4 w-4" />{t('revenue.addEntry')}</Link>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {data.kpis.map(k => (
          <KpiCard key={k.key} kpi={k} locale={locale} label={t(`kpi.${k.key}` as never)} targetLabel={t('common.target')}
            momLabel={t('revenue.vsPrevious')} noDataLabel={t('kpi.noCostData')} noDataDetail="" />
        ))}
      </div>

      <RevenueTable entries={data.entries} totals={data.totals} locale={locale}
        labels={{
          date: t('revenue.table.date'), channel: t('revenue.table.channel'), orders: t('revenue.table.orders'),
          gross: t('revenue.table.gross'), refunds: t('revenue.table.refunds'), fees: t('revenue.table.fees'),
          net: t('revenue.table.net'), aov: t('revenue.table.aov'), sessions: t('revenue.table.sessions'),
          empty: t('revenue.empty'), totalRow: t('revenue.totalRow'),
        }} />

      {drawerOpen && (
        <RevenueEntryDrawer channels={data.channels} entry={editingEntry} defaultDate={resolvePeriod(preset, asOf).end}
          labels={{
            addEntry: t('revenue.addEntry'), editEntry: t('revenue.editEntry'), deleteEntry: t('revenue.deleteEntry'), deleteConfirm: t('revenue.deleteConfirm'),
            date: t('revenue.date'), channel: t('revenue.channel'), orders: t('revenue.orders'), grossRevenue: t('revenue.grossRevenue'),
            refunds: t('revenue.refunds'), platformFees: t('revenue.platformFees'), sessions: t('revenue.sessions'), notes: t('revenue.notes'),
            channelWebsite: t('revenue.channelWebsite'), channelShopee: t('revenue.channelShopee'), channelOther: t('revenue.channelOther'),
            replaceNote: t('revenue.replaceNote'), save: t('revenue.save'), saving: t('revenue.saving'), saveFailed: t('revenue.saveFailed'),
            deleteFailed: t('revenue.deleteFailed'), close: t('common.close'), cancel: t('common.cancel'),
          }} />
      )}
    </div>
  );
}
