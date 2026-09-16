import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { localizedField, type Locale } from '@/lib/i18n';
import { keyResultProgress, keyResultStatus, averageProgress, type KrStatus } from '@/lib/calculations/goals';
import type { Role } from '@/lib/permissions';
import type { GoalLevel, GoalStatus, ObjectivePeriod, KrUnit, KrDirection } from '@/lib/goals/constants';

export interface GoalRow {
  id: string;
  title: string;
  level: GoalLevel;
  status: GoalStatus;
  owner: { id: string; name: string } | null;
  startDate: string | null;
  endDate: string | null;
  objectiveCount: number;
  /** Average of every key result's progress across every objective under this goal. `null` when there are none yet. */
  progress: number | null;
  /** Mirrors `goals_update` / `goals_delete` RLS (manager-or-above / founder-only — same generic loop as Projects). */
  canEdit: boolean;
  canDelete: boolean;
}

export interface GoalOptions { people: { id: string; name: string }[] }
export interface GoalsPage { goals: GoalRow[]; options: GoalOptions; error: boolean }

const LEVEL_RANK: Record<GoalLevel, number> = { company: 0, annual: 1, quarterly: 2, monthly: 3 };
const STATUS_RANK: Record<GoalStatus, number> = { off_track: 0, at_risk: 1, draft: 2, on_track: 3, completed: 4 };

// One literal string, not built with `+` — see tasks.ts's SELECT/DETAIL_SELECT note.
const SELECT = 'id, title, title_zh, level, status, owner_id, start_date, end_date, profiles:owner_id(id, display_name, full_name)';
const DETAIL_SELECT = 'id, title, title_zh, description, level, status, owner_id, start_date, end_date, created_at, profiles:owner_id(id, display_name, full_name)';

