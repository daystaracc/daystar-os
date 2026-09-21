import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Plus, Workflow, LineChart, Users, Search as SearchIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import type { T } from '@/lib/i18n';
import { can, type Role } from '@/lib/permissions';
import { getCrmFlowsPage, getMonthlyMetricsPage, getCustomersPage, CUSTOMER_LIST_PAGE_SIZE } from '@/lib/data/crm';
import { CRM_FLOW_CHANNEL, CRM_FLOW_STATUS, CRM_FLOW_KEY, type CrmFlowKey } from '@/lib/crm/constants';
import { CrmFlowDrawer } from '@/components/crm/CrmFlowDrawer';
import { MonthlyMetricDrawer } from '@/components/crm/MonthlyMetricDrawer';

export const dynamic = 'force-dynamic';

type Search = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const TABS = ['flows', 'metrics', 'customers'] as const;
type Tab = (typeof TABS)[number];

const FLOW_STATUS_TONE = { planned: 'pill-neutral', draft: 'pill-neutral', active: 'pill-ok', paused: 'pill-warn' } as const;

const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;
const pct = (n: number | null) => (n === null ? '—' : `${n.toFixed(1)}%`);

/**
 * CRM (spec §09) — "Are customers coming back?" Founder-only via `can.viewCRM`,
 * one notch stricter than Reviews/Marketing — see that permission's comment in
 * lib/permissions.ts and the file-level note in lib/data/crm.ts for the full RLS
 * picture and why `customers` is empty in this pass.
 */
