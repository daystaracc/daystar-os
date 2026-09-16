import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import { can, type Role } from '@/lib/permissions';
import { RevenueImportWizard } from './RevenueImportWizard';

export const dynamic = 'force-dynamic';

/**
 * Order-export import (Showmore 訂單管理 → 匯出) into `sales_daily`.
 *
 * Members are redirected: `sales_daily_write` RLS refuses their writes anyway, so
 * offering the screen would only produce a failure at the end of a long form — same
 * reasoning as `settings/import/page.tsx`.
 */
export default async function RevenueImportPage() {
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

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">{t('revenue.import.title')}</h1>
        <p className="mt-1 text-sm text-ink-2">{t('revenue.import.subtitle')}</p>
      </header>

      <RevenueImportWizard locale={locale} labels={{
        title: t('revenue.import.title'), subtitle: t('revenue.import.subtitle'),
        choose: t('revenue.import.choose'), chooseHint: t('revenue.import.chooseHint'),
        previewTitle: t('revenue.import.previewTitle'), dateRange: t('revenue.import.dateRange'),
        orders: t('revenue.import.orders'), gross: t('revenue.import.gross'), refunds: t('revenue.import.refunds'),
        days: t('revenue.import.days'),
        channelWebsite: t('revenue.channelWebsite'), channelShopee: t('revenue.channelShopee'), channelOther: t('revenue.channelOther'),
        excluded: t('revenue.import.excluded'), warnings: t('revenue.import.warnings'), replaceNote: t('revenue.import.replaceNote'),
        confirm: t('revenue.import.confirm'), importing: t('revenue.import.importing'), cancel: t('revenue.import.cancel'),
        doneTitle: t('revenue.import.doneTitle'), created: t('revenue.import.created'), updated: t('revenue.import.updated'),
        unchanged: t('revenue.import.unchanged'), nothing: t('revenue.import.nothing'), failed: t('revenue.import.failed'),
        backToRevenue: t('revenue.import.backToRevenue'),
        customersTitle: t('revenue.import.customersTitle'), customersFound: t('revenue.import.customersFound'),
        customersRepeat: t('revenue.import.customersRepeat'), customersReplaceNote: t('revenue.import.customersReplaceNote'),
        customersDone: t('revenue.import.customersDone'), customersFailed: t('revenue.import.customersFailed'),
      }} />
    </div>
  );
}
