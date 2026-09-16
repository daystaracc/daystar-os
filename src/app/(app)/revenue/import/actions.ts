'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { parseCsv } from '@/lib/import/csv';
import { parseShowmore } from '@/lib/import/showmore';
import { planRevenueImport, type ExistingRevenueDay, type RevenueImportPlan } from '@/lib/import/revenueImportPlan';
import { extractCustomerOrders, aggregateCustomers } from '@/lib/import/customerAggregation';
import { hashPhone } from '@/lib/import/customerHash.server';

export interface RevenueImportOutcome {
  ok: boolean;
  message?: string;
  summary?: RevenueImportPlan['summary'];
}

/**
 * Import a Showmore order export (`訂單管理 → 匯出`) into `sales_daily`.
 *
 * The **file text** is sent, not a client-built payload, and parsed again here —
 * same discipline as `settings/import/actions.ts`'s product import — so the preview
 * the user approved and the rows written come from the same pure functions, and a
 * tampered payload cannot write arbitrary figures.
 *
 * Each date+channel REPLACES whatever `sales_daily` row is already there for that
 * day (upsert on the table's own `unique(organization_id, date, channel_id)`); it
 * never adds to it, so importing the same file twice is a no-op, not a doubling.
 * `platform_fees`, `sessions` and `notes` are deliberately left out of the upsert
 * payload — Showmore's order export reports none of them, so an import must never
 * overwrite a platform-fee reconciliation, a GA session count, or a note someone
 * entered by hand for that day.
 *
 * RLS (`sales_daily_write`, manager-or-above) is the authority on permission; the
 * role check here only produces a clearer message before any parsing happens.
 */
export async function importShowmoreOrders(csvText: string): Promise<RevenueImportOutcome> {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, message: 'Not signed in.' };

  const { data: membership } = await sb
    .from('memberships').select('organization_id, role')
    .eq('profile_id', user.id).eq('status', 'active').limit(1).single();
  if (!membership) return { ok: false, message: 'No organization.' };
  if (membership.role !== 'founder' && membership.role !== 'manager') {
    return { ok: false, message: 'Only founders and managers can import revenue.' };
  }
  const orgId = membership.organization_id;

  const parsed = parseShowmore(parseCsv(csvText));
  if (!parsed.days.length || !parsed.dateRange) {
    return { ok: false, message: parsed.warnings[0] ?? 'Nothing to import.' };
  }

  const [{ data: channelRows }, { data: existingRows }] = await Promise.all([
    sb.from('sales_channels').select('id, key').eq('organization_id', orgId),
    sb.from('sales_daily')
      .select('date, orders, gross_revenue, refunds, sales_channels(key)')
      .eq('organization_id', orgId)
      .gte('date', parsed.dateRange.from).lte('date', parsed.dateRange.to),
  ]);

  const channelIdByKey = new Map((channelRows ?? []).map(c => [c.key, c.id]));
  const existing: ExistingRevenueDay[] = (existingRows ?? []).map(r => ({
    date: r.date, channelKey: channelOf(r.sales_channels)?.key ?? '',
    orders: Number(r.orders), gross_revenue: Number(r.gross_revenue), refunds: Number(r.refunds),
  }));

  const plan = planRevenueImport(parsed.days, existing);

  // Every channel Showmore reports must already exist for this org before anything
  // is written — a missing channel would otherwise silently drop that day's rows.
  const missingChannel = plan.days.find(d => !channelIdByKey.has(d.channelKey));
  if (missingChannel) return { ok: false, message: `No sales channel configured for "${missingChannel.channelKey}".` };

  const rows = plan.days.map(d => ({
    organization_id: orgId,
    date: d.date,
    channel_id: channelIdByKey.get(d.channelKey)!,
    orders: d.orders,
    gross_revenue: d.gross_revenue,
    refunds: d.refunds,
    created_by: user.id,
  }));

  const { error } = await sb.from('sales_daily').upsert(rows, { onConflict: 'organization_id,date,channel_id' });
  if (error) return { ok: false, message: `sales_daily: ${error.message}` };

  revalidatePath('/revenue');
  revalidatePath('/overview');
  return { ok: true, summary: plan.summary };
}

function channelOf(c: unknown): { key: string } | null {
  const x = Array.isArray(c) ? c[0] : c;
  return (x as { key: string } | null) ?? null;
}

export interface CustomerImportOutcome {
  ok: boolean;
  message?: string;
  summary?: { customers: number; repeatCustomers: number; totalSpent: number };
}

/**
 * Import the same Showmore order export into `customers` — see the file-level
 * note in lib/import/customerAggregation.ts for why this write path didn't
 * exist until 2026-09-14 (blocked on the phone-hashing decision Lucas approved
 * that day). Same discipline as `importShowmoreOrders` above: the **file
 * text** is sent, not client-computed totals, and re-parsed here with the
 * real salt — the client-side preview (`RevenueImportWizard.tsx`) uses a
 * throwaway, non-secret salt only to show counts, never the real one, so the
 * actual `CUSTOMER_PHONE_HASH_SALT` never reaches the browser.
 *
 * Each customer row is a full REPLACE of that phone hash's lifetime totals
 * (upsert on `unique(organization_id, phone_hash)`, migration
 * `0008_customer_phone_hash.sql`) — the same idiom as every other "save
 * replaces the period" flow this session, except the "period" here is a
 * customer's entire history. That means **the uploaded file should always be
 * the complete order history, not just new orders** — importing a partial
 * file would understate existing customers' lifetime totals. The wizard's
 * copy says this; it is re-stated here since this file is the one place that
 * actually writes it.
 */
export async function importShowmoreCustomers(csvText: string): Promise<CustomerImportOutcome> {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, message: 'Not signed in.' };

  const { data: membership } = await sb
    .from('memberships').select('organization_id, role')
    .eq('profile_id', user.id).eq('status', 'active').limit(1).single();
  if (!membership) return { ok: false, message: 'No organization.' };
  if (membership.role !== 'founder' && membership.role !== 'manager') {
    return { ok: false, message: 'Only founders and managers can import customers.' };
  }

  const salt = process.env.CUSTOMER_PHONE_HASH_SALT;
  if (!salt) {
    return { ok: false, message: 'CUSTOMER_PHONE_HASH_SALT is not set in this environment — add it (any long random string, kept secret) before importing customers. See docs/ARCHITECTURE.md.' };
  }

  const orgId = membership.organization_id;
  const { orders, warnings } = extractCustomerOrders(parseCsv(csvText), normalized => hashPhone(normalized, salt));
  const customers = aggregateCustomers(orders);
  if (!customers.length) return { ok: false, message: warnings[0] ?? 'No customers could be identified from this file.' };

  const rows = customers.map(c => ({
    organization_id: orgId,
    phone_hash: c.phoneHash,
    name: c.name,
    orders_count: c.ordersCount,
    total_spent: c.totalSpent,
    first_order_at: c.firstOrderAt,
    last_order_at: c.lastOrderAt,
  }));

  const { error } = await sb.from('customers').upsert(rows, { onConflict: 'organization_id,phone_hash' });
  if (error) return { ok: false, message: `customers: ${error.message}` };

  revalidatePath('/crm');
  return {
    ok: true,
    summary: {
      customers: customers.length,
      repeatCustomers: customers.filter(c => c.ordersCount > 1).length,
      totalSpent: customers.reduce((a, c) => a + c.totalSpent, 0),
    },
  };
}
