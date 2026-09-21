import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Plus, Truck, MessageCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import type { T } from '@/lib/i18n';
import type { Role } from '@/lib/permissions';
import { getOperationsDailyPage, getCsCasesPage, getOperationsOwnerOptions } from '@/lib/data/operations';
import { CS_CHANNEL, CS_ISSUE_TYPE, CS_STATUS, type CsChannel, type CsIssueType, type CsStatus } from '@/lib/operations/constants';
import { OperationsDailyDrawer } from '@/components/operations/OperationsDailyDrawer';
import { CsCaseDrawer } from '@/components/operations/CsCaseDrawer';

export const dynamic = 'force-dynamic';

type Search = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const TABS = ['daily', 'cs'] as const;
type Tab = (typeof TABS)[number];

type ChannelLabels = Record<CsChannel, string>;
type IssueTypeLabels = Record<CsIssueType, string>;
type StatusLabels = Record<CsStatus, string>;

const CS_STATUS_TONE: Record<CsStatus, string> = { open: 'pill-bad', waiting: 'pill-warn', resolved: 'pill-ok', closed: 'pill-neutral' };

/**
 * OPERATIONS — "Is fulfillment keeping up, and what's stuck in CS?" This screen
 * has been a nav entry (`lib/nav.ts`) and a schema (`operations_daily` +
 * `customer_service_cases`, migration 0001) since the app's first session, but no
 * route ever existed — clicking it 404'd. Built 2026-09-21. See the file-level
 * note in lib/operations/constants.ts for the RLS/tab-naming detail: the `cs` tab
 * key is load-bearing, not arbitrary — the Command Center's `cs_stale` attention
 * rule already links to `/operations?tab=cs`.
 *
 * Open to any active member (`*_select` RLS, generic loop) — no `can.view…` gate,
 * matching the nav item having no `roles` restriction. Creating/editing entries is
 * manager-or-above (`canManage` below, mirroring `*_insert`/`*_update` RLS);
 * deleting is founder-only, enforced in actions.ts.
 */
