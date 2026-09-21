'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { fetchOrdersInRange } from '@/lib/integrations/showmoreClient';
import { runShowmoreOrderSync, type SyncWriteOutcome } from '@/lib/integrations/showmoreSyncWrite';

/**
 * Manual trigger for the live Showmore order sync — the backfill/reconciliation
 * counterpart to the webhook (src/app/api/webhooks/showmore/route.ts), which
 * handles ongoing real-time updates once registered on Showmore's side. This
 * action exists for: the first historical backfill, and spot-checking a range if
 * something looks off. Same underlying sync (`runShowmoreOrderSync`) as the
 * webhook, so a day looks the same whichever path touched it.
 *
 * `sinceIso`/`untilIso` are date-only strings (`YYYY-MM-DD`) from the UI; the
 * whole day (UTC+8, matching Showmore's own timestamps) is fetched.
 */
export async function syncShowmoreOrders(sinceDate: string, untilDate: string): Promise<SyncWriteOutcome> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sinceDate) || !/^\d{4}-\d{2}-\d{2}$/.test(untilDate)) {
    return { ok: false, message: 'Invalid date range.' };
  }
  if (sinceDate > untilDate) return { ok: false, message: '"Since" must be before "Until".' };

  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, message: 'Not signed in.' };

  const { data: membership } = await sb
    .from('memberships').select('organization_id, role')
    .eq('profile_id', user.id).eq('status', 'active').limit(1).single();
  if (!membership) return { ok: false, message: 'No organization.' };
  if (membership.role !== 'founder' && membership.role !== 'manager') {
    return { ok: false, message: 'Only founders and managers can sync Showmore orders.' };
  }

  let orders;
  try {
    orders = await fetchOrdersInRange(`${sinceDate}T00:00:00+08:00`, `${untilDate}T23:59:59+08:00`);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Failed to fetch orders from Showmore.' };
  }

  const outcome = await runShowmoreOrderSync(sb, membership.organization_id, orders, user.id);
  if (outcome.ok) {
    revalidatePath('/revenue');
    revalidatePath('/overview');
    revalidatePath('/products');
  }
  return outcome;
}
