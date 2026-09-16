import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { localizedField, type Locale } from '@/lib/i18n';
import { systemStatus, healthScore, type SystemStatus } from '@/lib/calculations/health';
import type { Role } from '@/lib/permissions';

const HISTORY_LENGTH = 6;

export interface SystemRow {
  id: string;
  key: string;
  name: string;
  score: number;
  status: SystemStatus;
  owner: { id: string; name: string } | null;
  futureOwner: string | null;
  transferDate: string | null;
  goal: string | null;
  bottleneck: string | null;
  nextAction: string | null;
  lastReviewedAt: string | null;
  /** Oldest → newest, at most the last `HISTORY_LENGTH` recorded scores. Recorded automatically by the `record_system_score` trigger (0001_schema.sql) — the app never writes system_scores directly. */
  history: number[];
  /** Mirrors the generic-loop RLS this table shares with Products/Goals/Projects: manager-or-above writes, founder-only delete (delete isn't exposed here — see the scope note in ARCHITECTURE §0). */
  canEdit: boolean;
}

export interface HealthOptions { owners: { id: string; name: string }[] }

export interface HealthPage {
  systems: SystemRow[];
  score: { total: number; max: number; pct: number };
  options: HealthOptions;
  error: boolean;
}

const SELECT = 'id, key, name, name_zh, owner_id, future_owner, transfer_date, goal, bottleneck, next_action, score, last_reviewed_at, sort_order, owner:owner_id(id, display_name, full_name)';

/**
 * COMPANY HEALTH (spec §11 systems scorecard) — "Which of the 11 systems is the
 * bottleneck, and who owns fixing it?"
 *
 * `business_systems` is one of eleven fixed rows per org (seeded, `unique
 * (organization_id, key)`) — this screen edits them, it doesn't create or delete
 * any, so there's no create/delete action here (see ARCHITECTURE §0). Scoring
 * writes only `score` + the ownership-matrix fields; `status` and
 * `last_reviewed_at` are maintained by the `business_systems_after_score` trigger,
 * and every score change is appended to `system_scores` by a second trigger — the
 * app never computes or writes either directly, it only reads them back.
 */
export async function getHealthPage(orgId: string, role: Role, locale: Locale): Promise<HealthPage> {
  const sb = await createClient();
  const canEdit = role === 'founder' || role === 'manager';

  const [list, people] = await Promise.all([
    sb.from('business_systems').select(SELECT).eq('organization_id', orgId).order('sort_order'),
    sb.from('memberships').select('profile_id, profiles:profile_id(id, display_name, full_name)').eq('organization_id', orgId).eq('status', 'active'),
  ]);
  if (list.error) return { systems: [], score: { total: 0, max: 0, pct: 0 }, options: { owners: [] }, error: true };

  const systemIds = (list.data ?? []).map(s => s.id);
  const { data: scores } = systemIds.length
    ? await sb.from('system_scores').select('business_system_id, score, scored_at').in('business_system_id', systemIds).order('scored_at')
    : { data: [] as { business_system_id: string; score: number; scored_at: string }[] };

  const historyBySystem = new Map<string, number[]>();
  for (const row of scores ?? []) {
    const h = historyBySystem.get(row.business_system_id) ?? [];
    h.push(row.score);
    historyBySystem.set(row.business_system_id, h);
  }

  const systems: SystemRow[] = (list.data ?? []).map(s => ({
    id: s.id,
    key: s.key,
    name: localizedField(s, 'name', locale),
    score: s.score,
    status: systemStatus(s.score),
    owner: one(s.owner) ? { id: one(s.owner)!.id, name: personName(one(s.owner)!) } : null,
    futureOwner: s.future_owner,
    transferDate: s.transfer_date,
    goal: s.goal,
    bottleneck: s.bottleneck,
    nextAction: s.next_action,
    lastReviewedAt: s.last_reviewed_at,
    history: (historyBySystem.get(s.id) ?? []).slice(-HISTORY_LENGTH),
    canEdit,
  }));

  return {
    systems,
    score: healthScore(systems),
    options: { owners: (people.data ?? []).map(m => one(m.profiles)).filter(Boolean).map(p => ({ id: p!.id, name: personName(p!) })).sort((a, b) => a.name.localeCompare(b.name)) },
    error: false,
  };
}

// ---- helpers -------------------------------------------------------------

function one<T>(rel: T | T[] | null | undefined): T | null {
  return (Array.isArray(rel) ? rel[0] : rel) ?? null;
}

function personName(p: { display_name?: string | null; full_name?: string | null }): string {
  return p.display_name || p.full_name || '';
}
