'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

// Every mutation returns an ActionResult instead of throwing — same pattern as every
// other screen this session (see app/(app)/tasks/actions.ts for the original).
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: 'forbidden' | 'invalid' | 'failed' };
const ok = <T,>(data: T): ActionResult<T> => ({ ok: true, data });
const fail = (error: 'forbidden' | 'invalid' | 'failed'): ActionResult<never> => ({ ok: false, error });

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const emptyToNull = <T extends z.ZodTypeAny>(s: T) =>
  z.preprocess(v => (v === '' || v === undefined ? null : v), s.nullable());

async function ctx() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data: m } = await sb.from('memberships').select('organization_id, role').eq('profile_id', user.id).eq('status', 'active').limit(1).single();
  if (!m) return null;
  return { sb, user, orgId: m.organization_id, role: m.role };
}

// `business_systems_update` RLS (generic loop, migration 0002): manager-or-above.
// There is no create/delete action here on purpose — the 11 systems are fixed,
// seeded rows (`unique (organization_id, key)`); see the scope note in
// lib/data/companyHealth.ts and ARCHITECTURE §0.
const updateSchema = z.object({
  score: z.coerce.number().int().min(1).max(5).optional(),
  owner_id: emptyToNull(uuid).optional(),
  future_owner: emptyToNull(z.string().max(200)).optional(),
  transfer_date: emptyToNull(isoDate).optional(),
  goal: emptyToNull(z.string().max(2000)).optional(),
  bottleneck: emptyToNull(z.string().max(2000)).optional(),
  next_action: emptyToNull(z.string().max(500)).optional(),
});

/**
 * Scoring drawer: Score · Owner · Bottleneck · Next action, plus the Advanced
 * ownership-matrix fields (future owner, transfer date, goal). `status` and
 * `last_reviewed_at` are never written here — the `business_systems_after_score`
 * trigger derives them from `score`, and a second trigger appends the change to
 * `system_scores` — so a re-save with an unchanged score leaves the history alone,
 * exactly like the trigger's own `is distinct from` guard.
 */
export async function updateBusinessSystem(id: string, raw: unknown): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail('invalid');
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success || Object.keys(parsed.data).length === 0) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');

  const { data, error } = await c.sb.from('business_systems').update(parsed.data).eq('id', id).select('id');
  if (error) return fail(error.code === '42501' ? 'forbidden' : 'failed');
  if (!data?.length) return fail('forbidden'); // RLS matched no row
  revalidatePath('/company/health');
  revalidatePath('/overview');
  return ok(undefined);
}
