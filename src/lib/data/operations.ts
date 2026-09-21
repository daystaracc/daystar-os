import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { shiftDays } from '@/lib/calculations/pacing';
import type { CsChannel, CsIssueType, CsStatus } from '@/lib/operations/constants';

/**
 * Operations (see lib/operations/constants.ts for the file-level history/RLS note).
 * Two independent tables, two tabs on `/operations`, same shape as Finance's
 * monthly/expenses split: `operations_daily` (one row per day — "did fulfillment
 * keep up today," upserted like Finance's monthly P&L) and `customer_service_cases`
 * (a real CRUD list of open issues, ordered so what needs attention surfaces first).
 */

// ---------------------------------------------------------------------------
// Daily log — one row per day (`unique(organization_id, date)`), same
// "saving REPLACES this day's figures" idiom as Finance/Marketing/CRM's monthly
// upserts. "Missing is not zero": `fulfillment_minutes` / `cs_avg_response_minutes`
// stay `null` rather than defaulting to 0 when a day genuinely wasn't logged.
// ---------------------------------------------------------------------------

export interface OperationsDailyRow {
  id: string; date: string;
  ordersWaiting: number; ordersShipped: number;
  fulfillmentStartedAt: string | null; fulfillmentCompletedAt: string | null; fulfillmentMinutes: number | null;
  errors: number; returns: number;
  csPending: number; csAvgResponseMinutes: number | null;
  employeeId: string | null; notes: string | null;
}

export interface OperationsDailyPage {
  rows: OperationsDailyRow[];
  today: OperationsDailyRow | null;
  /** Rolling window sums/averages — same "only over rows that exist" discipline as Finance's expense window total. */
  window: { ordersShipped: number; errors: number; returns: number; avgFulfillmentMinutes: number | null };
  error: boolean;
}

const OPERATIONS_DAILY_SELECT = 'id, date, orders_waiting, orders_shipped, fulfillment_started_at, fulfillment_completed_at, fulfillment_minutes, errors, returns, cs_pending, cs_avg_response_minutes, employee_id, notes';
const OPERATIONS_WINDOW_DAYS = 30;

function toDailyRow(r: {
  id: string; date: string; orders_waiting: number; orders_shipped: number;
  fulfillment_started_at: string | null; fulfillment_completed_at: string | null; fulfillment_minutes: number | null;
  errors: number; returns: number; cs_pending: number; cs_avg_response_minutes: number | null;
  employee_id: string | null; notes: string | null;
}): OperationsDailyRow {
  return {
    id: r.id, date: r.date, ordersWaiting: r.orders_waiting, ordersShipped: r.orders_shipped,
    fulfillmentStartedAt: r.fulfillment_started_at, fulfillmentCompletedAt: r.fulfillment_completed_at,
    fulfillmentMinutes: r.fulfillment_minutes, errors: r.errors, returns: r.returns,
    csPending: r.cs_pending, csAvgResponseMinutes: r.cs_avg_response_minutes,
    employeeId: r.employee_id, notes: r.notes,
  };
}

export async function getOperationsDailyPage(orgId: string, asOf = new Date().toISOString().slice(0, 10)): Promise<OperationsDailyPage> {
  const sb = await createClient();
  const since = shiftDays(asOf, -OPERATIONS_WINDOW_DAYS);
  const { data, error } = await sb.from('operations_daily').select(OPERATIONS_DAILY_SELECT).eq('organization_id', orgId).gte('date', since).order('date', { ascending: false });
  if (error) return { rows: [], today: null, window: { ordersShipped: 0, errors: 0, returns: 0, avgFulfillmentMinutes: null }, error: true };

  const rows = (data ?? []).map(toDailyRow);
  const today = rows.find(r => r.date === asOf) ?? null;
  const minuteRows = rows.filter(r => r.fulfillmentMinutes !== null);

  return {
    rows, today,
    window: {
      ordersShipped: rows.reduce((a, r) => a + r.ordersShipped, 0),
      errors: rows.reduce((a, r) => a + r.errors, 0),
      returns: rows.reduce((a, r) => a + r.returns, 0),
      // null (not 0) when nothing in the window logged a fulfillment time — an
      // average of zero rows would silently read as "instant fulfillment."
      avgFulfillmentMinutes: minuteRows.length ? minuteRows.reduce((a, r) => a + (r.fulfillmentMinutes ?? 0), 0) / minuteRows.length : null,
    },
    error: false,
  };
}

