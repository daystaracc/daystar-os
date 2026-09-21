import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import { can, type Role } from '@/lib/permissions';
import { getCampaignDetail } from '@/lib/data/marketing';
import { deleteCampaign } from '@/app/(app)/marketing/actions';
import { CAMPAIGN_STATUS } from '@/lib/marketing/constants';
import { CONTENT_STATUS } from '@/lib/content/constants';
import { CampaignDrawer } from '@/components/marketing/CampaignDrawer';
import { CampaignMetrics } from '@/components/marketing/CampaignMetrics';
import { EntityActions } from '@/components/marketing/EntityActions';

export const dynamic = 'force-dynamic';

type Search = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const STATUS_TONE = { planning: 'pill-neutral', active: 'pill-ok', completed: 'pill-neutral', cancelled: 'pill-bad' } as const;
const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;

/** Campaign detail — same founder/manager gate as `/marketing` (`can.viewMarketing`); see that page's header comment for why. */
export default async function CampaignDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
  const { id } = await params;
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
  if (!can.viewMarketing(role)) redirect('/my-work');
  const { t } = await getT(profile?.locale);

  const campaign = await getCampaignDetail(m.organization_id, id);
  if (!campaign) notFound();

  const editOpen = first(sp.edit) === '1';
  const statusLabels = Object.fromEntries(CAMPAIGN_STATUS.map(s => [s, t(`marketing.campaignStatus_.${s}`)])) as Record<(typeof CAMPAIGN_STATUS)[number], string>;
  const contentStatusLabels = Object.fromEntries(CONTENT_STATUS.map(s => [s, t(`content.status_.${s}`)])) as Record<(typeof CONTENT_STATUS)[number], string>;

  return (
    <div className="space-y-6 animate-fade-up">
      <Link href="/marketing?tab=campaigns" className="inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" />{t('marketing.backToMarketing')}</Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate">{campaign.name}</h1>
            <span className={`pill ${STATUS_TONE[campaign.status]}`}>{statusLabels[campaign.status]}</span>
          </div>
          <p className="mt-1 text-xs text-ink-3">
            {campaign.startDate ?? '—'} – {campaign.endDate ?? '—'}
            {campaign.objective && <> · {campaign.objective}</>}
          </p>
        </div>
        <EntityActions id={campaign.id} canDelete={role === 'founder'} onDelete={deleteCampaign} backHref="/marketing?tab=campaigns"
          labels={{ edit: t('common.edit'), delete: t('marketing.deleteCampaign'), deleteConfirm: t('marketing.deleteCampaignConfirm'), deleteFailed: t('marketing.deleteFailed') }} />
      </header>

      <div className="card card-pad grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Kpi label={t('marketing.revenue')} value={fmt(campaign.revenue)} />
        <Kpi label={t('marketing.orders')} value={String(campaign.orders)} />
        <Kpi label={t('marketing.spend')} value={fmt(campaign.spend)} />
        <Kpi label={t('marketing.roas')} value={campaign.roas === null ? '—' : `${campaign.roas.toFixed(1)}x`} />
      </div>

      {(campaign.budget !== null || campaign.offer || campaign.notes) && (
        <div className="card card-pad space-y-2 text-sm">
          {campaign.budget !== null && <p><span className="text-ink-3">{t('marketing.budget')}:</span> {fmt(campaign.budget)}</p>}
          {campaign.offer && <p><span className="text-ink-3">{t('marketing.offer')}:</span> {campaign.offer}</p>}
          {campaign.notes && <p className="whitespace-pre-wrap"><span className="text-ink-3">{t('marketing.notes')}:</span> {campaign.notes}</p>}
        </div>
      )}

      <CampaignMetrics campaignId={campaign.id} metrics={campaign.metrics}
        labels={{
          campaignMetrics: t('marketing.campaignMetrics'), metricsEmpty: t('marketing.metricsEmpty'), addDay: t('marketing.addDay'),
          date: t('marketing.date'), revenue: t('marketing.revenue'), orders: t('marketing.orders'), spend: t('marketing.spend'),
          add: t('marketing.add'), adding: t('marketing.adding'), cancel: t('marketing.cancel'),
          deleteMetric: t('marketing.deleteMetric'), deleteMetricConfirm: t('marketing.deleteMetricConfirm'),
          saveFailed: t('marketing.saveFailed'), deleteFailed: t('marketing.deleteFailed'),
        }} />

      <div className="card card-pad space-y-2">
        <div className="label">{t('marketing.linkedContent')}</div>
        {!campaign.content.length ? (
          <p className="text-sm text-ink-3">{t('marketing.linkedContentEmpty')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {campaign.content.map(item => (
              <li key={item.id}>
                <Link href={`/content?edit=${item.id}`} className="row-hover flex items-center gap-3 px-1 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm">{item.title}</span>
                  <span className="pill pill-neutral shrink-0">{contentStatusLabels[item.status]}</span>
                  <span className="w-20 shrink-0 text-right text-xs tabular-nums text-ink-3">{item.publishDate ?? '—'}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {editOpen && (
        <CampaignDrawer onCloseHref={`/marketing/campaigns/${campaign.id}`}
          campaign={{
            id: campaign.id, name: campaign.name, objective: campaign.objective ?? '', status: campaign.status,
            startDate: campaign.startDate ?? '', endDate: campaign.endDate ?? '',
            budget: campaign.budget !== null ? String(campaign.budget) : '', offer: campaign.offer ?? '', notes: campaign.notes ?? '',
          }}
          labels={{
            newCampaign: t('marketing.newCampaign'), editCampaign: t('marketing.editCampaign'), name: t('marketing.name'),
            objective: t('marketing.objective'), status: t('marketing.status'), startDate: t('marketing.startDate'), endDate: t('marketing.endDate'),
            budget: t('marketing.budget'), offer: t('marketing.offer'), notes: t('marketing.notes'), advanced: t('marketing.advanced'),
            save: t('marketing.save'), saving: t('marketing.saving'), cancel: t('marketing.cancel'), create: t('marketing.create'),
            close: t('common.close'), saveFailed: t('marketing.saveFailed'), statusLabels,
          }} />
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
