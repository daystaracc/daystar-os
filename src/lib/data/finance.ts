import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { contributionMargin, type Contribution } from '@/lib/calculations/finance';
import { shiftDays } from '@/lib/calculations/pacing';

/**
 * Finance (spec §12). See the file-level note in lib/finance/constants.ts for the
 * permission picture. Two independent tables, two independent tabs on `/finance`:
 * `financial_monthly` (one row per month — the management P&L, run through the
 * already-tested `contributionMargin()`) and `expenses` (an append-only ad-hoc
 * ledger with a free-text `category` — the database puts no CHECK constraint on
 * it, unlike every enum this app has built against so far, so the form doesn't
 * invent a fixed list either; it's a plain text field with room to grow into
 * whatever categories Lucas actually uses).
 */

// ---------------------------------------------------------------------------
// Monthly management P&L — one row per month (`unique(organization_id, month)`),
// same "saving REPLACES this period's figures" idiom as Revenue/Marketing/CRM's
// monthly upserts.
// ---------------------------------------------------------------------------

export interface FinancialMonthlyRow {
  id: string; month: string;
  revenue: number; cogs: number; paymentFees: number; shipping: number; packaging: number; advertising: number; returns: number;
  operatingExpenses: number; cashBalance: number | null; inventoryValue: number | null; notes: string | null;
  contribution: Contribution;
}

export interface FinancialMonthlyPage { rows: FinancialMonthlyRow[]; error: boolean }

const FINANCIAL_MONTHLY_SELECT = 'id, month, revenue, cogs, payment_fees, shipping, packaging, advertising, returns, operating_expenses, cash_balance, inventory_value, notes';

export async function getFinancialMonthlyPage(orgId: string): Promise<FinancialMonthlyPage> {
  const sb = await createClient();
  const { data, error } = await sb.from('financial_monthly').select(FINANCIAL_MONTHLY_SELECT).eq('organization_id', orgId).order('month', { ascending: false });
  if (error) return { rows: [], error: true };

  const rows: FinancialMonthlyRow[] = (data ?? []).map(r => {
    const revenue = Number(r.revenue), cogs = Number(r.cogs), payment_fees = Number(r.payment_fees), shipping = Number(r.shipping),
      packaging = Number(r.packaging), advertising = Number(r.advertising), returns = Number(r.returns);
    return {
      id: r.id, month: r.month, revenue, cogs, paymentFees: payment_fees, shipping, packaging, advertising, returns,
      operatingExpenses: Number(r.operating_expenses), cashBalance: r.cash_balance !== null ? Number(r.cash_balance) : null,
      inventoryValue: r.inventory_value !== null ? Number(r.inventory_value) : null, notes: r.notes,
      contribution: contributionMargin({ revenue, cogs, payment_fees, shipping, packaging, advertising, returns }),
    };
  });
  return { rows, error: false };
}

// ---------------------------------------------------------------------------
// Expenses — an ad-hoc, append-in-spirit ledger (RLS does allow update/delete,
// so the drawer offers full edit like every other entity, not upsert-by-period).
// Shown over a rolling 90-day window, same shape as Marketing's ad spend log —
// this is a running ledger, not a full export, so it stays fast without a
// separate date-range picker.
// ---------------------------------------------------------------------------

export interface ExpenseRow { id: string; date: string; category: string; amount: number; vendor: string | null; note: string | null }
export interface ExpensesPage { rows: ExpenseRow[]; total: number; error: boolean }

const EXPENSE_SELECT = 'id, date, category, amount, vendor, note';
const EXPENSE_WINDOW_DAYS = 90;

export async function getExpensesPage(orgId: string, asOf = new Date().toISOString().slice(0, 10)): Promise<ExpensesPage> {
  const sb = await createClient();
  const since = shiftDays(asOf, -EXPENSE_WINDOW_DAYS);
  const { data, error } = await sb.from('expenses').select(EXPENSE_SELECT).eq('organization_id', orgId).gte('date', since).order('date', { ascending: false });
  if (error) return { rows: [], total: 0, error: true };

  const rows: ExpenseRow[] = (data ?? []).map(r => ({ id: r.id, date: r.date, category: r.category, amount: Number(r.amount), vendor: r.vendor, note: r.note }));
  return { rows, total: rows.reduce((a, r) => a + r.amount, 0), error: false };
}
