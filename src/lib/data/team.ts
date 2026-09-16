import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { localizedField, type Locale } from '@/lib/i18n';

/**
 * Team (spec §13). See the file-level note in lib/team/constants.ts for the
 * permission picture — this is the one screen this session where reading is
 * open to every active member, not just founder/manager.
 *
 * Workload ("who is loaded?") is a live count of each member's open tasks and
 * overdue tasks, computed the same way `getMyWork` does for a single person
 * (lib/data/myWork.ts) — just fetched once for the whole org and rolled up in
 * JS per assignee, same shape as Marketing's campaign-metrics rollup.
 *
 * Departments and department management (create/edit/delete) are deliberately
 * not built this pass — this screen reads whatever departments already exist
 * (for display and for the edit drawer's dropdown) but doesn't manage them; the
 * core "who owns what, who is loaded" question doesn't need it, and there's no
 * `supabase/seed.sql` in this sandbox to know whether Lucas already has a real
 * department list worth preserving. A reasonable follow-up once departments
 * themselves need editing, same category of deferral as CRM's customer import.
 */

export interface MembershipRow {
  id: string; profileId: string; name: string; email: string | null; avatarUrl: string | null;
  role: 'founder' | 'manager' | 'member'; title: string | null;
  departmentId: string | null; departmentName: string | null;
  managerId: string | null; managerName: string | null;
  status: 'active' | 'inactive'; startDate: string | null;
  openTasks: number; overdueTasks: number;
}

export interface TeamOptions { departments: { id: string; name: string }[]; people: { id: string; name: string }[] }
export interface TeamPage { rows: MembershipRow[]; options: TeamOptions; error: boolean }

// A single string literal, not built with `+` — string concatenation widens to
// plain `string` at the type level, which is what broke this (postgrest-js can
// only statically parse a literal select string; a widened one falls back to a
// `GenericStringError` row type, which is why every embedded field below failed).
const MEMBERSHIP_SELECT = 'id, profile_id, role, title, department_id, manager_id, status, start_date, profile:profile_id(id, display_name, full_name, email, avatar_url), department:department_id(id, name, name_zh), manager:manager_id(id, display_name, full_name)';

export async function getTeamPage(orgId: string, locale: Locale, asOf = new Date().toISOString().slice(0, 10)): Promise<TeamPage> {
  const sb = await createClient();
  const [membershipsRes, tasksRes] = await Promise.all([
    sb.from('memberships').select(MEMBERSHIP_SELECT).eq('organization_id', orgId).order('role').order('start_date'),
    sb.from('tasks').select('assignee_id, status, due_date').eq('organization_id', orgId).not('assignee_id', 'is', null).neq('status', 'done'),
  ]);
  if (membershipsRes.error) return { rows: [], options: { departments: [], people: [] }, error: true };

  const workload = new Map<string, { open: number; overdue: number }>();
  for (const t of tasksRes.data ?? []) {
    const id = t.assignee_id as string;
    const w = workload.get(id) ?? { open: 0, overdue: 0 };
    w.open += 1;
    if (t.due_date && t.due_date < asOf) w.overdue += 1;
    workload.set(id, w);
  }

  const rows: MembershipRow[] = (membershipsRes.data ?? []).map(m => {
    const profile = one(m.profile);
    const dept = one(m.department);
    const manager = one(m.manager);
    const w = workload.get(m.profile_id) ?? { open: 0, overdue: 0 };
    return {
      id: m.id, profileId: m.profile_id, name: profile ? personName(profile) : '', email: profile?.email ?? null, avatarUrl: profile?.avatar_url ?? null,
      role: m.role as MembershipRow['role'], title: m.title,
      departmentId: dept?.id ?? null, departmentName: dept ? localizedField(dept, 'name', locale) : null,
      managerId: manager?.id ?? null, managerName: manager ? personName(manager) : null,
      status: m.status as MembershipRow['status'], startDate: m.start_date,
      openTasks: w.open, overdueTasks: w.overdue,
    };
  });

  const departments = uniqueById(rows.filter(r => r.departmentId).map(r => ({ id: r.departmentId!, name: r.departmentName! })))
    .sort((a, b) => a.name.localeCompare(b.name));
  const people = rows.map(r => ({ id: r.profileId, name: r.name })).sort((a, b) => a.name.localeCompare(b.name));

  return { rows, options: { departments, people }, error: false };
}

// ---- helpers -------------------------------------------------------------

function one<T>(rel: T | T[] | null | undefined): T | null {
  return (Array.isArray(rel) ? rel[0] : rel) ?? null;
}

function personName(p: { display_name?: string | null; full_name?: string | null }): string {
  return p.display_name || p.full_name || '';
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  return [...new Map(items.map(i => [i.id, i])).values()];
}