/** Just the people picker — used by both the list and detail pages. */
export async function getGoalOptions(orgId: string): Promise<GoalOptions> {
  const sb = await createClient();
  const { data } = await sb.from('memberships').select('profile_id, profiles:profile_id(id, display_name, full_name)').eq('organization_id', orgId).eq('status', 'active');
  return {
    people: (data ?? []).map(m => one(m.profiles)).filter(Boolean).map(p => ({ id: p!.id, name: personName(p!) })).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export async function getGoalsPage(orgId: string, role: Role, locale: Locale): Promise<GoalsPage> {
  const sb = await createClient();
  const canManage = role === 'founder' || role === 'manager';

  const [goalsRes, objRes, krRes, options] = await Promise.all([
    sb.from('goals').select(SELECT).eq('organization_id', orgId),
    sb.from('objectives').select('id, goal_id').eq('organization_id', orgId),
    sb.from('key_results').select('objective_id, start_value, current_value, target_value, direction').eq('organization_id', orgId),
    getGoalOptions(orgId),
  ]);

  if (goalsRes.error) return { goals: [], options: { people: [] }, error: true };

  const objectivesByGoal = new Map<string, string[]>();
  for (const o of objRes.data ?? []) {
    const list = objectivesByGoal.get(o.goal_id) ?? [];
    list.push(o.id);
    objectivesByGoal.set(o.goal_id, list);
  }
  const krProgressByObjective = new Map<string, number[]>();
  for (const kr of krRes.data ?? []) {
    const list = krProgressByObjective.get(kr.objective_id) ?? [];
    list.push(keyResultProgress({ start_value: Number(kr.start_value), current_value: Number(kr.current_value), target_value: Number(kr.target_value), direction: kr.direction as KrDirection }));
    krProgressByObjective.set(kr.objective_id, list);
  }

  const goals: GoalRow[] = (goalsRes.data ?? []).map(g => {
    const objectiveIds = objectivesByGoal.get(g.id) ?? [];
    const allKrProgress = objectiveIds.flatMap(id => krProgressByObjective.get(id) ?? []);
    return {
      id: g.id,
      title: localizedField(g, 'title', locale),
      level: g.level as GoalLevel,
      status: g.status as GoalStatus,
      owner: one(g.profiles) ? { id: one(g.profiles)!.id, name: personName(one(g.profiles)!) } : null,
      startDate: g.start_date,
      endDate: g.end_date,
      objectiveCount: objectiveIds.length,
      progress: averageProgress(allKrProgress),
      canEdit: canManage,
      canDelete: role === 'founder',
    };
  }).sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || STATUS_RANK[a.status] - STATUS_RANK[b.status] || (a.startDate ?? '9999-12-31').localeCompare(b.startDate ?? '9999-12-31'));

  return { goals, options, error: false };
}

// ---- detail ------------------------------------------------------------------

export interface KeyResultRow {
  id: string;
  title: string;
  unit: KrUnit;
  direction: KrDirection;
  startValue: number;
  currentValue: number;
  targetValue: number;
  deadline: string | null;
  owner: { id: string; name: string } | null;
  notes: string | null;
  progress: number;
  status: KrStatus;
}

export interface ObjectiveRow {
  id: string;
  title: string;
  status: GoalStatus;
  periodType: ObjectivePeriod;
  startDate: string | null;
  endDate: string | null;
  owner: { id: string; name: string } | null;
  progress: number | null;
  keyResults: KeyResultRow[];
}

export interface GoalDetail extends GoalRow {
  description: string | null;
  createdAt: string;
  objectives: ObjectiveRow[];
}

export async function getGoalDetail(orgId: string, goalId: string, role: Role, locale: Locale, asOf = new Date().toISOString().slice(0, 10)): Promise<GoalDetail | null> {
  const sb = await createClient();
  const { data: g } = await sb.from('goals').select(DETAIL_SELECT).eq('organization_id', orgId).eq('id', goalId).maybeSingle();
  if (!g) return null;
  const canManage = role === 'founder' || role === 'manager';

  const { data: objectives } = await sb.from('objectives')
    .select('id, title, title_zh, status, period_type, start_date, end_date, owner_id, profiles:owner_id(id, display_name, full_name)')
    .eq('goal_id', goalId).order('sort_order');

  const objectiveIds = (objectives ?? []).map(o => o.id);
  const { data: keyResults } = objectiveIds.length
    ? await sb.from('key_results')
        .select('id, objective_id, title, title_zh, unit, direction, start_value, current_value, target_value, deadline, owner_id, notes, profiles:owner_id(id, display_name, full_name)')
        .in('objective_id', objectiveIds)
    : { data: [] as never[] };

  const krByObjective = new Map<string, KeyResultRow[]>();
  for (const kr of keyResults ?? []) {
    const row: KeyResultRow = {
      id: kr.id,
      title: localizedField(kr, 'title', locale),
      unit: kr.unit as KrUnit,
      direction: kr.direction as KrDirection,
      startValue: Number(kr.start_value),
      currentValue: Number(kr.current_value),
      targetValue: Number(kr.target_value),
      deadline: kr.deadline,
      owner: one(kr.profiles) ? { id: one(kr.profiles)!.id, name: personName(one(kr.profiles)!) } : null,
      notes: kr.notes,
      progress: keyResultProgress({ start_value: Number(kr.start_value), current_value: Number(kr.current_value), target_value: Number(kr.target_value), direction: kr.direction as KrDirection }),
      status: keyResultStatus({ start_value: Number(kr.start_value), current_value: Number(kr.current_value), target_value: Number(kr.target_value), direction: kr.direction as KrDirection, deadline: kr.deadline }, asOf),
    };
    const list = krByObjective.get(kr.objective_id) ?? [];
    list.push(row);
    krByObjective.set(kr.objective_id, list);
  }

  const objectiveRows: ObjectiveRow[] = (objectives ?? []).map(o => {
    const krs = krByObjective.get(o.id) ?? [];
    return {
      id: o.id,
      title: localizedField(o, 'title', locale),
      status: o.status as GoalStatus,
      periodType: o.period_type as ObjectivePeriod,
      startDate: o.start_date,
      endDate: o.end_date,
      owner: one(o.profiles) ? { id: one(o.profiles)!.id, name: personName(one(o.profiles)!) } : null,
      progress: averageProgress(krs.map(k => k.progress)),
      keyResults: krs,
    };
  });

  return {
    id: g.id,
    title: localizedField(g, 'title', locale),
    level: g.level as GoalLevel,
    status: g.status as GoalStatus,
    owner: one(g.profiles) ? { id: one(g.profiles)!.id, name: personName(one(g.profiles)!) } : null,
    startDate: g.start_date,
    endDate: g.end_date,
    objectiveCount: objectiveRows.length,
    progress: averageProgress(objectiveRows.flatMap(o => o.keyResults.map(k => k.progress))),
    canEdit: canManage,
    canDelete: role === 'founder',

    description: g.description,
    createdAt: g.created_at,
    objectives: objectiveRows,
  };
}

// ---- helpers -------------------------------------------------------------

/** A `!inner`-less embed comes back as a row or a one-element array depending on the join — same gotcha as tasks.ts / projects.ts. */
function one<T>(rel: T | T[] | null | undefined): T | null {
  return (Array.isArray(rel) ? rel[0] : rel) ?? null;
}
function personName(p: { display_name?: string | null; full_name?: string | null }): string {
  return p.display_name || p.full_name || '';
}
