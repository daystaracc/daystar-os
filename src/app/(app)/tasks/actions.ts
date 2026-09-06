'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { nextOccurrence } from '@/lib/calculations/recurrence';

import { STATUS, PRIORITY, type ActionResult, type TaskStatus } from '@/lib/tasks/constants';

// Every mutation returns an ActionResult instead of throwing: the client rolls its
// optimistic update back and shows the message. `forbidden` is what an RLS rejection
// looks like — a member editing someone else's task updates zero rows rather than erroring.
const ok = <T,>(data: T): ActionResult<T> => ({ ok: true, data });
const fail = (error: 'forbidden' | 'invalid' | 'failed'): ActionResult<never> => ({ ok: false, error });

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** null | daily | weekdays | weekly:MON…SUN | monthly:1-31 | monthly:last */
const recurringRule = z.string().regex(/^(daily|weekdays|weekly:(MON|TUE|WED|THU|FRI|SAT|SUN)|monthly:(last|[1-9]|[12][0-9]|3[01]))$/);

const emptyToNull = <T extends z.ZodTypeAny>(s: T) =>
  z.preprocess(v => (v === '' || v === undefined ? null : v), s.nullable());

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  assignee_id: emptyToNull(uuid),
  due_date: emptyToNull(isoDate),
  priority: z.enum(PRIORITY).default('medium'),
  project_id: emptyToNull(uuid),
  description: emptyToNull(z.string().max(5000)),
  recurring_rule: emptyToNull(recurringRule),
  labels: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  checklist: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
  dependsOn: z.array(uuid).max(20).default([]),
});

const updateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  assignee_id: emptyToNull(uuid).optional(),
  due_date: emptyToNull(isoDate).optional(),
  priority: z.enum(PRIORITY).optional(),
  project_id: emptyToNull(uuid).optional(),
  description: emptyToNull(z.string().max(5000)).optional(),
  recurring_rule: emptyToNull(recurringRule).optional(),
  labels: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  status: z.enum(STATUS).optional(),
});

function refresh() {
  revalidatePath('/tasks');
  revalidatePath('/overview');
  revalidatePath('/my-work');
}

async function ctx() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data: m } = await sb.from('memberships').select('organization_id, role').eq('profile_id', user.id).eq('status', 'active').limit(1).single();
  if (!m) return null;
  return { sb, user, orgId: m.organization_id, role: m.role };
}

/** New Task drawer: Title · Assignee · Due date · Priority · Project, plus the Advanced fields. */
export async function createTask(raw: unknown): Promise<ActionResult<string>> {
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');
  const { checklist, dependsOn, ...task } = parsed.data;

  const { data, error } = await c.sb.from('tasks').insert({
    ...task,
    organization_id: c.orgId,
    owner_id: task.assignee_id ?? c.user.id,
    assignee_id: task.assignee_id ?? c.user.id,
    created_by: c.user.id,
    status: 'todo',
  }).select('id').single();
  if (error || !data) return fail(error?.code === '42501' ? 'forbidden' : 'failed');

  if (checklist.length) {
    await c.sb.from('task_checklists').insert(checklist.map((title, i) => ({ task_id: data.id, title, sort_order: i })));
  }
  if (dependsOn.length) {
    await c.sb.from('task_dependencies').insert(dependsOn.map(id => ({ task_id: data.id, depends_on_task_id: id })));
  }
  refresh();
  return ok(data.id);
}

/** Drawer edit and the detail panel's inline fields. */
export async function updateTask(id: string, raw: unknown): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail('invalid');
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success || Object.keys(parsed.data).length === 0) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');
  const { data, error } = await c.sb.from('tasks').update(parsed.data).eq('id', id).select('id');
  if (error) return fail('failed');
  if (!data?.length) return fail('forbidden'); // RLS matched no row
  refresh();
  return ok(undefined);
}

/** Inline status change: kanban drop, list select. RLS decides who may update. */
export async function setTaskStatus(id: string, status: TaskStatus): Promise<ActionResult> {
  if (!uuid.safeParse(id).success || !STATUS.includes(status)) return fail('invalid');
  if (status === 'done') return completeTask(id);
  const c = await ctx();
  if (!c) return fail('forbidden');
  const { data, error } = await c.sb.from('tasks').update({ status }).eq('id', id).select('id');
  if (error) return fail('failed');
  if (!data?.length) return fail('forbidden');
  refresh();
  return ok(undefined);
}

