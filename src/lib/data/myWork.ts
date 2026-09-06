import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { projectHealth, type ProjectHealth } from '@/lib/calculations/goals';
import { localizedField, type Bilingual, type Locale } from '@/lib/i18n';

export interface MyWorkTask { id: string; title: string; status: string; priority: string; due_date: string | null; assignee: string | null; project: string | null }
export interface MyWorkProject { id: string; name: string; progress: number; health: ProjectHealth; deadline: string | null; open: number }

/** Everything My Work renders: the signed-in person's open tasks split by urgency, and the projects they are on. */
export interface MyWorkData {
  asOf: string;
  remaining: number;
  overdue: MyWorkTask[];
  today: MyWorkTask[];
  upcoming: MyWorkTask[];
  projects: MyWorkProject[];
}

export async function getMyWork(orgId: string, userId: string, locale: Locale, asOf = new Date().toISOString().slice(0, 10)): Promise<MyWorkData> {
  const sb = await createClient();

  const [tasks, memberships, progress] = await Promise.all([
    sb.from('tasks')
      .select('id, title, status, priority, due_date, assignee_id, projects:project_id(name, name_zh), profiles:assignee_id(display_name)')
      .eq('organization_id', orgId).eq('assignee_id', userId).neq('status', 'done')
      .order('due_date', { ascending: true, nullsFirst: false }),
    sb.from('project_members').select('project_id, projects(id, name, name_zh, status, deadline, organization_id)').eq('profile_id', userId),
    sb.from('v_project_progress').select('*').eq('organization_id', orgId),
  ]);

  const rows: MyWorkTask[] = (tasks.data ?? []).map(t => ({
    id: t.id, title: localizedField(t, 'title', locale), status: t.status, priority: t.priority, due_date: t.due_date,
    assignee: nameOf(t.profiles), project: localizedNameOf(t.projects, locale),
  })).sort(byPriority);

  const progressBy = new Map((progress.data ?? []).map(p => [p.project_id, p]));
  const projects: MyWorkProject[] = (memberships.data ?? [])
    .map(m => (Array.isArray(m.projects) ? m.projects[0] : m.projects))
    .filter((p): p is NonNullable<typeof p> => !!p && p.organization_id === orgId && !['completed', 'cancelled'].includes(p.status))
    .map(p => {
      const pr = progressBy.get(p.id);
      const pct = Number(pr?.progress_pct ?? 0);
      return {
        id: p.id, name: localizedField(p, 'name', locale), progress: pct, deadline: p.deadline,
        open: Number(pr?.total_tasks ?? 0) - Number(pr?.done_tasks ?? 0),
        health: projectHealth({ deadline: p.deadline, progressPct: pct, blocked: Number(pr?.blocked_tasks ?? 0), overdue: Number(pr?.overdue_tasks ?? 0), status: p.status }, asOf),
      };
    })
    .sort((a, b) => healthRank(a.health) - healthRank(b.health) || a.progress - b.progress);

  return {
    asOf,
    remaining: rows.length,
    overdue: rows.filter(t => t.due_date !== null && t.due_date < asOf),
    today: rows.filter(t => t.due_date === asOf),
    upcoming: rows.filter(t => t.due_date === null || t.due_date > asOf),
    projects,
  };
}

const PRIO: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
function byPriority(a: MyWorkTask, b: MyWorkTask) {
  return (PRIO[a.priority] ?? 9) - (PRIO[b.priority] ?? 9) || (a.due_date ?? '9999-12-31').localeCompare(b.due_date ?? '9999-12-31');
}
function healthRank(h: ProjectHealth) { return h === 'critical' ? 0 : h === 'at_risk' ? 1 : 2; }
function nameOf(rel: unknown): string | null {
  const x = Array.isArray(rel) ? rel[0] : rel;
  return (x as { display_name?: string } | null)?.display_name ?? null;
}

/** An embedded project comes back as a row or a one-element array depending on the join. */
function localizedNameOf(rel: unknown, locale: Locale): string | null {
  const x = (Array.isArray(rel) ? rel[0] : rel) as Bilingual<'name'> | null | undefined;
  return x ? localizedField(x, 'name', locale) || null : null;
}
