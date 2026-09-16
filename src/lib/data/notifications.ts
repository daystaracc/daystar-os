import 'server-only';
import { createClient } from '@/lib/supabase/server';

export interface NotificationRow {
  id: string;
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationsPage {
  items: NotificationRow[];
  unreadCount: number;
  error: boolean;
}

const LIMIT = 100;

/**
 * NOTIFICATIONS (`0001_schema.sql`'s `notifications` table). `notifications_select`
 * RLS is recipient-only (`recipient_id = auth.uid()`), so every query here is
 * already scoped to the signed-in user's own notifications — the explicit
 * `.eq('recipient_id', ...)` below just documents that, same as every other read
 * in this codebase that could technically rely on RLS alone.
 *
 * There is deliberately no way to *create* a notification from the app — the table
 * has no insert policy for regular users (see `0002_rls.sql`), because populating
 * it is a fan-out/cron concern (something writes a row when e.g. a task is assigned
 * or overdue) that this pass isn't building. So this page is a real, finished read
 * (and mark-read) path that will show real data the moment something starts writing
 * rows — same "read path ready, write path deferred" shape as CRM's `getCustomersPage`
 * before the customer import existed.
 */
export async function getNotifications(): Promise<NotificationsPage> {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { items: [], unreadCount: 0, error: true };

  const { data, error } = await sb
    .from('notifications')
    .select('id, type, severity, title, body, entity_type, entity_id, read_at, created_at')
    .eq('recipient_id', user.id)
    .order('created_at', { ascending: false })
    .limit(LIMIT);

  if (error || !data) return { items: [], unreadCount: 0, error: true };

  // `severity` is `text` with a check constraint in Postgres (migration 0001), so it
  // comes back typed as a plain string — cast to the literal union, same convention
  // as every other check-constrained column read in this codebase (e.g. Team's
  // `m.role as MembershipRow['role']`).
  const items: NotificationRow[] = data.map(n => ({
    id: n.id, type: n.type, severity: n.severity as NotificationRow['severity'], title: n.title, body: n.body,
    entityType: n.entity_type, entityId: n.entity_id, readAt: n.read_at, createdAt: n.created_at,
  }));

  return { items, unreadCount: items.filter(n => !n.readAt).length, error: false };
}