export default async function OperationsPage({ searchParams }: { searchParams: Promise<Search> }) {
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
  const canManage = role === 'founder' || role === 'manager';
  const { t } = await getT(profile?.locale);

  const tab: Tab = (TABS as readonly string[]).includes(first(sp.tab) ?? '') ? (first(sp.tab) as Tab) : 'daily';
  const newOpen = first(sp.new) === '1' && canManage;
  const entryId = first(sp.entry);
  const today = new Date().toISOString().slice(0, 10);

  const channelLabels = Object.fromEntries(CS_CHANNEL.map(c => [c, t(`operations.channel_.${c}`)])) as ChannelLabels;
  const issueTypeLabels = Object.fromEntries(CS_ISSUE_TYPE.map(i => [i, t(`operations.issueType_.${i}`)])) as IssueTypeLabels;
  const statusLabels = Object.fromEntries(CS_STATUS.map(s => [s, t(`operations.status_.${s}`)])) as StatusLabels;

  return (
    <div className="space-y-6 animate-fade-up">
      <header className="flex items-baseline justify-between">
        <h1>{t('operations.heading')}</h1>
        {canManage && tab === 'daily' && <Link href="?tab=daily&new=1" scroll={false} className="btn-primary"><Plus className="h-4 w-4" />{t('operations.newDay')}</Link>}
        {canManage && tab === 'cs' && <Link href="?tab=cs&new=1" scroll={false} className="btn-primary"><Plus className="h-4 w-4" />{t('operations.newCase')}</Link>}
      </header>

      <div className="flex flex-wrap gap-1.5">
        <TabPill href="?tab=daily" active={tab === 'daily'} icon={<Truck className="h-3.5 w-3.5" />} label={t('operations.tabDaily')} />
        <TabPill href="?tab=cs" active={tab === 'cs'} icon={<MessageCircle className="h-3.5 w-3.5" />} label={t('operations.tabCs')} />
      </div>

      {tab === 'daily' && <DailyTab orgId={m.organization_id} t={t} today={today} canManage={canManage} />}
      {tab === 'cs' && <CsTab orgId={m.organization_id} t={t} statusTone={CS_STATUS_TONE} channelLabels={channelLabels} issueTypeLabels={issueTypeLabels} statusLabels={statusLabels} canManage={canManage} />}

      {tab === 'daily' && (newOpen || (canManage && entryId)) && (
        <DailyEditor orgId={m.organization_id} entryId={newOpen ? undefined : entryId} today={today} t={t} />
      )}

      {tab === 'cs' && (newOpen || (canManage && entryId)) && (
        <CsEditor orgId={m.organization_id} entryId={newOpen ? undefined : entryId} t={t}
          channelLabels={channelLabels} issueTypeLabels={issueTypeLabels} statusLabels={statusLabels} />
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

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------

async function DailyTab({ orgId, t, today, canManage }: { orgId: string; t: T; today: string; canManage: boolean }) {
  const page = await getOperationsDailyPage(orgId, today);
  if (page.error) return <div className="card card-pad text-sm text-bad">{t('operations.loadFailed')}</div>;

  return (
    <div className="space-y-4">
      <div className="card card-pad grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label={t('operations.ordersWaiting')} value={page.today ? String(page.today.ordersWaiting) : '—'} />
        <Kpi label={t('operations.ordersShipped')} value={page.today ? String(page.today.ordersShipped) : '—'} />
        <Kpi label={t('operations.avgFulfillment')} value={page.window.avgFulfillmentMinutes === null ? '—' : `${Math.round(page.window.avgFulfillmentMinutes)} min`} />
        <Kpi label={t('operations.shippedWindow')} value={String(page.window.ordersShipped)} />
        <Kpi label={t('operations.errorsWindow')} value={String(page.window.errors)} />
        <Kpi label={t('operations.returnsWindow')} value={String(page.window.returns)} />
      </div>

      {!page.rows.length ? (
        <div className="card card-pad text-sm text-ink-3">{t('operations.dailyEmpty')}</div>
      ) : (
        <ul className="card divide-y divide-border">
          {page.rows.map(r => {
            const content = (
              <>
                <span className="w-24 shrink-0 text-sm tabular-nums text-ink-2">{r.date}</span>
                <span className="w-32 shrink-0 text-xs tabular-nums text-ink-3">{t('operations.ordersShipped')}: {r.ordersShipped}</span>
                <span className="min-w-0 flex-1" />
                <span className="w-20 shrink-0 text-right text-xs tabular-nums text-ink-3">{t('operations.errors')}: {r.errors}</span>
                <span className="w-20 shrink-0 text-right text-xs tabular-nums text-ink-3">{t('operations.returns')}: {r.returns}</span>
              </>
            );
            return (
              <li key={r.id}>
                {canManage ? (
                  <Link href={`?tab=daily&entry=${r.id}`} scroll={false} className="row-hover flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap sm:gap-4">{content}</Link>
                ) : (
                  <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap sm:gap-4">{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

async function CsTab({ orgId, t, statusTone, channelLabels, issueTypeLabels, statusLabels, canManage }: {
  orgId: string; t: T; statusTone: Record<CsStatus, string>;
  channelLabels: ChannelLabels; issueTypeLabels: IssueTypeLabels; statusLabels: StatusLabels; canManage: boolean;
}) {
  const page = await getCsCasesPage(orgId);
  if (page.error) return <div className="card card-pad text-sm text-bad">{t('operations.loadFailed')}</div>;

  return (
    <div className="space-y-4">
      <div className="card card-pad grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Kpi label={t('operations.openCases')} value={String(page.openCount)} />
        <Kpi label={t('operations.waitingCases')} value={String(page.waitingCount)} />
      </div>

      {!page.rows.length ? (
        <div className="card card-pad text-sm text-ink-3">{t('operations.casesEmpty')}</div>
      ) : (
        <ul className="card divide-y divide-border">
          {page.rows.map(c => {
            const content = (
              <>
                <span className={`pill ${statusTone[c.status]} w-20 shrink-0 justify-center`}>{statusLabels[c.status]}</span>
                <span className="min-w-0 flex-1 basis-full truncate text-sm font-medium sm:basis-auto">{c.customerName || c.orderRef || '—'}</span>
                <span className="pill pill-neutral w-20 shrink-0 justify-center">{channelLabels[c.channel]}</span>
                <span className="hidden w-32 shrink-0 truncate text-xs text-ink-3 sm:block">{issueTypeLabels[c.issueType]}</span>
                <span className="w-20 shrink-0 text-right text-xs tabular-nums text-ink-3">{c.createdAt.slice(0, 10)}</span>
              </>
            );
            return (
              <li key={c.id}>
                {canManage ? (
                  <Link href={`?tab=cs&entry=${c.id}`} scroll={false} className="row-hover flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap sm:gap-4">{content}</Link>
                ) : (
                  <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap sm:gap-4">{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Drawer loaders

async function DailyEditor({ orgId, entryId, today, t }: { orgId: string; entryId: string | undefined; today: string; t: T }) {
  const [page, owners] = await Promise.all([
    entryId ? getOperationsDailyPage(orgId, today) : null,
    getOperationsOwnerOptions(orgId),
  ]);
  const entry = page?.rows.find(r => r.id === entryId);

  return (
    <OperationsDailyDrawer entry={entry} defaultDate={today} owners={owners} onCloseHref="/operations?tab=daily"
      labels={{
        newDay: t('operations.newDay'), editDay: t('operations.editDay'), date: t('operations.date'),
        ordersWaiting: t('operations.ordersWaiting'), ordersShipped: t('operations.ordersShipped'), errors: t('operations.errors'),
        returns: t('operations.returns'), csPending: t('operations.csPending'),
        fulfillmentStartedAt: t('operations.fulfillmentStartedAt'), fulfillmentCompletedAt: t('operations.fulfillmentCompletedAt'),
        fulfillmentMinutes: t('operations.fulfillmentMinutes'), csAvgResponseMinutes: t('operations.csAvgResponseMinutes'),
        employee: t('operations.employee'), noEmployee: t('operations.noEmployee'), notes: t('operations.notes'),
        advanced: t('operations.advanced'), replaceNote: t('operations.replaceNote'),
        save: t('operations.save'), saving: t('operations.saving'), cancel: t('operations.cancel'), create: t('operations.create'),
        close: t('common.close'), saveFailed: t('operations.saveFailed'), deleteFailed: t('operations.deleteFailed'),
        deleteDayConfirm: t('operations.deleteDayConfirm'), deleteEntry: t('operations.deleteEntry'),
      }} />
  );
}

async function CsEditor({ orgId, entryId, t, channelLabels, issueTypeLabels, statusLabels }: {
  orgId: string; entryId: string | undefined; t: T;
  channelLabels: ChannelLabels; issueTypeLabels: IssueTypeLabels; statusLabels: StatusLabels;
}) {
  const page = await getCsCasesPage(orgId);
  const entry = entryId ? page.rows.find(r => r.id === entryId) : undefined;

  return (
    <CsCaseDrawer entry={entry} owners={page.owners} onCloseHref="/operations?tab=cs"
      labels={{
        newCase: t('operations.newCase'), editCase: t('operations.editCase'), customerName: t('operations.customerName'),
        orderRef: t('operations.orderRef'), channel: t('operations.channel'), issueType: t('operations.issueType'), status: t('operations.status'),
        owner: t('operations.owner'), noOwner: t('operations.noOwner'), resolution: t('operations.resolution'), notes: t('operations.notes'),
        advanced: t('operations.advanced'),
        save: t('operations.save'), saving: t('operations.saving'), cancel: t('operations.cancel'), create: t('operations.create'),
        close: t('common.close'), saveFailed: t('operations.saveFailed'), deleteFailed: t('operations.deleteFailed'),
        deleteCaseConfirm: t('operations.deleteCaseConfirm'), deleteCase: t('operations.deleteCase'),
        channelLabels, issueTypeLabels, statusLabels,
      }} />
  );
}
