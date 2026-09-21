import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { CRM_FLOW_KEY, type CrmFlowKey, type CrmFlowChannel, type CrmFlowStatus } from '@/lib/crm/constants';

/**
 * CRM (spec §09) — "Are customers coming back?" Founder-only in the spec's own
 * permission matrix (§03: Founder ●, Manager and Member both blank — no row at
 * all), which lines up with `customers_all` RLS (every operation, including
 * select, is `is_founder(organization_id)` — see migration 0002). `crm_flows` and
 * `crm_metrics_monthly`, by contrast, are in the generic per-table loop (select =
 * any active member) — but gating the whole `/crm` screen to founder-only, not
 * founder-or-manager, matches the spec's intent and avoids a manager seeing flow
 * performance with no customer data behind it. Same category of deliberate
 * tightening as `can.viewReviews`/`can.viewMarketing`, just one notch stricter.
 * See `app/(app)/crm/actions.ts` for the write-side mirror.
 *
 * `customers` is populated by the order-history import (`/revenue/import`,
 * `importShowmoreCustomers`) as of 2026-09-14 — see the phone-hash note in
 * ARCHITECTURE.md and `lib/import/customerAggregation.ts`. `getCustomersPage`
 * below is the read path; it paginates and supports search rather than
 * returning everything, since a real org can have thousands of rows (5,404
 * on Lucas's first live import, 2026-09-15).
 */

// ---------------------------------------------------------------------------
// CRM flows — 12 fixed keys, `unique(organization_id, key)`. Unlike Company
// Health's 11 business systems, this sandbox has no `supabase/seed.sql` to check
// whether these 12 rows already exist per organization, so — unlike Company
// Health's edit-only scorecard — this screen supports creating a flow for any key
// not yet used, not just editing existing ones. See the scope note in
// app/(app)/crm/actions.ts.
// ---------------------------------------------------------------------------

export interface CrmFlowOptions { owners: { id: string; name: string }[] }

export interface CrmFlowRow {
  id: string;
  key: CrmFlowKey;
  name: string;
  channel: CrmFlowChannel;
  status: CrmFlowStatus;
  audience: string | null;
  messagesCount: number;
  sends: number;
  conversions: number;
  revenue: number;
  owner: { id: string; name: string } | null;
  notes: string | null;
  lastUpdatedAt: string | null;
}

export interface CrmFlowsPage { flows: CrmFlowRow[]; unusedKeys: CrmFlowKey[]; options: CrmFlowOptions; error: boolean }

const CRM_FLOW_SELECT = 'id, key, name, channel, status, audience, messages_count, sends, conversions, revenue, owner_id, notes, last_updated_at, owner:owner_id(id, display_name, full_name)';
const KEY_RANK = Object.fromEntries(CRM_FLOW_KEY.map((k, i) => [k, i])) as Record<CrmFlowKey, number>;

export async function getCrmFlowOptions(orgId: string): Promise<CrmFlowOptions> {
  const sb = await createClient();
  const { data } = await sb.from('memberships').select('profile_id, profiles:profile_id(id, display_name, full_name)').eq('organization_id', orgId).eq('status', 'active');
  return { owners: (data ?? []).map(m => one(m.profiles)).filter(Boolean).map(p => ({ id: p!.id, name: personName(p!) })).sort((a, b) => a.name.localeCompare(b.name)) };
}

export async function getCrmFlowsPage(orgId: string): Promise<CrmFlowsPage> {
  const sb = await createClient();
  const [list, options] = await Promise.all([
    sb.from('crm_flows').select(CRM_FLOW_SELECT).eq('organization_id', orgId),
    getCrmFlowOptions(orgId),
  ]);
  if (list.error) return { flows: [], unusedKeys: [], options: { owners: [] }, error: true };

  const flows: CrmFlowRow[] = (list.data ?? []).map(f => ({
    id: f.id, key: f.key as CrmFlowKey, name: f.name, channel: f.channel as CrmFlowChannel, status: f.status as CrmFlowStatus,
    audience: f.audience, messagesCount: f.messages_count, sends: f.sends, conversions: f.conversions, revenue: Number(f.revenue),
    owner: one(f.owner) ? { id: one(f.owner)!.id, name: personName(one(f.owner)!) } : null,
    notes: f.notes, lastUpdatedAt: f.last_updated_at,
  })).sort((a, b) => KEY_RANK[a.key] - KEY_RANK[b.key]);

  const usedKeys = new Set(flows.map(f => f.key));
  const unusedKeys = CRM_FLOW_KEY.filter(k => !usedKeys.has(k));

  return { flows, unusedKeys, options, error: false };
}

// ---------------------------------------------------------------------------
// Monthly CRM metrics — manual, one row per month (`unique(organization_id,
// month)`), same "saving replaces this period's figures" idiom as Revenue and
// Marketing's ad spend, because there's no automatic computation yet.
//
// Re-checked 2026-09-16, after `customers` was populated (see the scope note
// above): `customers` population was NOT actually the blocker — it's still
// manual because `customers` only stores per-customer *totals*
// (`orders_count`, `total_spent`, `first_order_at`, `last_order_at`), not
// per-order rows. Computing "new vs. returning this month", "repeat revenue
// this month" or "avg orders this month" needs order-level date+amount data
// per customer, which `lib/import/customerAggregation.ts` deliberately
// collapses away during aggregation (`CustomerOrder` has it, per-row;
// `CustomerAggregate`, what actually gets written, does not). Automating this
// screen for real needs a schema decision — a per-order table, or storing the
// monthly buckets at import time — that's a genuine architecture call on live
// production data (5,404 real customers as of the first import), not a safe
// unilateral change. Left manual on purpose; flag this reasoning to Lucas
// before building it, don't just add a migration.
// ---------------------------------------------------------------------------