/**
 * Completing a recurring task spawns the next occurrence
 * (daily / weekdays / weekly:FRI / monthly:1 | monthly:last).
 */
export async function completeTask(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');
  const { data: rows, error } = await c.sb.from('tasks').update({ status: 'done', completed_by: c.user.id }).eq('id', id).select('*');
  if (error) return fail('failed');
  const t = rows?.[0];
  if (!t) return fail('forbidden');

  if (t.recurring_rule && t.due_date) {
    const next = nextOccurrence(t.due_date, t.recurring_rule);
    if (next) {
      await c.sb.from('tasks').insert({
        organization_id: t.organization_id, project_id: t.project_id, department_id: t.department_id,
        title: t.title, description: t.description, owner_id: t.owner_id, assignee_id: t.assignee_id,
        priority: t.priority, status: 'todo', due_date: next, labels: t.labels,
        recurring_rule: t.recurring_rule, recurring_parent_id: t.recurring_parent_id ?? t.id, created_by: c.user.id,
      });
    }
  }
  refresh();
  return ok(undefined);
}

export async function deleteTask(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');
  const { data, error } = await c.sb.from('tasks').delete().eq('id', id).select('id');
  if (error) return fail('failed');
  if (!data?.length) return fail('forbidden');
  refresh();
  return ok(undefined);
}

// ---- checklist -------------------------------------------------------------

export async function addChecklistItem(taskId: string, title: string): Promise<ActionResult<string>> {
  const parsed = z.object({ taskId: uuid, title: z.string().trim().min(1).max(200) }).safeParse({ taskId, title });
  if (!parsed.success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');
  const { count } = await c.sb.from('task_checklists').select('id', { count: 'exact', head: true }).eq('task_id', taskId);
  const { data, error } = await c.sb.from('task_checklists')
    .insert({ task_id: taskId, title: parsed.data.title, sort_order: count ?? 0 }).select('id').single();
  if (error || !data) return fail('failed');
  refresh();
  return ok(data.id);
}

export async function setChecklistItemDone(id: string, isDone: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');
  const { error } = await c.sb.from('task_checklists').update({ is_done: isDone }).eq('id', id);
  if (error) return fail('failed');
  refresh();
  return ok(undefined);
}

export async function deleteChecklistItem(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');
  const { error } = await c.sb.from('task_checklists').delete().eq('id', id);
  if (error) return fail('failed');
  refresh();
  return ok(undefined);
}

// ---- comments --------------------------------------------------------------

export async function addComment(taskId: string, body: string): Promise<ActionResult> {
  const parsed = z.object({ taskId: uuid, body: z.string().trim().min(1).max(4000) }).safeParse({ taskId, body });
  if (!parsed.success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');
  // The insert policy requires author_id = auth.uid().
  const { error } = await c.sb.from('task_comments').insert({ task_id: taskId, body: parsed.data.body, author_id: c.user.id });
  if (error) return fail('failed');
  refresh();
  return ok(undefined);
}

// ---- dependencies ----------------------------------------------------------

export async function addDependency(taskId: string, dependsOnTaskId: string): Promise<ActionResult> {
  const parsed = z.object({ taskId: uuid, dependsOnTaskId: uuid }).safeParse({ taskId, dependsOnTaskId });
  if (!parsed.success || taskId === dependsOnTaskId) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');
  const { error } = await c.sb.from('task_dependencies').insert({ task_id: taskId, depends_on_task_id: dependsOnTaskId });
  if (error) return fail(error.code === '23505' ? 'invalid' : 'failed'); // already linked
  refresh();
  return ok(undefined);
}

export async function removeDependency(taskId: string, dependsOnTaskId: string): Promise<ActionResult> {
  const parsed = z.object({ taskId: uuid, dependsOnTaskId: uuid }).safeParse({ taskId, dependsOnTaskId });
  if (!parsed.success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');
  const { error } = await c.sb.from('task_dependencies').delete().eq('task_id', taskId).eq('depends_on_task_id', dependsOnTaskId);
  if (error) return fail('failed');
  refresh();
  return ok(undefined);
}
