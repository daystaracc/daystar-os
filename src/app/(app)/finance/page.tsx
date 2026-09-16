import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Plus, Wallet, Receipt } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import type { T } from '@/lib/i18n';
import { can, type Role } from '@/lib/permissions';
import { getFinancialMonthlyPage, getExpensesPage } from '@/lib/data/finance';
import { FinancialMonthlyDrawer } from '@/components/finance/FinancialMonthlyDrawer';
import { ExpenseDrawer } from '@/components/finance/ExpenseDrawer';

export const dynamic = 'force-dynamic';

type Search = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const TABS = ['monthly', 'expenses'] as const;
type Tab = (typeof TABS)[number];

const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;
const pct = (n: number | null) => (n === null ? '—' : `${n.toFixed(1)}%`);

/**
 * Finance (spec §12) — "Are we making money, where is cash?" Founder-only via
 * `can.viewFinance`, which already existed from an earlier session and already
 * matches `financial_monthly`/`expenses` RLS exactly — see the file-level note in
 * lib/finance/constants.ts for why this screen needed no new permission, unlike
 * Reviews/Marketing/CRM.
 */
export default async function FinancePage({ searchParams }: { searchParams: Promise<Search> }) {
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
  if (!can.viewFinance(role)) redirect('/my-work');
  const { t } = await getT(profile?.locale);

  const tab: Tab = (TABS as readonly string[]).includes(first(sp.tab) ?? '') ? (first(sp.tab) as Tab) : 'monthly';
  const newOpen = first(sp.new) === '1';
  const entryId = first(sp.entry);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6 animate-fade-up">
      <header className="flex items-baseline justify-between">
        <h1>{t('finance.heading')}</h1>
        {tab === 'monthly' && <Link href="?tab=monthly&new=1" scroll={false} className="btn-primary"><Plus className="h-4 w-4" />{t('finance.newMonth')}</Link>}
        {tab === 'expenses' && <Link href="?tab=expenses&new=1" scroll={false} className="btn-primary"><Plus className="h-4 w-4" />{t('finance.newExpense')}</Link>}
      </header>

      <div className="flex flex-wrap gap-1.5">
        <TabPill href="?tab=monthly" active={tab === 'monthly'} icon={<Wallet className="h-3.5 w-3.5" />} label={t('finance.tabMonthly')} />
        <TabPill href="?tab=expenses" active={tab === 'expenses'} icon={<Receipt className="h-3.5 w-3.5" />} label={t('finance.tabExpenses')} />
      </div>

      {tab === 'monthly' && <MonthlyTab orgId={m.organization_id} t={t} />}
      {tab === 'expenses' && <ExpensesTab orgId={m.organization_id} t={t} />}

      {tab === 'monthly' && (newOpen || entryId) && (
        <MonthlyEditor orgId={m.organization_id} entryId={newOpen ? undefined : entryId} today={today} t={t} />
      )}

      {tab === 'expenses' && (newOpen || entryId) && (
        <ExpenseEditor orgId={m.organization_id} entryId={newOpen ? undefined : entryId} today={today} t={t} />
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

async function MonthlyTab({ orgId, t }: { orgId: string; t: T }) {
  const page = await getFinancialMonthlyPage(orgId);
  if (page.error) return <div className="card card-pad text-sm text-bad">{t('finance.loadFailed')}</div>;
  if (!page.rows.length) return <div className="card card-pad text-sm text-ink-3">{t('finance.monthlyEmpty')}</div>;

  return (
    <ul className="card divide-y divide-border">
      {page.rows.map(r => (
        <li key={r.id}>
          <Link href={`?tab=monthly&entry=${r.id}`} scroll={false} className="row-hover flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap sm:gap-4">
            <span className="w-20 shrink-0 text-sm tabular-nums text-ink-2">{r.month.slice(0, 7)}</span>
            <span className="w-28 shrink-0 text-xs tabular-nums text-ink-3">{fmt(r.revenue)} {t('finance.revenue').toLowerCase()}</span>
            <span className="w-24 shrink-0 text-xs tabular-nums text-ink-3">{pct(r.contribution.grossMarginPct)} {t('finance.gm')}</span>
            <span className="min-w-0 flex-1" />
            <span className="w-28 shrink-0 text-right text-xs tabular-nums">{fmt(r.contribution.contributionProfit)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

async function ExpensesTab({ orgId, t }: { orgId: string; t: T }) {
  const page = await getExpensesPage(orgId);
  if (page.error) return <div className="card card-pad text-sm text-bad">{t('finance.loadFailed')}</div>;
  if (!page.rows.length) return <div className="card card-pad text-sm text-ink-3">{t('finance.expensesEmpty')}</div>;

  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-3">{t('finance.windowTotal', { amount: fmt(page.total) })}</p>
      <ul className="card divide-y divide-border">
        {page.rows.map(r => (
          <li key={r.id}>
            <Link href={`?tab=expenses&entry=${r.id}`} scroll={false} className="row-hover flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap sm:gap-4">
              <span className="w-24 shrink-0 text-sm tabular-nums text-ink-2">{r.date}</span>
              <span className="min-w-0 flex-1 basis-full truncate text-sm font-medium sm:basis-auto">{r.category}</span>
              <span className="w-32 shrink-0 truncate text-xs text-ink-3">{r.vendor ?? '—'}</span>
              <span className="w-24 shrink-0 text-right text-xs tabular-nums">{fmt(r.amount)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Drawer loaders

async function MonthlyEditor({ orgId, entryId, today, t }: { orgId: string; entryId: string | undefined; today: string; t: T }) {
  const page = entryId ? await getFinancialMonthlyPage(orgId) : null;
  const entry = page?.rows.find(r => r.id === entryId);

  return (
    <FinancialMonthlyDrawer entry={entry} defaultMonth={`${today.slice(0, 7)}-01`} onCloseHref="/finance?tab=monthly"
      labels={{
        newMonth: t('finance.newMonth'), editMonth: t('finance.editMonth'), month: t('finance.month'), revenue: t('finance.revenue'),
        cogs: t('finance.cogs'), cashBalance: t('finance.cashBalance'), inventoryValue: t('finance.inventoryValue'),
        paymentFees: t('finance.paymentFees'), shipping: t('finance.shipping'), packaging: t('finance.packaging'),
        advertising: t('finance.advertising'), returns: t('finance.returns'), operatingExpenses: t('finance.operatingExpenses'),
        notes: t('finance.notes'), advanced: t('finance.advanced'), replaceNote: t('finance.replaceNote'),
        save: t('finance.save'), saving: t('finance.saving'), cancel: t('finance.cancel'), create: t('finance.create'),
        close: t('common.close'), saveFailed: t('finance.saveFailed'), deleteFailed: t('finance.deleteFailed'),
        deleteMonthConfirm: t('finance.deleteMonthConfirm'), deleteEntry: t('finance.deleteEntry'),
      }} />
  );
}

async function ExpenseEditor({ orgId, entryId, today, t }: { orgId: string; entryId: string | undefined; today: string; t: T }) {
  const page = entryId ? await getExpensesPage(orgId) : null;
  const entry = page?.rows.find(r => r.id === entryId);

  return (
    <ExpenseDrawer entry={entry} defaultDate={today} onCloseHref="/finance?tab=expenses"
      labels={{
        newExpense: t('finance.newExpense'), editExpense: t('finance.editExpense'), date: t('finance.date'), category: t('finance.category'),
        amount: t('finance.amount'), vendor: t('finance.vendor'), note: t('finance.note'),
        save: t('finance.save'), saving: t('finance.saving'), cancel: t('finance.cancel'), create: t('finance.create'),
        close: t('common.close'), saveFailed: t('finance.saveFailed'), deleteFailed: t('finance.deleteFailed'),
        deleteExpense: t('finance.deleteExpense'), deleteExpenseConfirm: t('finance.deleteExpenseConfirm'),
      }} />
  );
}
