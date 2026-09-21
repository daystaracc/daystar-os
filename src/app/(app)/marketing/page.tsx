import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Plus, Megaphone, TrendingUp, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import type { T } from '@/lib/i18n';
import { getT } from '@/lib/i18n/server';
import { can, type Role } from '@/lib/permissions';
import { getCampaignsPage, getAdSpendPage, getCreatorsPage, getCreatorOptions } from '@/lib/data/marketing';
import { CAMPAIGN_STATUS, AD_PLATFORM, CREATOR_PLATFORM, CREATOR_STATUS } from '@/lib/marketing/constants';
import { CampaignDrawer } from '@/components/marketing/CampaignDrawer';
import { AdSpendDrawer } from '@/components/marketing/AdSpendDrawer';
import { CreatorDrawer } from '@/components/marketing/CreatorDrawer';

export const dynamic = 'force-dynamic';

type Search = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const TABS = ['campaigns', 'ad-spend', 'creators'] as const;
type Tab = (typeof TABS)[number];

const CAMPAIGN_STATUS_TONE = { planning: 'pill-neutral', active: 'pill-ok', completed: 'pill-neutral', cancelled: 'pill-bad' } as const;
const CREATOR_STATUS_TONE = {
  prospect: 'pill-neutral', contacted: 'pill-neutral', agreed: 'pill-neutral', product_sent: 'pill-warn',
  content_pending: 'pill-warn', published: 'pill-ok', successful: 'pill-ok', inactive: 'pill-bad',
} as const;

const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;
const pct = (n: number | null) => (n === null ? '—' : `${n.toFixed(1)}%`);

/**
 * MARKETING (spec §08) — "Is paid / creator spend working?" Three sub-areas
 * (Campaigns / Ad spend / Creators) share this one screen via a `?tab=` switcher —
 * see the scope note in lib/data/marketing.ts for why. Gated to founder/manager via
 * `can.viewMarketing`, same reasoning as Revenue and Reviews.
 */
export default async function MarketingPage({ searchParams }: { searchParams: Promise<Search> }) {
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

  const tab: Tab = (TABS as readonly string[]).includes(first(sp.tab) ?? '') ? (first(sp.tab) as Tab) : 'campaigns';
  const newOpen = first(sp.new) === '1';
  const entryId = first(sp.entry);
  const today = new Date().toISOString().slice(0, 10);

  const campaignStatusLabels = Object.fromEntries(CAMPAIGN_STATUS.map(s => [s, t(`marketing.campaignStatus_.${s}`)])) as Record<(typeof CAMPAIGN_STATUS)[number], string>;
  const adPlatformLabels = Object.fromEntries(AD_PLATFORM.map(p => [p, t(`marketing.adPlatform_.${p}`)])) as Record<(typeof AD_PLATFORM)[number], string>;
  const creatorPlatformLabels = Object.fromEntries(CREATOR_PLATFORM.map(p => [p, t(`marketing.creatorPlatform_.${p}`)])) as Record<(typeof CREATOR_PLATFORM)[number], string>;
  const creatorStatusLabels = Object.fromEntries(CREATOR_STATUS.map(s => [s, t(`marketing.creatorStatus_.${s}`)])) as Record<(typeof CREATOR_STATUS)[number], string>;

  return (
    <div className="space-y-6 animate-fade-up">
      <header className="flex items-baseline justify-between">
        <h1>{t('marketing.heading')}</h1>
        {tab === 'campaigns' && <Link href="?tab=campaigns&new=1" scroll={false} className="btn-primary"><Plus className="h-4 w-4" />{t('marketing.newCampaign')}</Link>}
        {tab === 'ad-spend' && <Link href="?tab=ad-spend&new=1" scroll={false} className="btn-primary"><Plus className="h-4 w-4" />{t('marketing.newAdSpend')}</Link>}
        {tab === 'creators' && <Link href="?tab=creators&new=1" scroll={false} className="btn-primary"><Plus className="h-4 w-4" />{t('marketing.newCreator')}</Link>}
      </header>

      <div className="flex flex-wrap gap-1.5">
        <TabPill href="?tab=campaigns" active={tab === 'campaigns'} icon={<Megaphone className="h-3.5 w-3.5" />} label={t('marketing.tabCampaigns')} />
        <TabPill href="?tab=ad-spend" active={tab === 'ad-spend'} icon={<TrendingUp className="h-3.5 w-3.5" />} label={t('marketing.tabAdSpend')} />
        <TabPill href="?tab=creators" active={tab === 'creators'} icon={<Users className="h-3.5 w-3.5" />} label={t('marketing.tabCreators')} />
      </div>

      {tab === 'campaigns' && <CampaignsTab orgId={m.organization_id} t={t} statusLabels={campaignStatusLabels} />}
      {tab === 'ad-spend' && <AdSpendTab orgId={m.organization_id} t={t} platformLabels={adPlatformLabels} today={today} />}
      {tab === 'creators' && <CreatorsTab orgId={m.organization_id} t={t} platformLabels={creatorPlatformLabels} statusLabels={creatorStatusLabels} />}

      {tab === 'campaigns' && newOpen && (
        <CampaignDrawer onCloseHref="/marketing?tab=campaigns"
          labels={{
            newCampaign: t('marketing.newCampaign'), editCampaign: t('marketing.editCampaign'), name: t('marketing.name'),
            objective: t('marketing.objective'), status: t('marketing.status'), startDate: t('marketing.startDate'), endDate: t('marketing.endDate'),
            budget: t('marketing.budget'), offer: t('marketing.offer'), notes: t('marketing.notes'), advanced: t('marketing.advanced'),
            save: t('marketing.save'), saving: t('marketing.saving'), cancel: t('marketing.cancel'), create: t('marketing.create'),
            close: t('common.close'), saveFailed: t('marketing.saveFailed'), statusLabels: campaignStatusLabels,
          }} />
      )}

      {tab === 'ad-spend' && (newOpen || entryId) && (
        <AdSpendEditor orgId={m.organization_id} entryId={entryId} today={today} t={t} platformLabels={adPlatformLabels} />
      )}

      {tab === 'creators' && newOpen && (
        <CreatorDrawerLoaded orgId={m.organization_id} t={t} platformLabels={creatorPlatformLabels} statusLabels={creatorStatusLabels} />
      )}
    </div>
  );
}

