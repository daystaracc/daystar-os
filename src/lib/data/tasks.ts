import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { monthBounds, weekBounds } from '@/lib/calculations/pacing';
import { localizedField, type Locale } from '@/lib/i18n';
import { canEditTask, canDeleteTask, type Role } from '@/lib/permissions';
import type { TaskPriority, TaskStatus } from '@/lib/tasks/constants';

export const TASK_VIEWS = ['my', 'today', 'week', 'all', 'overdue'] as const;
export const TASK_LAYOUTS = ['list', 'kanban', 'calendar'] as const;
export type TaskView = (typeof TASK_VIEWS)[number];
export type TaskLayout = (typeof TASK_LAYOUTS)[number];

export interface TaskFilters {
  assignee?: string;
  project?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  label?: string;
}

export interface TaskRow {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  labels: string[];
  recurring_rule: string | null;
  project: { id: string; name: string } | null;
  assignee: { id: string; name: string } | null;
  checklist: { done: number; total: number };
  blockedBy: number;
  /** Mirrors RLS so the UI can disable what the database would refuse. */
  canEdit: boolean;
  canDelete: boolean;
}

export interface TaskOptions {
  people: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  labels: string[];
}

export interface TasksPage {
  tasks: TaskRow[];
  options: TaskOptions;
  counts: Record<'my' | 'today' | 'week' | 'overdue', number>;
  asOf: string;
  error: boolean;
}

/** Done tasks stay visible for two weeks so the Kanban "Done" column and the list keep recent context without growing forever. */
const DONE_WINDOW_DAYS = 14;
const shiftDays = (iso: string, days: number) => new Date(Date.parse(iso) + days * 86_400_000).toISOString().slice(0, 10);

const PRIO: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
const STATUS_ORDER: Record<string, number> = { blocked: 0, in_progress: 1, review: 2, todo: 3, backlog: 4, done: 5 };

// Kept as one string literal on purpose: postgrest-js types the result from the literal,
// and concatenating with `+` widens it to `string`, which loses every column type.
const SELECT = 'id, title, status, priority, due_date, labels, recurring_rule, owner_id, assignee_id, created_by, completed_at, projects:project_id(id, name, name_zh), profiles:assignee_id(id, display_name, full_name), task_checklists(id, is_done), task_dependencies!task_dependencies_task_id_fkey(depends_on_task_id)';

const DETAIL_SELECT = 'id, title, status, priority, due_date, labels, recurring_rule, owner_id, assignee_id, created_by, completed_at, description, created_at, projects:project_id(id, name, name_zh), profiles:assignee_id(id, display_name, full_name), task_checklists(id, is_done), task_dependencies!task_dependencies_task_id_fkey(depends_on_task_id), owner:owner_id(id, display_name, full_name), creator:created_by(id, display_name, full_name)';

