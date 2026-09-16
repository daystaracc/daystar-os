'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/lib/team/constants';

const ok = <T,>(data: T): ActionResult<T> => ({ ok: true, data });
const fail = (error: 'forbidden' | 'invalid' | 'failed'): ActionResult<never> => ({ ok: false, error });

const uuid = z.string().uuid();
const emptyToNull = <T extends z.ZodTypeAny>(s: T) =>
  z.preprocess(v => (v === '' || v === undefined ? null : v), s.nullable());

/**
 * Unlike Reviews/Marketing/CRM's `ctx()`, this one does NOT bake a role check
 * in — `/team` itself is readable by every active member (see the file-level
 * note in lib/team/constants.ts), so the page never redirects anyone away.
 * `updateMembership` below checks founder-only itself, mirroring
 * `memberships_write` RLS, the same "gate the mutation, not the page" shape
 * Products/Goals/Projects already use for their manager-or-above writes.
 */
async function ctx() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data: m } = await sb.from('memberships').select('organization_id, role').eq('profile_id', user.id).eq('status', 'active').limit(1).single();
  if (!m) return null;
  return { sb, user, orgId: m.organization_id, role: m.role as 'founder' | 'manager' | 'member' };
}

function refresh() {
  revalidatePath('/team');
}

const updateMembershipSchema = z.object({
  role: z.enum(['founder', 'manager', 'member']),
  title: emptyToNull(z.string().max(200)),
  departmentId: emptyToNull(uuid),
  managerId: emptyToNull(uuid),
  status: z.enum(['active', 'inactive']),
  startDate: emptyToNull(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
});

/**
 * `memberships_write` RLS is founder-only for every operation, so this is
 * checked here rather than left to RLS alone. One extra guard the database
 * doesn't enforce: a founder can't demote *themselves* away from founder
 * through this form (the role field is disabled client-side for your own row
 * — see MembershipDrawer.tsx) — re-checked here too, since a client-side
 * disable is a UX nicety, not a security boundary.
 */
export async function updateMembership(id: string, raw: unknown): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail('invalid');
  const parsed = updateMembershipSchema.safeParse(raw);
  if (!parsed.success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');
  if (c.role !== 'founder') return fail('forbidden');

  const { data: target } = await c.sb.from('memberships').select('profile_id, role').eq('id', id).single();
  if (!target) return fail('forbidden');
  if (target.profile_id === c.user.id && parsed.data.role !== 'founder') return fail('invalid');

  const { departmentId, managerId, startDate, ...rest } = parsed.data;
  const { data, error } = await c.sb.from('memberships')
    .update({ ...rest, department_id: departmentId, manager_id: managerId, start_date: startDate })
    .eq('id', id).select('id');
  if (error) return fail('failed');
  if (!data?.length) return fail('forbidden');
  refresh();
  return ok(undefined);
}
