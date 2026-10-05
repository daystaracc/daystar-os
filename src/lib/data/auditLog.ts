import 'server-only';
import { createClient } from '@/lib/supabase/server';

export interface ActivityLogRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  actor: string | null;
  createdAt: string;
}

export interface ActivityLogPage {
  items: ActivityLogRow[];
  total: number;
  page: number;
  pageCount: number;
  error: boolean;
}

export const AUDIT_LOG_PAGE_SIZE = 50;

/**
 * The fixed set of `entity_type` values this app's `log_activity()` trigger and its
 * handful of direct application inserts can actually produce — not queried via
 * `DISTINCT` (PostgREST has no clean way to ask for that), enumerated instead, the
 * same "fixed known set" shape as Company Health's 11 systems or SOPs' 11 categories.
 * Keep this in sync with `0001_schema.sql`'s `create trigger log_*` list and the
 * `entity_type:` literals in `api/cron/auto-reorder-tasks`, `api/cron/
 * notifications-fanout`, `api/internal/showmore-daily-sync`, and
 * `lib/integrations/showmoreSyncWrite.ts` — nothing enforces this list automatically.
 */
export const AUDIT_LOG_ENTITY_TYPES = [
  'tasks', 'projects', 'inventory_movements', 'sales_daily', 'targets',
  'financial_monthly', 'key_results', 'business_systems',
  'auto_reorder_tasks', 'notifications_fanout', 'showmore_scheduled_sync', 'showmore_order_sync',
] as const;
export type AuditLogEntityType = (typeof AUDIT_LOG_ENTITY_TYPES)[number];

function nameOf(p: unknown): string | null {
  const x = Array.isArray(p) ? p[0] : p;
  return (x as { display_name?: string } | null)?.display_name ?? null;
}

/**
 * AUDIT LOG (`activity_logs`, `0001_schema.sql` + `0011_activity_logs_write_policy.sql`).
 * `activity_logs_select` RLS is manager-or-above — `can.viewAuditLog` (permissions.ts)
 * mirrors it exactly, so this fetcher relies on RLS to scope rows to the caller's own
 * organization rather than adding its own `.eq('organization_id', ...)` — same as
 * every other query in this codebase that already does that.
 *
 * Most rows come from `log_activity()`, a security-definer trigger on tasks/projects/
 * inventory_movements/sales_daily/targets/financial_monthly/key_results/
 * business_systems (see that function's own comment in `0001_schema.sql` for the exact
 * action/summary text it generates per table); a smaller number are direct application
 * inserts from cron/sync routes, `actor_id` null (no human triggered them) and
 * `entity_type` one of 'auto_reorder_tasks' | 'notifications_fanout' |
 * 'showmore_scheduled_sync' | 'showmore_order_sync'.
 *
 * `summary` is built server-side in Postgres, in English, regardless of the viewer's
 * locale — the database has no notion of the request's language — and rendered as-is
 * here rather than re-translated or parsed apart, the same restraint this app already
 * applies to text it didn't author itself (e.g. Showmore's raw CSV warnings).
 */
export async function getActivityLog(opts: { page?: number; entityType?: AuditLogEntityType } = {}): Promise<ActivityLogPage> {
  const sb = await createClient();
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const from = (page - 1) * AUDIT_LOG_PAGE_SIZE;
  const to = from + AUDIT_LOG_PAGE_SIZE - 1;

  let query = sb.from('activity_logs')
    .select('id, action, entity_type, entity_id, summary, created_at, profiles:actor_id(display_name)', { count: 'exact' });
  if (opts.entityType) query = query.eq('entity_type', opts.entityType);

  const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, to);
  if (error) return { items: [], total: 0, page: 1, pageCount: 1, error: true };

  const items: ActivityLogRow[] = (data ?? []).map(a => ({
    id: a.id, action: a.action, entityType: a.entity_type, entityId: a.entity_id,
    summary: a.summary, actor: nameOf(a.profiles), createdAt: a.created_at,
  }));
  const total = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / AUDIT_LOG_PAGE_SIZE));
  return { items, total, page, pageCount, error: false };
}
