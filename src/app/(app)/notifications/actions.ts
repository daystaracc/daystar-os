'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: 'forbidden' | 'invalid' | 'failed' };
const ok = <T,>(data: T): ActionResult<T> => ({ ok: true, data });
const fail = (error: 'forbidden' | 'invalid' | 'failed'): ActionResult<never> => ({ ok: false, error });

/**
 * Mark one notification read. `notifications_update` RLS is recipient-only — the
 * `.eq('recipient_id', ...)` here is redundant with it but kept for the same reason
 * as everywhere else in this codebase: it makes a wrong-user update a documented
 * no-op instead of a silent reliance on the database catching it.
 */
export async function markNotificationRead(id: string): Promise<ActionResult> {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return fail('forbidden');
  if (typeof id !== 'string' || !id) return fail('invalid');

  const { error } = await sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id).eq('recipient_id', user.id);
  if (error) return fail('failed');
  revalidatePath('/notifications');
  return ok(undefined);
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return fail('forbidden');

  const { error } = await sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('recipient_id', user.id).is('read_at', null);
  if (error) return fail('failed');
  revalidatePath('/notifications');
  return ok(undefined);
}
