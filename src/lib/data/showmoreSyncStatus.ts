import 'server-only';
import { createClient } from '@/lib/supabase/server';

export interface ShowmoreSyncStatus {
  syncedAt: string;
  ok: boolean;
  summary: string;
}

/**
 * Most recent scheduled Showmore sync run (written by
 * `/api/internal/showmore-daily-sync`), for the "last synced" line on the Revenue
 * page. Null means the automated sync has never run yet — distinct from a run that
 * ran and found nothing to sync, which still logs (see the route).
 */
export async function getLastShowmoreSync(orgId: string): Promise<ShowmoreSyncStatus | null> {
  const sb = await createClient();
  const { data } = await sb
    .from('activity_logs')
    .select('created_at, summary, diff')
    .eq('organization_id', orgId)
    .eq('entity_type', 'showmore_scheduled_sync')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;

  const diff = data.diff as { ok?: boolean } | null;
  return { syncedAt: data.created_at, ok: diff?.ok !== false, summary: data.summary };
}
