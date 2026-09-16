import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import { can, type Role } from '@/lib/permissions';
import { getCreatorDetail, getCreatorOptions } from '@/lib/data/marketing';
import { deleteCreator } from '@/app/(app)/marketing/actions';
import { CREATOR_PLATFORM, CREATOR_STATUS } from '@/lib/marketing/constants';
import { CreatorDrawer } from '@/components/marketing/CreatorDrawer';
import { CreatorContentLog } from '@/components/marketing/CreatorContentLog';
import { EntityActions } from '@/components/marketing/EntityActions';

export const dynamic = 'force-dynamic';

type Search = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const STATUS_TONE = {
  prospect: 'pill-neutral', contacted: 'pill-neutral', agreed: 'pill-neutral', product_sent: 'pill-warn',
  content_pending: 'pill-warn', published: 'pill-ok', successful: 'pill-ok', inactive: 'pill-bad',
} as const;
const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;

/** Creator detail — same founder/manager gate as `/marketing` (`can.viewMarketing`); see that page's header comment for why. */
export default async function CreatorDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
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

  const creator = await getCreatorDetail(m.organization_id, id);
  if (!creator) notFound();

  const editOpen = first(sp.edit) === '1';
  const options = editOpen ? await getCreatorOptions(m.organization_id) : { owners: [] };
  const platformLabels = Object.fromEntries(CREATOR_PLATFORM.map(p => [p, t(`marketing.creatorPlatform_.${p}`)])) as Record<(typeof CREATOR_PLATFORM)[number], string>;
  const statusLabels = Object.fromEntries(CREATOR_STATUS.map(s => [s, t(`marketing.creatorStatus_.${s}`)])) as Record<(typeof CREATOR_STATUS)[number], string>;

  return (
    <div className="space-y-6 animate-fade-up">
      <Link href="/marketing?tab=creators" className="inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" />{t('marketing.backToMarketing')}</Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate">{creator.name}</h1>
            <span className="pill pill-neutral">{platformLabels[creator.platform]}</span>
            <span className={`pill ${STATUS_TONE[creator.status]}`}>{statusLabels[creator.status]}</span>
          </div>
          <p className="mt-1 text-xs text-ink-3">
            {creator.handle && <>{creator.handle} · </>}{creator.market}
            {creator.followers !== null && <> · {creator.followers.toLocaleString()} {t('marketing.followers').toLowerCase()}</>}
            {' · '}{creator.owner?.name ?? t('marketing.noOwner')}
          </p>
        </div>
        <EntityActions id={creator.id} canDelete={role === 'founder'} onDelete={deleteCreator} backHref="/marketing?tab=creators"
          labels={{ edit: t('common.edit'), delete: t('marketing.deleteCreator'), deleteConfirm: t('marketing.deleteCreatorConfirm'), deleteFailed: t('marketing.deleteFailed') }} />
      </header>

      <div className="card card-pad grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Kpi label={t('marketing.contentLog')} value={String(creator.contentCount)} />
        <Kpi label={t('marketing.sales')} value={fmt(creator.totalSales)} />
        {/* `cost` (the negotiated flat fee) and `totalCost` (summed from the content log below) are two different numbers — never substitute one for the other under one label. */}
        <Kpi label={t('marketing.cost')} value={creator.cost !== null ? fmt(creator.cost) : '—'} />
        <Kpi label={t('marketing.totalCost')} value={fmt(creator.totalCost)} />
      </div>

      {(creator.contact || creator.notes) && (
        <div className="card card-pad space-y-2 text-sm">
          {creator.contact && <p><span className="text-ink-3">{t('marketing.contact')}:</span> {creator.contact}</p>}
          {creator.notes && <p className="whitespace-pre-wrap"><span className="text-ink-3">{t('marketing.notes')}:</span> {creator.notes}</p>}
        </div>
      )}

      <CreatorContentLog creatorId={creator.id} content={creator.content}
        labels={{
          contentLog: t('marketing.contentLog'), contentEmpty: t('marketing.contentEmpty'), addContent: t('marketing.addContent'),
          productsSent: t('marketing.productsSent'), url: t('marketing.url'), publishedAt: t('marketing.publishedAt'),
          views: t('marketing.views'), clicks: t('marketing.clicks'), sales: t('marketing.sales'), cost: t('marketing.cost'), note: t('marketing.note'),
          add: t('marketing.add'), adding: t('marketing.adding'), cancel: t('marketing.cancel'), deleteMetric: t('marketing.deleteMetric'),
          deleteContentConfirm: t('marketing.deleteContentConfirm'), saveFailed: t('marketing.saveFailed'), deleteFailed: t('marketing.deleteFailed'),
        }} />

      {editOpen && (
        <CreatorDrawer options={options} onCloseHref={`/marketing/creators/${creator.id}`}
          creator={{
            id: creator.id, name: creator.name, handle: creator.handle ?? '', platform: creator.platform, status: creator.status,
            market: creator.market, followers: creator.followers !== null ? String(creator.followers) : '', category: creator.category ?? '',
            cost: creator.cost !== null ? String(creator.cost) : '', ownerId: creator.owner?.id ?? '', contact: creator.contact ?? '', notes: creator.notes ?? '',
          }}
          labels={{
            newCreator: t('marketing.newCreator'), editCreator: t('marketing.editCreator'), name: t('marketing.name'), handle: t('marketing.handle'),
            platform: t('marketing.platform'), status: t('marketing.status'), market: t('marketing.market'), followers: t('marketing.followers'),
            category: t('marketing.category'), cost: t('marketing.cost'), owner: t('common.owner'), noOwner: t('marketing.noOwner'),
            contact: t('marketing.contact'), notes: t('marketing.notes'), advanced: t('marketing.advanced'),
            save: t('marketing.save'), saving: t('marketing.saving'), cancel: t('marketing.cancel'), create: t('marketing.create'),
            close: t('common.close'), saveFailed: t('marketing.saveFailed'), platformLabels, statusLabels,
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