export async function getTasksPage(
  orgId: string, userId: string, role: Role, locale: Locale,
  view: TaskView, filters: TaskFilters,
  asOf = new Date().toISOString().slice(0, 10),
  /** Set by the calendar layout: also constrain to the visible month (undated tasks stay, listed separately). */
  month?: string,
): Promise<TasksPage> {
  const sb = await createClient();
  const w = weekBounds(asOf);
  const doneSince = shiftDays(asOf, -DONE_WINDOW_DAYS);

  let q = sb.from('tasks').select(SELECT).eq('organization_id', orgId);
  if (month) {
    const mb = monthBounds(`${month}-01`);
    q = q.or(`due_date.is.null,and(due_date.gte.${mb.start},due_date.lte.${mb.end})`);
  }

  // view scope
  if (view === 'my') q = q.eq('assignee_id', userId);
  if (view === 'today') q = q.eq('due_date', asOf);
  if (view === 'week') q = q.gte('due_date', w.start).lte('due_date', w.end);
  if (view === 'overdue') q = q.lt('due_date', asOf).neq('status', 'done');
  // Recently-finished work stays in view everywhere else; "overdue" excludes done by definition.
  if (view !== 'overdue') q = q.or(`status.neq.done,completed_at.gte.${doneSince}`);

  if (filters.assignee) q = filters.assignee === 'none' ? q.is('assignee_id', null) : q.eq('assignee_id', filters.assignee);
  if (filters.project) q = filters.project === 'none' ? q.is('project_id', null) : q.eq('project_id', filters.project);
  if (filters.status) q = q.eq('status', filters.status);
  if (filters.priority) q = q.eq('priority', filters.priority);
  if (filters.label) q = q.contains('labels', [filters.label]);

  const [list, people, projects, allLabels, counts] = await Promise.all([
    q.order('due_date', { ascending: true, nullsFirst: false }).limit(500),
    sb.from('memberships').select('profile_id, profiles:profile_id(id, display_name, full_name)').eq('organization_id', orgId).eq('status', 'active'),
    sb.from('projects').select('id, name, name_zh').eq('organization_id', orgId).not('status', 'in', '("completed","cancelled")').order('name'),
    sb.from('tasks').select('labels').eq('organization_id', orgId),
    viewCounts(sb, orgId, userId, asOf, w),
  ]);

  if (list.error) {
    return { tasks: [], options: { people: [], projects: [], labels: [] }, counts, asOf, error: true };
  }

  const tasks: TaskRow[] = (list.data ?? []).map(t => {
    const checklist = (t.task_checklists ?? []) as { id: string; is_done: boolean }[];
    const perms = { owner_id: t.owner_id, assignee_id: t.assignee_id, created_by: t.created_by };
    return {
      id: t.id,
      title: t.title,
      status: t.status as TaskStatus,
      priority: t.priority as TaskPriority,
      due_date: t.due_date,
      labels: t.labels ?? [],
      recurring_rule: t.recurring_rule,
      project: one(t.projects) ? { id: one(t.projects)!.id, name: localizedField(one(t.projects)!, 'name', locale) } : null,
      assignee: one(t.profiles) ? { id: one(t.profiles)!.id, name: personName(one(t.profiles)!) } : null,
      checklist: { done: checklist.filter(c => c.is_done).length, total: checklist.length },
      blockedBy: (t.task_dependencies ?? []).length,
      canEdit: canEditTask(perms, role, userId),
      canDelete: canDeleteTask(perms, role, userId),
    };
  }).sort(byStatusThenPriority);

  return {
    tasks,
    options: {
      people: (people.data ?? []).map(m => one(m.profiles)).filter(Boolean).map(p => ({ id: p!.id, name: personName(p!) })).sort((a, b) => a.name.localeCompare(b.name)),
      projects: (projects.data ?? []).map(p => ({ id: p.id, name: localizedField(p, 'name', locale) })),
      labels: [...new Set((allLabels.data ?? []).flatMap(t => t.labels ?? []))].sort(),
    },
    counts,
    asOf,
    error: false,
  };
}

async function viewCounts(
  sb: Awaited<ReturnType<typeof createClient>>, orgId: string, userId: string, asOf: string, w: { start: string; end: string },
): Promise<TasksPage['counts']> {
  const head = () => sb.from('tasks').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).neq('status', 'done');
  const [my, today, week, overdue] = await Promise.all([
    head().eq('assignee_id', userId),
    head().eq('due_date', asOf),
    head().gte('due_date', w.start).lte('due_date', w.end),
    head().lt('due_date', asOf),
  ]);
  return { my: my.count ?? 0, today: today.count ?? 0, week: week.count ?? 0, overdue: overdue.count ?? 0 };
}

// ---- detail panel ----------------------------------------------------------

export interface TaskDetail extends TaskRow {
  description: string | null;
  owner: { id: string; name: string } | null;
  createdBy: string | null;
  createdAt: string;
  completedAt: string | null;
  checklistItems: { id: string; title: string; is_done: boolean }[];
  comments: { id: string; body: string; author: string | null; at: string }[];
  dependencies: { id: string; title: string; status: TaskStatus }[];
  activity: { id: string; summary: string; actor: string | null; at: string }[];
  /** Candidates for "Blocked by", excluding itself and tasks already linked. */
  linkable: { id: string; title: string }[];
}

