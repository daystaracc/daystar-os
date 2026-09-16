'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { SOP_CATEGORY, SOP_STATUS, type ActionResult } from '@/lib/sops/constants';

// Every mutation returns an ActionResult instead of throwing — same pattern as every
// other screen this session (see app/(app)/tasks/actions.ts for the original).
const ok = <T,>(data: T): ActionResult<T> => ({ ok: true, data });
const fail = (error: 'forbidden' | 'invalid' | 'failed'): ActionResult<never> => ({ ok: false, error });

const uuid = z.string().uuid();
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

/** `sops_insert/update` RLS (generic loop, migration 0002): manager-or-above. Delete is founder-only. */
function canManage(role: string) { return role === 'founder' || role === 'manager'; }

function refresh(sopId?: string) {
  revalidatePath('/sops');
  if (sopId) revalidatePath(`/sops/${sopId}`);
}

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  category: z.enum(SOP_CATEGORY).default('other'),
  status: z.enum(SOP_STATUS).default('draft'),
  owner_id: emptyToNull(uuid),
  content_md: z.string().max(50000).default(''),
});
// Every field explicitly `.optional()` — same style as products/actions.ts.
const updateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  category: z.enum(SOP_CATEGORY).optional(),
  status: z.enum(SOP_STATUS).optional(),
  owner_id: emptyToNull(uuid).optional(),
  content_md: z.string().max(50000).optional(),
});

export async function createSop(raw: unknown): Promise<ActionResult<string>> {
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');
  if (!canManage(c.role)) return fail('forbidden');

  const { data, error } = await c.sb.from('sops')
    .insert({ ...parsed.data, organization_id: c.orgId, created_by: c.user.id, version: 1 }).select('id').single();
  if (error || !data) return fail(error?.code === '42501' ? 'forbidden' : 'failed');
  refresh();
  return ok(data.id);
}

/**
 * `version` has no database trigger behind it (unlike Company Health's score
 * history) — it's a plain int column the app is responsible for bumping. This only
 * increments it when `content_md` is part of the save AND actually changed;
 * relabeling the title or reassigning the owner doesn't count as a new version.
 * That read-before-write also means a save can't silently regress `version` if two
 * people edit at once — worst case is a version number that undercounts, never one
 * that overcounts or goes backwards.
 */
export async function updateSop(id: string, raw: unknown): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail('invalid');
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success || Object.keys(parsed.data).length === 0) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');
  if (!canManage(c.role)) return fail('forbidden');

  const patch: typeof parsed.data & { version?: number } = { ...parsed.data };
  if (parsed.data.content_md !== undefined) {
    const { data: current } = await c.sb.from('sops').select('content_md, version').eq('id', id).maybeSingle();
    if (current && current.content_md !== parsed.data.content_md) patch.version = current.version + 1;
  }

  const { data, error } = await c.sb.from('sops').update(patch).eq('id', id).select('id');
  if (error) return fail('failed');
  if (!data?.length) return fail('forbidden'); // RLS matched no row
  refresh(id);
  return ok(undefined);
}

/** `sops_delete` RLS: founder-only. */
export async function deleteSop(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');
  if (c.role !== 'founder') return fail('forbidden');

  const { data, error } = await c.sb.from('sops').delete().eq('id', id).select('id');
  if (error) return fail('failed');
  if (!data?.length) return fail('forbidden');
  refresh();
  return ok(undefined);
}
