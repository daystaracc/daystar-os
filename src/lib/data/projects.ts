import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { localizedField, type Locale } from '@/lib/i18n';
import { projectHealth, type ProjectHealth } from '@/lib/calculations/goals';
import type { Role } from '@/lib/permissions';
import type { ProjectStatus } from '@/lib/projects/constants';
import type { TaskPriority, TaskStatus } from '@/lib/tasks/constants';

export interface ProjectRow {
  id: string;
  name: string;
  status: ProjectStatus;
  health: ProjectHealth;
  progress: number;
  totalTasks: number;
  openTasks: number;
  owner: { id: string; name: string } | null;
  department: { id: string; name: string } | null;
  startDate: string | null;
  deadline: string | null;
  budget: number | null;
  /** Mirror the `projects_update` / `projects_delete` RLS policies (manager-or-above / founder-only). */
  canEdit: boolean;
  canDelete: boolean;
}

export interface ProjectOptions {
  people: { id: string; name: string }[];
  departments: { id: string; name: string }[];
}

export interface ProjectsPage {
  projects: ProjectRow[];
  options: ProjectOptions;
  error: boolean;
}

// Kept as one string literal on purpose — see tasks.ts's SELECT/DETAIL_SELECT note:
// postgrest-js types the result from the literal, and building it with `+` widens
// every column to `never`.
const SELECT = 'id, name, name_zh, status, owner_id, department_id, start_date, deadline, budget, profiles:owner_id(id, display_name, full_name), departments:department_id(id, name, name_zh)';
const DETAIL_SELECT = 'id, name, name_zh, status, owner_id, department_id, start_date, deadline, budget, description, notes, created_at, profiles:owner_id(id, display_name, full_name), departments:department_id(id, name, name_zh)';

/** Just the people/department pickers — used by both the list and detail pages without re-fetching every project. */
export async function getProjectOptions(orgId: string, locale: Locale): Promise<ProjectOptions> {
  const sb = await createClient();
  const [people, departments] = await Promise.all([
    sb.from('memberships').select('profile_id, profiles:profile_id(id, display_name, full_name)').eq('organization_id', orgId).eq('status', 'active'),
    sb.from('departments').select('id, name, name_zh').eq('organization_id', orgId).order('sort_order'),
  ]);
  return {
    people: (people.data ?? []).map(m => one(m.profiles)).filter(Boolean).map(p => ({ id: p!.id, name: personName(p!) })).sort((a, b) => a.name.localeCompare(b.name)),
    departments: (departments.data ?? []).map(d => ({ id: d.id, name: localizedField(d, 'name', locale) })),
  };
}

export async function getProjectsPage(orgId: string, role: Role, locale: Locale, asOf = new Date().toISOString().slice(0, 10)): Promise<ProjectsPage> {
  const sb = await createClient();
  const canManage = role === 'founder' || role === 'manager';

  const [list, progress, options] = await Promise.all([
    sb.from('projects').select(SELECT).eq('organization_id', orgId),
    sb.from('v_project_progress').select('*').eq('organization_id', orgId),
    getProjectOptions(orgId, locale),
  ]);

  if (list.error) return { projects: [], options: { people: [], departments: [] }, error: true };

  const progBy = new Map((progress.data ?? []).map(p => [p.project_id, p]));

  const projects: ProjectRow[] = (list.data ?? []).map(p => {
    const pr = progBy.get(p.id);
    const total = Number(pr?.total_tasks ?? 0);
    const done = Number(pr?.done_tasks ?? 0);
    const pct = Number(pr?.progress_pct ?? 0);
    return {
      id: p.id,
      name: localizedField(p, 'name', locale),
      status: p.status as ProjectStatus,
      health: projectHealth({ deadline: p.deadline, progressPct: pct, blocked: Number(pr?.blocked_tasks ?? 0), overdue: Number(pr?.overdue_tasks ?? 0), status: p.status }, asOf),
      progress: pct,
      totalTasks: total,
      openTasks: total - done,
      owner: one(p.profiles) ? { id: one(p.profiles)!.id, name: personName(one(p.profiles)!) } : null,
      department: one(p.departments) ? { id: one(p.departments)!.id, name: localizedField(one(p.departments)!, 'name', locale) } : null,
      startDate: p.start_date,
      deadline: p.deadline,
      budget: p.budget !== null ? Number(p.budget) : null,
      // `projects_update` (generic RLS loop) is manager-or-above; `projects_delete` is founder-only.
      canEdit: canManage,
      canDelete: role === 'founder',
    };
  }).sort((a, b) => healthRank(a.health) - healthRank(b.health) || (a.deadline ?? '9999-12-31').localeCompare(b.deadline ?? '9999-12-31'));

  return { projects, options, error: false };
}

