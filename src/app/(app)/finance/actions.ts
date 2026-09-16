'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/lib/finance/constants';

const ok = <T,>(data: T): ActionResult<T> => ({ ok: true, data });
const fail = (error: 'forbidden' | 'invalid' | 'failed'): ActionResult<never> => ({ ok: false, error });

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const emptyToNull = <T extends z.ZodTypeAny>(s: T) =>
  z.preprocess(v => (v === '' || v === undefined ? null : v), s.nullable());

/**
 * Bakes founder-only directly into `ctx()`, same as CRM's actions.ts — the whole
 * `/finance` screen is gated by `can.viewFinance` (already founder-only from an
 * earlier session), and `financial_monthly`/`expenses` RLS is founder-only for
 * every operation too, so app gate and RLS agree here without any deliberate
 * tightening (unlike Reviews/Marketing/CRM).
 */
async function ctx() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data: m } = await sb.from('memberships').select('organization_id, role').eq('profile_id', user.id).eq('status', 'active').limit(1).single();
  if (!m) return null;
  if (m.role !== 'founder') return null;
  return { sb, user, orgId: m.organization_id };
}

function refresh() {
  revalidatePath('/finance');
}

// ---------------------------------------------------------------------------
// Monthly management P&L — one row per month, saving REPLACES it (upsert on
// `unique(organization_id, month)`), same idiom as `upsertRevenue`/`upsertAdSpend`/
// CRM's `upsertMonthlyMetric`.
// ---------------------------------------------------------------------------

const financialMonthlySchema = z.object({
  month: isoDate,
  revenue: z.coerce.number().min(0).max(1_000_000_000).default(0),
  cogs: z.coerce.number().min(0).max(1_000_000_000).default(0),
  paymentFees: z.coerce.number().min(0).max(1_000_000_000).default(0),
  shipping: z.coerce.number().min(0).max(1_000_000_000).default(0),
  packaging: z.coerce.number().min(0).max(1_000_000_000).default(0),
  advertising: z.coerce.number().min(0).max(1_000_000_000).default(0),
  returns: z.coerce.number().min(0).max(1_000_000_000).default(0),
  operatingExpenses: z.coerce.number().min(0).max(1_000_000_000).default(0),
  cashBalance: emptyToNull(z.coerce.number().min(-1_000_000_000).max(1_000_000_000)),
  inventoryValue: emptyToNull(z.coerce.number().min(0).max(1_000_000_000)),
  notes: emptyToNull(z.string().max(2000)),
});

export async function upsertFinancialMonthly(raw: unknown): Promise<ActionResult<string>> {
  const parsed = financialMonthlySchema.safeParse(raw);
  if (!parsed.success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');

  const { paymentFees, operatingExpenses, cashBalance, inventoryValue, ...rest } = parsed.data;
  const { data, error } = await c.sb.from('financial_monthly')
    .upsert({
      ...rest, organization_id: c.orgId, created_by: c.user.id,
      payment_fees: paymentFees, operating_expenses: operatingExpenses, cash_balance: cashBalance, inventory_value: inventoryValue,
    }, { onConflict: 'organization_id,month' }).select('id').single();
  if (error || !data) return fail('failed');
  refresh();
  return ok(data.id);
}

export async function deleteFinancialMonthly(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');

  const { data, error } = await c.sb.from('financial_monthly').delete().eq('id', id).select('id');
  if (error) return fail('failed');
  if (!data?.length) return fail('forbidden');
  refresh();
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Expenses — a real CRUD entity (unlike the monthly upserts above), since more
// than one expense can and does happen on the same day.
// ---------------------------------------------------------------------------

const expenseSchema = z.object({
  date: isoDate,
  category: z.string().trim().min(1).max(100),
  amount: z.coerce.number().min(0.01).max(1_000_000_000),
  vendor: emptyToNull(z.string().max(200)),
  note: emptyToNull(z.string().max(2000)),
});

export async function createExpense(raw: unknown): Promise<ActionResult<string>> {
  const parsed = expenseSchema.safeParse(raw);
  if (!parsed.success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');

  const { data, error } = await c.sb.from('expenses').insert({ ...parsed.data, organization_id: c.orgId, created_by: c.user.id }).select('id').single();
  if (error || !data) return fail('failed');
  refresh();
  return ok(data.id);
}

export async function updateExpense(id: string, raw: unknown): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail('invalid');
  const parsed = expenseSchema.safeParse(raw);
  if (!parsed.success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');

  const { data, error } = await c.sb.from('expenses').update(parsed.data).eq('id', id).select('id');
  if (error) return fail('failed');
  if (!data?.length) return fail('forbidden');
  refresh();
  return ok(undefined);
}

export async function deleteExpense(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');

  const { data, error } = await c.sb.from('expenses').delete().eq('id', id).select('id');
  if (error) return fail('failed');
  if (!data?.length) return fail('forbidden');
  refresh();
  return ok(undefined);
}