export interface MonthlyMetricRow {
  id: string; month: string; customers: number; newCustomers: number; returningCustomers: number;
  repeatRate: number | null; repeatRevenue: number; retentionRevenue: number; avgOrders: number | null; ltv: number | null;
}

export interface MonthlyMetricsPage { rows: MonthlyMetricRow[]; error: boolean }

const MONTHLY_METRIC_SELECT = 'id, month, customers, new_customers, returning_customers, repeat_rate, repeat_revenue, retention_revenue, avg_orders, ltv';

export async function getMonthlyMetricsPage(orgId: string): Promise<MonthlyMetricsPage> {
  const sb = await createClient();
  const { data, error } = await sb.from('crm_metrics_monthly').select(MONTHLY_METRIC_SELECT).eq('organization_id', orgId).order('month', { ascending: false });
  if (error) return { rows: [], error: true };

  const rows: MonthlyMetricRow[] = (data ?? []).map(r => ({
    id: r.id, month: r.month, customers: r.customers, newCustomers: r.new_customers, returningCustomers: r.returning_customers,
    repeatRate: r.repeat_rate !== null ? Number(r.repeat_rate) : null, repeatRevenue: Number(r.repeat_revenue), retentionRevenue: Number(r.retention_revenue),
    avgOrders: r.avg_orders !== null ? Number(r.avg_orders) : null, ltv: r.ltv !== null ? Number(r.ltv) : null,
  }));
  return { rows, error: false };
}

// ---------------------------------------------------------------------------
// Customers — read-only in this pass (see the file-level scope note above).
// ---------------------------------------------------------------------------

export interface CustomerRow {
  id: string; name: string | null; email: string | null; phone: string | null;
  ordersCount: number; totalSpent: number; lastOrderAt: string | null; tags: string[];
}

export interface CustomersPage { customers: CustomerRow[]; total: number; page: number; pageCount: number; error: boolean }

const CUSTOMER_SELECT = 'id, name, email, phone, orders_count, total_spent, last_order_at, tags';
/**
 * A real page size, not a cap — with 5,404 real customers imported 2026-09-15
 * (see ARCHITECTURE.md), the old flat `.limit(200)` "top customers" view
 * silently hid everyone outside the top 200 spenders. This now paginates the
 * whole table and supports a search box, sorted by total_spent so the most
 * valuable customers still lead each page.
 */
export const CUSTOMER_LIST_PAGE_SIZE = 50;

/**
 * Strips characters that are meaningful to PostgREST's filter syntax before a
 * user-typed search term is spliced into an `.or()` filter string — a comma
 * would otherwise be parsed as separating extra conditions and a paren as
 * grouping them. `%`/`_` are separately escaped since they're ILIKE
 * wildcards, not literal characters someone searching a name would mean.
 * RLS still scopes every query to the caller's own organization regardless,
 * so this is about correctness (a garbled query), not a security boundary.
 *
 * Length-capped 2026-09-17 (`MAX_SEARCH_LEN`): `opts.query` comes straight off
 * the `?q=` URL param with no bound at all before this — no name/email/phone
 * search anyone would actually type is anywhere near 200 characters, so this
 * only ever trims a pathological URL (hand-edited, or a bug elsewhere), never
 * a real search.
 */
const MAX_SEARCH_LEN = 200;
function sanitizeSearchTerm(raw: string): string {
  return raw.slice(0, MAX_SEARCH_LEN).replace(/[,()]/g, '').replace(/[%_\\]/g, m => `\\${m}`).trim();
}

export async function getCustomersPage(orgId: string, opts?: { query?: string; page?: number }): Promise<CustomersPage> {
  const sb = await createClient();
  const page = Math.max(1, Math.floor(opts?.page ?? 1));
  const from = (page - 1) * CUSTOMER_LIST_PAGE_SIZE;
  const to = from + CUSTOMER_LIST_PAGE_SIZE - 1;

  let query = sb.from('customers').select(CUSTOMER_SELECT, { count: 'exact' }).eq('organization_id', orgId);
  const term = opts?.query ? sanitizeSearchTerm(opts.query) : '';
  if (term) query = query.or(`name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);

  const { data, error, count } = await query.order('total_spent', { ascending: false }).range(from, to);
  if (error) return { customers: [], total: 0, page: 1, pageCount: 1, error: true };

  const customers: CustomerRow[] = (data ?? []).map(c => ({
    id: c.id, name: c.name, email: c.email, phone: c.phone,
    ordersCount: c.orders_count, totalSpent: Number(c.total_spent), lastOrderAt: c.last_order_at, tags: c.tags ?? [],
  }));
  const total = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / CUSTOMER_LIST_PAGE_SIZE));
  return { customers, total, page, pageCount, error: false };
}

// ---- helpers -------------------------------------------------------------

function one<T>(rel: T | T[] | null | undefined): T | null {
  return (Array.isArray(rel) ? rel[0] : rel) ?? null;
}

function personName(p: { display_name?: string | null; full_name?: string | null }): string {
  return p.display_name || p.full_name || '';
}