function TabPill({ href, active, icon, label }: { href: string; active: boolean; icon: React.ReactNode; label: string }) {
  return (
    <Link href={href} scroll={false} className={`pill inline-flex items-center gap-1.5 ${active ? 'pill-ok' : 'pill-neutral'}`}>
      {icon}{label}
    </Link>
  );
}

// ---------------------------------------------------------------------------

async function CampaignsTab({ orgId, t, statusLabels }: { orgId: string; t: T; statusLabels: Record<string, string> }) {
  const page = await getCampaignsPage(orgId);

  if (page.error) return <div className="card card-pad text-sm text-bad">{t('marketing.loadFailed')}</div>;
  if (!page.campaigns.length) return <div className="card card-pad text-sm text-ink-3">{t('marketing.campaignsEmpty')}</div>;

  return (
    <ul className="card divide-y divide-border">
      {page.campaigns.map(c => (
        <li key={c.id}>
          <Link href={`/marketing/campaigns/${c.id}`} className="row-hover flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap sm:gap-4">
            <span className="min-w-0 flex-1 basis-full truncate text-sm font-medium sm:basis-auto">{c.name}</span>
            <span className={`pill ${CAMPAIGN_STATUS_TONE[c.status]} w-24 shrink-0 justify-center`}>{statusLabels[c.status]}</span>
            <span className="w-28 shrink-0 text-right text-xs tabular-nums text-ink-3">{fmt(c.revenue)}</span>
            <span className="w-24 shrink-0 text-right text-xs tabular-nums text-ink-3">{fmt(c.spend)}</span>
            <span className="w-16 shrink-0 text-right text-xs tabular-nums">{c.roas === null ? '—' : `${c.roas.toFixed(1)}x`}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

async function AdSpendTab({ orgId, t, platformLabels, today }: {
  orgId: string; t: T; platformLabels: Record<string, string>; today: string;
}) {
  const page = await getAdSpendPage(orgId, today);

  if (page.error) return <div className="card card-pad text-sm text-bad">{t('marketing.loadFailed')}</div>;

  return (
    <div className="space-y-4">
      <div className="card card-pad grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
        <Kpi label={t('marketing.spend')} value={fmt(page.totals.spend)} />
        <Kpi label={t('marketing.revenue')} value={fmt(page.totals.revenue)} />
        <Kpi label={t('marketing.roas')} value={page.metrics.roas === null ? '—' : `${page.metrics.roas.toFixed(1)}x`} />
        <Kpi label={t('marketing.cac')} value={page.metrics.cac === null ? '—' : fmt(page.metrics.cac)} />
        <Kpi label={t('marketing.cpm')} value={page.metrics.cpm === null ? '—' : fmt(page.metrics.cpm)} />
        <Kpi label={t('marketing.ctr')} value={pct(page.metrics.ctr)} />
        <Kpi label={t('marketing.cvr')} value={pct(page.metrics.cvr)} />
        <Kpi label={t('marketing.mer')} value={page.metrics.mer === null ? '—' : `${page.metrics.mer.toFixed(1)}x`} />
      </div>
      {page.metrics.mer === null && <p className="text-xs text-ink-3">{t('marketing.merNote')}</p>}

      {!page.rows.length ? (
        <div className="card card-pad text-sm text-ink-3">{t('marketing.adSpendEmpty')}</div>
      ) : (
        <ul className="card divide-y divide-border">
          {page.rows.map(r => (
            <li key={r.id}>
              <Link href={`?tab=ad-spend&entry=${r.id}`} scroll={false} className="row-hover flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap sm:gap-4">
                <span className="w-24 shrink-0 text-sm tabular-nums text-ink-2">{r.date}</span>
                <span className="pill pill-neutral w-20 shrink-0 justify-center">{platformLabels[r.platform]}</span>
                <span className="min-w-0 flex-1" />
                <span className="w-24 shrink-0 text-right text-xs tabular-nums text-ink-3">{fmt(r.spend)}</span>
                <span className="w-24 shrink-0 text-right text-xs tabular-nums text-ink-3">{fmt(r.revenue)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

async function CreatorsTab({ orgId, t, platformLabels, statusLabels }: {
  orgId: string; t: T; platformLabels: Record<string, string>; statusLabels: Record<string, string>;
}) {
  const page = await getCreatorsPage(orgId);

  if (page.error) return <div className="card card-pad text-sm text-bad">{t('marketing.loadFailed')}</div>;
  if (!page.creators.length) return <div className="card card-pad text-sm text-ink-3">{t('marketing.creatorsEmpty')}</div>;

  return (
    <ul className="card divide-y divide-border">
      {page.creators.map(c => (
        <li key={c.id}>
          <Link href={`/marketing/creators/${c.id}`} className="row-hover flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap sm:gap-4">
            <span className="min-w-0 flex-1 basis-full truncate text-sm font-medium sm:basis-auto">{c.name}</span>
            <span className="pill pill-neutral w-20 shrink-0 justify-center">{platformLabels[c.platform]}</span>
            <span className={`pill ${CREATOR_STATUS_TONE[c.status]} w-28 shrink-0 justify-center`}>{statusLabels[c.status]}</span>
            <span className="w-24 shrink-0 text-right text-xs tabular-nums text-ink-3">{fmt(c.totalSales)}</span>
          </Link>
        </li>
      ))}
    </ul>
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

// ---------------------------------------------------------------------------
// Drawer loaders — fetch the one row being edited (ad spend) or the creator owner
// options, kept separate from the tabs above so the tabs' own queries stay simple.

async function AdSpendEditor({ orgId, entryId, today, t, platformLabels }: {
  orgId: string; entryId: string | undefined; today: string; t: T; platformLabels: Record<string, string>;
}) {
  const page = entryId ? await getAdSpendPage(orgId, today) : null;
  const entry = page?.rows.find(r => r.id === entryId);

  return (
    <AdSpendDrawer entry={entry} defaultDate={today} onCloseHref="/marketing?tab=ad-spend"
      labels={{
        newAdSpend: t('marketing.newAdSpend'), editAdSpend: t('marketing.editAdSpend'), date: t('marketing.date'), platform: t('marketing.platform'),
        spend: t('marketing.spend'), revenue: t('marketing.revenue'), impressions: t('marketing.impressions'), clicks: t('marketing.clicks'),
        purchases: t('marketing.purchases'), advanced: t('marketing.advanced'), replaceNote: t('marketing.replaceNote'),
        save: t('marketing.save'), saving: t('marketing.saving'), cancel: t('marketing.cancel'), create: t('marketing.create'),
        close: t('common.close'), saveFailed: t('marketing.saveFailed'), deleteFailed: t('marketing.deleteFailed'),
        deleteAdSpendConfirm: t('marketing.deleteAdSpendConfirm'), deleteEntry: t('marketing.deleteEntry'), platformLabels,
      }} />
  );
}

async function CreatorDrawerLoaded({ orgId, t, platformLabels, statusLabels }: {
  orgId: string; t: T; platformLabels: Record<string, string>; statusLabels: Record<string, string>;
}) {
  const options = await getCreatorOptions(orgId);

  return (
    <CreatorDrawer options={options} onCloseHref="/marketing?tab=creators"
      labels={{
        newCreator: t('marketing.newCreator'), editCreator: t('marketing.editCreator'), name: t('marketing.name'), handle: t('marketing.handle'),
        platform: t('marketing.platform'), status: t('marketing.status'), market: t('marketing.market'), followers: t('marketing.followers'),
        category: t('marketing.category'), cost: t('marketing.cost'), owner: t('common.owner'), noOwner: t('marketing.noOwner'),
        contact: t('marketing.contact'), notes: t('marketing.notes'), advanced: t('marketing.advanced'),
        save: t('marketing.save'), saving: t('marketing.saving'), cancel: t('marketing.cancel'), create: t('marketing.create'),
        close: t('common.close'), saveFailed: t('marketing.saveFailed'), platformLabels, statusLabels,
      }} />
  );
}
