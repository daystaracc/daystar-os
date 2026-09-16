'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { PROJECT_STATUS, type ActionResult } from '@/lib/projects/constants';

// Every mutation returns an ActionResult instead of throwing — same pattern as
// app/(app)/tasks/actions.ts and app/(app)/revenue/actions.ts.
const ok = <T,>(data: T): ActionResult<T> => ({ ok: true, data });
const fail = (error: 'forbidden' | 'invalid' | 'failed'): ActionResult<never> => ({ ok: false, error });

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const emptyToNull = <T extends z.ZodTypeAny>(s: T) =>
  z.preprocess(v => (v === '' || v === undefined ? null : v), s.nullable());

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  owner_id: emptyToNull(uuid),
  department_id: emptyToNull(uuid),
  status: z.enum(PROJECT_STATUS).default('planning'),
  start_date: emptyToNull(isoDate),
  deadline: emptyToNull(isoDate),
  budget: emptyToNull(z.coerce.number().min(0).max(1_000_000_000)),
  description: emptyToNull(z.string().max(5000)),
  notes: emptyToNull(z.string().max(5000)),
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  owner_id: emptyToNull(uuid).optional(),
  department_id: emptyToNull(uuid).optional(),
  status: z.enum(PROJECT_STATUS).optional(),
  start_date: emptyToNull(isoDate).optional(),
  deadline: emptyToNull(isoDate).optional(),
  budget: emptyToNull(z.coerce.number().min(0).max(1_000_000_000)).optional(),
  description: emptyToNull(z.string().max(5000)).optional(),
  notes: emptyToNull(z.string().max(5000)).optional(),
});

function refresh(id?: string) {
  revalidatePath('/projects');
  revalidatePath('/overview');
  if (id) revalidatePath(`/projects/${id}`);
}

async function ctx() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data: m } = await sb.from('memberships').select('organization_id, role').eq('profile_id', user.id).eq('status', 'active').limit(1).single();
  if (!m) return null;
  return { sb, user, orgId: m.organization_id, role: m.role };
}

/** `projects_insert` / `projects_update` RLS (generic loop, migration 0002): manager-or-above. */
function canManage(role: string) { return role === 'founder' || role === 'manager'; }

export async function createProject(raw: unknown): Promise<ActionResult<string>> {
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');
  if (!canManage(c.role)) return fail('forbidden');

  const { data, error } = await c.sb.from('projects')
    .insert({ ...parsed.data, organization_id: c.orgId, created_by: c.user.id }).select('id').single();
  if (error || !data) return fail(error?.code === '42501' ? 'forbidden' : 'failed');
  refresh();
  return ok(data.id);
}

export async function updateProject(id: string, raw: unknown): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail('invalid');
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success || Object.keys(parsed.data).length === 0) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');
  if (!canManage(c.role)) return fail('forbidden');

  const { data, error } = await c.sb.from('projects').update(parsed.data).eq('id', id).select('id');
  if (error) return fail('failed');
  if (!data?.length) return fail('forbidden'); // RLS matched no row
  refresh(id);
  return ok(undefined);
}

/** `projects_delete` RLS: founder-only, stricter than insert/update. */
export async function deleteProject(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');
  if (c.role !== 'founder') return fail('forbidden');

  const { data, error } = await c.sb.from('projects').delete().eq('id', id).select('id');
  if (error) return fail('failed');
  if (!data?.length) return fail('forbidden');
  refresh();
  return ok(undefined);
}

// ---- members ---------------------------------------------------------------
// `project_members_write` RLS: manager-or-above on the parent project's organization.

export async function addProjectMember(projectId: string, profileId: string): Promise<ActionResult> {
  const parsed = z.object({ projectId: uuid, profileId: uuid }).safeParse({ projectId, profileId });
  if (!parsed.success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');
  if (!canManage(c.role)) return fail('forbidden');

  const { error } = await c.sb.from('project_members').insert({ project_id: projectId, profile_id: profileId });
  if (error) return fail(error.code === '23505' ? 'invalid' : 'failed'); // already a member
  refresh(projectId);
  return ok(undefined);
}

export async function removeProjectMember(projectId: string, profileId: string): Promise<ActionResult> {
  const parsed = z.object({ projectId: uuid, profileId: uuid }).safeParse({ projectId, profileId });
  if (!parsed.success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');
  if (!canManage(c.role)) return fail('forbidden');

  const { error } = await c.sb.from('project_members').delete().eq('project_id', projectId).eq('profile_id', profileId);
  if (error) return fail('failed');
  refresh(projectId);
  return ok(undefined);
}