// ---- detail ------------------------------------------------------------------

export interface ProjectMember { profileId: string; name: string; role: 'owner' | 'member' }
export interface ProjectTaskRow { id: string; title: string; status: TaskStatus; priority: TaskPriority; due_date: string | null; assignee: string | null }

export interface ProjectDetail extends ProjectRow {
  description: string | null;
  notes: string | null;
  createdAt: string;
  members: ProjectMember[];
  tasks: ProjectTaskRow[];
}

export async function getProjectDetail(orgId: string, projectId: string, role: Role, locale: Locale, asOf = new Date().toISOString().slice(0, 10)): Promise<ProjectDetail | null> {
  const sb = await createClient();
  const { data: p } = await sb.from('projects').select(DETAIL_SELECT).eq('organization_id', orgId).eq('id', projectId).maybeSingle();
  if (!p) return null;
  const canManage = role === 'founder' || role === 'manager';

  const [progress, members, tasks] = await Promise.all([
    sb.from('v_project_progress').select('*').eq('project_id', projectId).maybeSingle(),
    sb.from('project_members').select('profile_id, role, profiles:profile_id(id, display_name, full_name)').eq('project_id', projectId),
    sb.from('tasks').select('id, title, status, priority, due_date, profiles:assignee_id(display_name, full_name)').eq('project_id', projectId)
      .order('due_date', { ascending: true, nullsFirst: false }).limit(200),
  ]);

  const total = Number(progress.data?.total_tasks ?? 0);
  const done = Number(progress.data?.done_tasks ?? 0);
  const pct = Number(progress.data?.progress_pct ?? 0);

  return {
    id: p.id,
    name: localizedField(p, 'name', locale),
    status: p.status as ProjectStatus,
    health: projectHealth({ deadline: p.deadline, progressPct: pct, blocked: Number(progress.data?.blocked_tasks ?? 0), overdue: Number(progress.data?.overdue_tasks ?? 0), status: p.status }, asOf),
    progress: pct,
    totalTasks: total,
    openTasks: total - done,
    owner: one(p.profiles) ? { id: one(p.profiles)!.id, name: personName(one(p.profiles)!) } : null,
    department: one(p.departments) ? { id: one(p.departments)!.id, name: localizedField(one(p.departments)!, 'name', locale) } : null,
    startDate: p.start_date,
    deadline: p.deadline,
    budget: p.budget !== null ? Number(p.budget) : null,
    canEdit: canManage,
    canDelete: role === 'founder',

    description: p.description,
    notes: p.notes,
    createdAt: p.created_at,
    members: (members.data ?? []).filter(m => one(m.profiles)).map(m => ({ profileId: m.profile_id, name: personName(one(m.profiles)!), role: m.role as 'owner' | 'member' })),
    tasks: (tasks.data ?? []).map(t => ({ id: t.id, title: t.title, status: t.status as TaskStatus, priority: t.priority as TaskPriority, due_date: t.due_date, assignee: one(t.profiles) ? personName(one(t.profiles)!) : null })),
  };
}

// ---- helpers -------------------------------------------------------------

function healthRank(h: ProjectHealth) { return h === 'critical' ? 0 : h === 'at_risk' ? 1 : 2; }
/** A `!inner`-less embed comes back as a row or a one-element array depending on the join — same gotcha as commandCenter.ts / tasks.ts. */
function one<T>(rel: T | T[] | null | undefined): T | null {
  return (Array.isArray(rel) ? rel[0] : rel) ?? null;
}
function personName(p: { display_name?: string | null; full_name?: string | null }): string {
  return p.display_name || p.full_name || '';
}
