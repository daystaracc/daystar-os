'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

const schema = z.object({ code: z.string().min(1), entityId: z.string().uuid().nullable(), action: z.enum(['resolved', 'dismissed']), days: z.number().int().min(1).max(90).optional() });

/** Resolve = hide until the underlying condition changes (30 days); Dismiss = snooze for `days` (default 7). Both are audited via the row itself. */
export async function actOnAttention(input: z.infer<typeof schema>) {
  const p = schema.parse(input);
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error('unauthenticated');
  const { data: m } = await sb.from('memberships').select('organization_id').eq('profile_id', user.id).eq('status', 'active').limit(1).single();
  if (!m) throw new Error('no organization');
  const until = new Date(Date.now() + (p.action === 'resolved' ? 30 : p.days ?? 7) * 86_400_000).toISOString().slice(0, 10);
  const { error } = await sb.from('attention_dismissals').insert({ organization_id: m.organization_id, rule_code: p.code, entity_id: p.entityId, action: p.action, until_date: until, acted_by: user.id });
  if (error) throw error;
  revalidatePath('/overview');
}
