'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { GOAL_LEVEL, GOAL_STATUS, OBJECTIVE_PERIOD, KR_UNIT, KR_DIRECTION, type ActionResult } from '@/lib/goals/constants';

// Every mutation returns an ActionResult instead of throwing — same pattern as
// app/(app)/tasks/actions.ts, app/(app)/revenue/actions.ts and app/(app)/projects/actions.ts.
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

/** `goals_insert/update`, `objectives_insert/update`, `key_results_insert/update` RLS (generic loop, migration 0002): manager-or-above. Delete is founder-only. */
function canManage(role: string) { return role === 'founder' || role === 'manager'; }

function refresh(goalId?: string) {
  revalidatePath('/goals');
  revalidatePath('/overview');
  if (goalId) revalidatePath(`/goals/${goalId}`);
}

// ---- goals -------------------------------------------------------------

const createGoalSchema = z.object({
  title: z.string().trim().min(1).max(200),
  level: z.enum(GOAL_LEVEL),
  status: z.enum(GOAL_STATUS).default('draft'),
  owner_id: emptyToNull(uuid),
  start_date: emptyToNull(isoDate),
  end_date: emptyToNull(isoDate),
  description: emptyToNull(z.string().max(5000)),
});
// Every field explicitly `.optional()` (not `.partial()`) — same style as
// tasks/actions.ts and projects/actions.ts's updateSchema.
const updateGoalSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  level: z.enum(GOAL_LEVEL).optional(),
  status: z.enum(GOAL_STATUS).optional(),
  owner_id: emptyToNull(uuid).optional(),
  start_date: emptyToNull(isoDate).optional(),
  end_date: emptyToNull(isoDate).optional(),
  description: emptyToNull(z.string().max(5000)).optional(),
});

export async function createGoal(raw: unknown): Promise<ActionResult<string>> {
  const parsed = createGoalSchema.safeParse(raw);
  if (!parsed.success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');
  if (!canManage(c.role)) return fail('forbidden');

  const { data, error } = await c.sb.from('goals')
    .insert({ ...parsed.data, organization_id: c.orgId, created_by: c.user.id }).select('id').single();
  if (error || !data) return fail(error?.code === '42501' ? 'forbidden' : 'failed');
  refresh();
  return ok(data.id);
}

export async function updateGoal(id: string, raw: unknown): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail('invalid');
  const parsed = updateGoalSchema.safeParse(raw);
  if (!parsed.success || Object.keys(parsed.data).length === 0) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');
  if (!canManage(c.role)) return fail('forbidden');

  const { data, error } = await c.sb.from('goals').update(parsed.data).eq('id', id).select('id');
  if (error) return fail('failed');
  if (!data?.length) return fail('forbidden'); // RLS matched no row
  refresh(id);
  return ok(undefined);
}

/** `goals_delete` RLS: founder-only, stricter than insert/update. Deletes cascade to objectives/key_results. */
export async function deleteGoal(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');
  if (c.role !== 'founder') return fail('forbidden');

  const { data, error } = await c.sb.from('goals').delete().eq('id', id).select('id');
  if (error) return fail('failed');
  if (!data?.length) return fail('forbidden');
  refresh();
  return ok(undefined);
}

// ---- objectives ----------------------------------------------------------

const createObjectiveSchema = z.object({
  goal_id: uuid,
  title: z.string().trim().min(1).max(200),
  period_type: z.enum(OBJECTIVE_PERIOD),
  status: z.enum(GOAL_STATUS).default('draft'),
  owner_id: emptyToNull(uuid),
  start_date: emptyToNull(isoDate),
  end_date: emptyToNull(isoDate),
});
const updateObjectiveSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  period_type: z.enum(OBJECTIVE_PERIOD).optional(),
  status: z.enum(GOAL_STATUS).optional(),
  owner_id: emptyToNull(uuid).optional(),
  start_date: emptyToNull(isoDate).optional(),
  end_date: emptyToNull(isoDate).optional(),
});