export async function getTaskDetail(orgId: string, taskId: string, userId: string, role: Role, locale: Locale): Promise<TaskDetail | null> {
  const sb = await createClient();
  const { data: t } = await sb.from('tasks').select(DETAIL_SELECT)
    .eq('organization_id', orgId).eq('id', taskId).maybeSingle();
  if (!t) return null;

  const [checklist, comments, deps, activity, siblings] = await Promise.all([
    sb.from('task_checklists').select('id, title, is_done').eq('task_id', taskId).order('sort_order'),
    sb.from('task_comments').select('id, body, created_at, profiles:author_id(display_name, full_name)').eq('task_id', taskId).order('created_at'),
    sb.from('task_dependencies').select('depends_on_task_id, tasks:depends_on_task_id(id, title, status)').eq('task_id', taskId),
    sb.from('activity_logs').select('id, summary, created_at, profiles:actor_id(display_name, full_name)').eq('entity_type', 'tasks').eq('entity_id', taskId).order('created_at', { ascending: false }).limit(20),
    sb.from('tasks').select('id, title').eq('organization_id', orgId).neq('id', taskId).neq('status', 'done').order('title').limit(200),
  ]);

  const dependencyIds = new Set((deps.data ?? []).map(d => d.depends_on_task_id));
  const checklistItems = checklist.data ?? [];
  const perms = { owner_id: t.owner_id, assignee_id: t.assignee_id, created_by: t.created_by };

  return {
    id: t.id,
    title: t.title,
    status: t.status as TaskStatus,
    priority: t.priority as TaskPriority,
    due_date: t.due_date,
    labels: t.labels ?? [],
    recurring_rule: t.recurring_rule,
    project: one(t.projects) ? { id: one(t.projects)!.id, name: localizedField(one(t.projects)!, 'name', locale) } : null,
    assignee: one(t.profiles) ? { id: one(t.profiles)!.id, name: personName(one(t.profiles)!) } : null,
    checklist: { done: checklistItems.filter(c => c.is_done).length, total: checklistItems.length },
    blockedBy: dependencyIds.size,
    canEdit: canEditTask(perms, role, userId),
    canDelete: canDeleteTask(perms, role, userId),

    description: t.description,
    owner: one(t.owner) ? { id: one(t.owner)!.id, name: personName(one(t.owner)!) } : null,
    createdBy: one(t.creator) ? personName(one(t.creator)!) : null,
    createdAt: t.created_at,
    completedAt: t.completed_at,
    checklistItems,
    comments: (comments.data ?? []).map(c => ({ id: c.id, body: c.body, author: one(c.profiles) ? personName(one(c.profiles)!) : null, at: c.created_at })),
    dependencies: (deps.data ?? []).map(d => one(d.tasks)).filter(Boolean).map(x => ({ id: x!.id, title: x!.title, status: x!.status as TaskStatus })),
    activity: (activity.data ?? []).map(a => ({ id: a.id, summary: a.summary, actor: one(a.profiles) ? personName(one(a.profiles)!) : null, at: a.created_at })),
    linkable: (siblings.data ?? []).filter(s => !dependencyIds.has(s.id)),
  };
}

// ---- helpers ---------------------------------------------------------------

/** A `!inner`-less embed comes back as a row or a one-element array depending on the join. */
function one<T>(rel: T | T[] | null | undefined): T | null {
  return (Array.isArray(rel) ? rel[0] : rel) ?? null;
}
function personName(p: { display_name?: string | null; full_name?: string | null }): string {
  return p.display_name || p.full_name || '';
}
function byStatusThenPriority(a: TaskRow, b: TaskRow) {
  return (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9)
    || (PRIO[a.priority] ?? 9) - (PRIO[b.priority] ?? 9)
    || (a.due_date ?? '9999-12-31').localeCompare(b.due_date ?? '9999-12-31');
}

export { monthBounds };