export default async function CrmPage({ searchParams }: { searchParams: Promise<Search> }) {
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
  if (!can.viewCRM(role)) redirect('/my-work');
  const { t } = await getT(profile?.locale);

  const tab: Tab = (TABS as readonly string[]).includes(first(sp.tab) ?? '') ? (first(sp.tab) as Tab) : 'flows';
  const newOpen = first(sp.new) === '1';
  const entryId = first(sp.entry);
  const today = new Date().toISOString().slice(0, 10);

  const channelLabels = Object.fromEntries(CRM_FLOW_CHANNEL.map(c => [c, t(`crm.channel_.${c}`)])) as Record<(typeof CRM_FLOW_CHANNEL)[number], string>;
  const statusLabels = Object.fromEntries(CRM_FLOW_STATUS.map(s => [s, t(`crm.status_.${s}`)])) as Record<(typeof CRM_FLOW_STATUS)[number], string>;
  const keyLabels = Object.fromEntries(CRM_FLOW_KEY.map(k => [k, t(`crm.key_.${k}`)])) as Record<CrmFlowKey, string>;

  return (
    <div className="space-y-6 animate-fade-up">
      <header className="flex items-baseline justify-between">
        <h1>{t('crm.heading')}</h1>
        {tab === 'flows' && <Link href="?tab=flows&new=1" scroll={false} className="btn-primary"><Plus className="h-4 w-4" />{t('crm.newFlow')}</Link>}
        {tab === 'metrics' && <Link href="?tab=metrics&new=1" scroll={false} className="btn-primary"><Plus className="h-4 w-4" />{t('crm.newMonth')}</Link>}
      </header>

      <div className="flex flex-wrap gap-1.5">
        <TabPill href="?tab=flows" active={tab === 'flows'} icon={<Workflow className="h-3.5 w-3.5" />} label={t('crm.tabFlows')} />
        <TabPill href="?tab=metrics" active={tab === 'metrics'} icon={<LineChart className="h-3.5 w-3.5" />} label={t('crm.tabMetrics')} />
        <TabPill href="?tab=customers" active={tab === 'customers'} icon={<Users className="h-3.5 w-3.5" />} label={t('crm.tabCustomers')} />
      </div>

      {tab === 'flows' && <FlowsTab orgId={m.organization_id} t={t} channelLabels={channelLabels} statusLabels={statusLabels} keyLabels={keyLabels} />}
      {tab === 'metrics' && <MetricsTab orgId={m.organization_id} t={t} />}
      {tab === 'customers' && <CustomersTab orgId={m.organization_id} t={t} q={first(sp.q) ?? ''} page={Number(first(sp.page)) || 1} />}

      {tab === 'flows' && (newOpen || entryId) && (
        <FlowEditor orgId={m.organization_id} entryId={newOpen ? undefined : entryId} t={t} channelLabels={channelLabels} statusLabels={statusLabels} keyLabels={keyLabels} />
      )}

      {tab === 'metrics' && (newOpen || entryId) && (
        <MetricEditor orgId={m.organization_id} entryId={newOpen ? undefined : entryId} today={today} t={t} />
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

async function FlowsTab({ orgId, t, channelLabels, statusLabels, keyLabels }: {
  orgId: string; t: T; channelLabels: Record<string, string>; statusLabels: Record<string, string>; keyLabels: Record<CrmFlowKey, string>;
}) {
  const page = await getCrmFlowsPage(orgId);
  if (page.error) return <div className="card card-pad text-sm text-bad">{t('crm.loadFailed')}</div>;
  if (!page.flows.length) return <div className="card card-pad text-sm text-ink-3">{t('crm.flowsEmpty')}</div>;

  return (
    <ul className="card divide-y divide-border">
      {page.flows.map(f => (
        <li key={f.id}>
          <Link href={`?tab=flows&entry=${f.id}`} scroll={false} className="row-hover flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap sm:gap-4">
            <span className="w-32 shrink-0 truncate text-xs text-ink-3">{keyLabels[f.key]}</span>
            <span className="min-w-0 flex-1 basis-full truncate text-sm font-medium sm:basis-auto">{f.name}</span>
            <span className="pill pill-neutral w-16 shrink-0 justify-center">{channelLabels[f.channel]}</span>
            <span className={`pill ${FLOW_STATUS_TONE[f.status]} w-20 shrink-0 justify-center`}>{statusLabels[f.status]}</span>
            <span className="w-24 shrink-0 text-right text-xs tabular-nums text-ink-3">{fmt(f.revenue)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

async function MetricsTab({ orgId, t }: { orgId: string; t: T }) {
  const page = await getMonthlyMetricsPage(orgId);
  if (page.error) return <div className="card card-pad text-sm text-bad">{t('crm.loadFailed')}</div>;
  if (!page.rows.length) return <div className="card card-pad text-sm text-ink-3">{t('crm.metricsEmpty')}</div>;

  return (
    <ul className="card divide-y divide-border">
      {page.rows.map(r => (
        <li key={r.id}>
          <Link href={`?tab=metrics&entry=${r.id}`} scroll={false} className="row-hover flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap sm:gap-4">
            <span className="w-20 shrink-0 text-sm tabular-nums text-ink-2">{r.month.slice(0, 7)}</span>
            <span className="w-24 shrink-0 text-xs tabular-nums text-ink-3">{r.customers} {t('crm.customers').toLowerCase()}</span>
            <span className="w-28 shrink-0 text-xs tabular-nums text-ink-3">{r.newCustomers} {t('crm.newCustomers').toLowerCase()}</span>
            <span className="min-w-0 flex-1" />
            <span className="w-16 shrink-0 text-right text-xs tabular-nums">{pct(r.repeatRate)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

async function CustomersTab({ orgId, t, q, page: pageNum }: { orgId: string; t: T; q: string; page: number }) {
  const page = await getCustomersPage(orgId, { query: q, page: pageNum });
  if (page.error) return <div className="card card-pad text-sm text-bad">{t('crm.loadFailed')}</div>;

  const hrefFor = (p: number) => {
    const params = new URLSearchParams({ tab: 'customers' });
    if (q) params.set('q', q);
    if (p > 1) params.set('page', String(p));
    return `?${params.toString()}`;
  };
  const from = page.total === 0 ? 0 : (page.page - 1) * CUSTOMER_LIST_PAGE_SIZE + 1;
  const to = Math.min(page.total, page.page * CUSTOMER_LIST_PAGE_SIZE);

  return (
    <div className="space-y-3">
      <form action="/crm" className="flex items-center gap-2">
        <input type="hidden" name="tab" value="customers" />
        <div className="relative flex-1 max-w-sm">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-3" />
          <input type="text" name="q" maxLength={200} defaultValue={q} placeholder={t('crm.searchPlaceholder')}
            className="input w-full pl-8" />
        </div>
        {q && <Link href="?tab=customers" className="btn-ghost text-xs">{t('crm.clearSearch')}</Link>}
      </form>

      {!page.customers.length ? (
        <div className="card card-pad text-sm text-ink-3">{q ? t('crm.noSearchResults') : t('crm.customersEmpty')}</div>
      ) : (
        <>
          <ul className="card divide-y divide-border">
            {page.customers.map(c => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap sm:gap-4">
                <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                  <div className="truncate text-sm font-medium">{c.name ?? '—'}</div>
                  {(c.email || c.phone) && (
                    <div className="truncate text-xs text-ink-3">{[c.email, c.phone].filter(Boolean).join(' · ')}</div>
                  )}
                </div>
                <span className="w-20 shrink-0 text-right text-xs tabular-nums text-ink-3">{c.ordersCount} {t('crm.ordersCount').toLowerCase()}</span>
                <span className="w-24 shrink-0 text-right text-xs tabular-nums">{fmt(c.totalSpent)}</span>
                <span className="w-24 shrink-0 text-right text-xs tabular-nums text-ink-3">{c.lastOrderAt ?? '—'}</span>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between text-xs text-ink-3">
            <span>{t('crm.showingRange', { from: String(from), to: String(to), total: page.total.toLocaleString('en-US') })}</span>
            <div className="flex items-center gap-1">
              <Link href={hrefFor(page.page - 1)} aria-disabled={page.page <= 1}
                className={`btn-ghost !px-2 ${page.page <= 1 ? 'pointer-events-none opacity-40' : ''}`}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Link>
              <span className="tabular-nums">{page.page} / {page.pageCount}</span>
              <Link href={hrefFor(page.page + 1)} aria-disabled={page.page >= page.pageCount}
                className={`btn-ghost !px-2 ${page.page >= page.pageCount ? 'pointer-events-none opacity-40' : ''}`}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Drawer loaders

async function FlowEditor({ orgId, entryId, t, channelLabels, statusLabels, keyLabels }: {
  orgId: string; entryId: string | undefined; t: T; channelLabels: Record<string, string>; statusLabels: Record<string, string>; keyLabels: Record<CrmFlowKey, string>;
}) {
  const page = await getCrmFlowsPage(orgId);
  const flow = entryId ? page.flows.find(f => f.id === entryId) : undefined;

  return (
    <CrmFlowDrawer options={page.options} unusedKeys={page.unusedKeys} onCloseHref="/crm?tab=flows"
      flow={flow ? {
        id: flow.id, key: flow.key, name: flow.name, channel: flow.channel, status: flow.status, audience: flow.audience ?? '',
        ownerId: flow.owner?.id ?? '', notes: flow.notes ?? '', messagesCount: String(flow.messagesCount), sends: String(flow.sends),
        conversions: String(flow.conversions), revenue: String(flow.revenue),
      } : undefined}
      labels={{
        newFlow: t('crm.newFlow'), editFlow: t('crm.editFlow'), key: t('crm.key'), name: t('crm.name'), channel: t('crm.channel'),
        status: t('crm.status'), audience: t('crm.audience'), owner: t('crm.owner'), noOwner: t('crm.noOwner'), notes: t('crm.notes'),
        messagesCount: t('crm.messagesCount'), sends: t('crm.sends'), conversions: t('crm.conversions'), revenue: t('crm.revenue'),
        advanced: t('crm.advanced'), save: t('crm.save'), saving: t('crm.saving'), cancel: t('crm.cancel'), create: t('crm.create'),
        close: t('common.close'), saveFailed: t('crm.saveFailed'), deleteFailed: t('crm.deleteFailed'),
        deleteFlow: t('crm.deleteFlow'), deleteFlowConfirm: t('crm.deleteFlowConfirm'), allFlowsCreated: t('crm.allFlowsCreated'),
        channelLabels, statusLabels, keyLabels,
      }} />
  );
}

async function MetricEditor({ orgId, entryId, today, t }: { orgId: string; entryId: string | undefined; today: string; t: T }) {
  const page = entryId ? await getMonthlyMetricsPage(orgId) : null;
  const entry = page?.rows.find(r => r.id === entryId);

  return (
    <MonthlyMetricDrawer entry={entry} defaultMonth={`${today.slice(0, 7)}-01`} onCloseHref="/crm?tab=metrics"
      labels={{
        newMonth: t('crm.newMonth'), editMonth: t('crm.editMonth'), month: t('crm.month'), customers: t('crm.customers'),
        newCustomers: t('crm.newCustomers'), returningCustomers: t('crm.returningCustomers'), repeatRate: t('crm.repeatRate'),
        repeatRevenue: t('crm.repeatRevenue'), retentionRevenue: t('crm.retentionRevenue'), avgOrders: t('crm.avgOrders'), ltv: t('crm.ltv'),
        advanced: t('crm.advanced'), replaceNote: t('crm.replaceNote'),
        save: t('crm.save'), saving: t('crm.saving'), cancel: t('crm.cancel'), create: t('crm.create'),
        close: t('common.close'), saveFailed: t('crm.saveFailed'), deleteFailed: t('crm.deleteFailed'),
        deleteMonthConfirm: t('crm.deleteMonthConfirm'), deleteEntry: t('crm.deleteEntry'),
      }} />
  );
}