export async function createObjective(raw: unknown): Promise<ActionResult<string>> {
  const parsed = createObjectiveSchema.safeParse(raw);
  if (!parsed.success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');
  if (!canManage(c.role)) return fail('forbidden');

  const { data, error } = await c.sb.from('objectives')
    .insert({ ...parsed.data, organization_id: c.orgId, created_by: c.user.id }).select('id').single();
  if (error || !data) return fail(error?.code === '42501' ? 'forbidden' : 'failed');
  refresh(parsed.data.goal_id);
  return ok(data.id);
}

export async function updateObjective(id: string, goalId: string, raw: unknown): Promise<ActionResult> {
  if (!uuid.safeParse(id).success || !uuid.safeParse(goalId).success) return fail('invalid');
  const parsed = updateObjectiveSchema.safeParse(raw);
  if (!parsed.success || Object.keys(parsed.data).length === 0) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');
  if (!canManage(c.role)) return fail('forbidden');

  const { data, error } = await c.sb.from('objectives').update(parsed.data).eq('id', id).select('id');
  if (error) return fail('failed');
  if (!data?.length) return fail('forbidden');
  refresh(goalId);
  return ok(undefined);
}

export async function deleteObjective(id: string, goalId: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success || !uuid.safeParse(goalId).success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');
  // `objectives_delete` RLS (same generic loop as goals/projects/key_results): founder-only.
  if (c.role !== 'founder') return fail('forbidden');

  const { data, error } = await c.sb.from('objectives').delete().eq('id', id).select('id');
  if (error) return fail('failed');
  if (!data?.length) return fail('forbidden');
  refresh(goalId);
  return ok(undefined);
}

// ---- key results ---------------------------------------------------------

const createKeyResultSchema = z.object({
  objective_id: uuid,
  title: z.string().trim().min(1).max(200),
  unit: z.enum(KR_UNIT).default('count'),
  direction: z.enum(KR_DIRECTION).default('increase'),
  start_value: z.coerce.number(),
  current_value: z.coerce.number(),
  target_value: z.coerce.number(),
  deadline: emptyToNull(isoDate),
  owner_id: emptyToNull(uuid),
  notes: emptyToNull(z.string().max(2000)),
});
const updateKeyResultSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  unit: z.enum(KR_UNIT).optional(),
  direction: z.enum(KR_DIRECTION).optional(),
  start_value: z.coerce.number().optional(),
  current_value: z.coerce.number().optional(),
  target_value: z.coerce.number().optional(),
  deadline: emptyToNull(isoDate).optional(),
  owner_id: emptyToNull(uuid).optional(),
  notes: emptyToNull(z.string().max(2000)).optional(),
});

export async function createKeyResult(raw: unknown): Promise<ActionResult<string>> {
  const parsed = createKeyResultSchema.safeParse(raw);
  if (!parsed.success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');
  if (!canManage(c.role)) return fail('forbidden');

  const { data, error } = await c.sb.from('key_results')
    .insert({ ...parsed.data, organization_id: c.orgId, created_by: c.user.id, last_updated_at: new Date().toISOString() }).select('id').single();
  if (error || !data) return fail(error?.code === '42501' ? 'forbidden' : 'failed');
  refresh();
  return ok(data.id);
}

export async function updateKeyResult(id: string, goalId: string, raw: unknown): Promise<ActionResult> {
  if (!uuid.safeParse(id).success || !uuid.safeParse(goalId).success) return fail('invalid');
  const parsed = updateKeyResultSchema.safeParse(raw);
  if (!parsed.success || Object.keys(parsed.data).length === 0) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');
  if (!canManage(c.role)) return fail('forbidden');

  const { data, error } = await c.sb.from('key_results').update({ ...parsed.data, last_updated_at: new Date().toISOString() }).eq('id', id).select('id');
  if (error) return fail('failed');
  if (!data?.length) return fail('forbidden');
  refresh(goalId);
  return ok(undefined);
}

/** Lighter path for the inline "update this period's progress" control on the detail page — only ever touches `current_value`. */
export async function updateKeyResultValue(id: string, goalId: string, currentValue: number): Promise<ActionResult> {
  if (!uuid.safeParse(id).success || !uuid.safeParse(goalId).success) return fail('invalid');
  if (!Number.isFinite(currentValue)) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');
  if (!canManage(c.role)) return fail('forbidden');

  const { data, error } = await c.sb.from('key_results').update({ current_value: currentValue, last_updated_at: new Date().toISOString() }).eq('id', id).select('id');
  if (error) return fail('failed');
  if (!data?.length) return fail('forbidden');
  refresh(goalId);
  return ok(undefined);
}

export async function deleteKeyResult(id: string, goalId: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success || !uuid.safeParse(goalId).success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');
  if (c.role !== 'founder') return fail('forbidden');

  const { data, error } = await c.sb.from('key_results').delete().eq('id', id).select('id');
  if (error) return fail('failed');
  if (!data?.length) return fail('forbidden');
  refresh(goalId);
  return ok(undefined);
}