// ---------------------------------------------------------------------------
// CS cases — a real CRUD entity. Ordered open/waiting first (what needs
// attention), then resolved/closed, newest first within each — same intent as
// the Command Center's `cs_stale` rule, which flags open/waiting cases whose
// `last_response_at` (falling back to `created_at`) is over 24h old.
// ---------------------------------------------------------------------------

export interface CsCaseRow {
  id: string; customerName: string | null; orderRef: string | null;
  channel: CsChannel; issueType: CsIssueType; status: CsStatus;
  owner: { id: string; name: string } | null;
  createdAt: string; lastResponseAt: string | null; resolvedAt: string | null;
  resolution: string | null; notes: string | null;
}

export interface CsCasesPage { rows: CsCaseRow[]; owners: { id: string; name: string }[]; openCount: number; waitingCount: number; error: boolean }

const CS_CASE_SELECT = 'id, customer_name, order_ref, channel, issue_type, status, created_at, last_response_at, resolved_at, resolution, notes, owner:owner_id(id, display_name, full_name)';
const STATUS_ORDER: Record<CsStatus, number> = { open: 0, waiting: 1, resolved: 2, closed: 3 };

/** Every active member of the org — same "who can this be assigned to" list as Marketing's `getCreatorOptions`. */
export async function getOperationsOwnerOptions(orgId: string): Promise<{ id: string; name: string }[]> {
  const sb = await createClient();
  const { data } = await sb.from('memberships').select('profile_id, profiles:profile_id(id, display_name, full_name)').eq('organization_id', orgId).eq('status', 'active');
  return (data ?? []).map(m => one(m.profiles)).filter(Boolean).map(p => ({ id: p!.id, name: personName(p!) })).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getCsCasesPage(orgId: string): Promise<CsCasesPage> {
  const sb = await createClient();
  const [{ data, error }, owners] = await Promise.all([
    sb.from('customer_service_cases').select(CS_CASE_SELECT).eq('organization_id', orgId).order('created_at', { ascending: false }),
    getOperationsOwnerOptions(orgId),
  ]);
  if (error) return { rows: [], owners, openCount: 0, waitingCount: 0, error: true };

  const rows: CsCaseRow[] = (data ?? [])
    .map(r => {
      const owner = one(r.owner as { id: string; display_name: string | null; full_name: string | null } | { id: string; display_name: string | null; full_name: string | null }[] | null);
      return {
        id: r.id, customerName: r.customer_name, orderRef: r.order_ref,
        channel: r.channel as CsChannel, issueType: r.issue_type as CsIssueType, status: r.status as CsStatus,
        owner: owner ? { id: owner.id, name: personName(owner) } : null,
        createdAt: r.created_at, lastResponseAt: r.last_response_at, resolvedAt: r.resolved_at,
        resolution: r.resolution, notes: r.notes,
      };
    })
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.createdAt.localeCompare(a.createdAt));

  return {
    rows, owners,
    openCount: rows.filter(r => r.status === 'open').length,
    waitingCount: rows.filter(r => r.status === 'waiting').length,
    error: false,
  };
}

// ---- helpers ---------------------------------------------------------------

function one<T>(rel: T | T[] | null | undefined): T | null {
  return (Array.isArray(rel) ? rel[0] : rel) ?? null;
}

function personName(p: { display_name?: string | null; full_name?: string | null }): string {
  return p.display_name || p.full_name || '';
}
