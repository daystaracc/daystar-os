/**
 * "What Needs Attention" — deterministic business rules (not AI).
 * Input is a plain snapshot the server assembles from the database; output is a ranked list.
 * Messages are rendered by i18n from `code` + `params` so the same rule works in zh-Hant and en.
 */
import type { Pacing } from './pacing';
import { weeksOfSupply, stockStatus } from './inventory';
import { keyResultStatus, type KeyResultLike } from './goals';

export type Severity = 'critical' | 'high' | 'medium' | 'low';
export const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export interface AttentionItem {
  code: string;                 // i18n key: attention.<code>
  severity: Severity;
  entityType?: 'product' | 'project' | 'task' | 'key_result' | 'review' | 'content' | 'inventory' | 'system' | 'revenue' | 'cs';
  entityId?: string;
  params: Record<string, string | number>;
  href: string;                 // where "View" goes
}

export interface RulesSnapshot {
  asOf: string;                                   // ISO date
  revenue: Pacing;                                // monthly revenue pacing
  aov: { current: number | null; previous: number | null; target: number | null };
  cvr: { current: number | null; target: number | null };
  heroProducts: { id: string; name: string; onHand: number; reserved: number; unitsPerDay: number; safetyStock: number; reorderPoint: number; isHero: boolean }[];
  incomingLate: { id: string; name: string; eta: string }[];
  projects: { id: string; name: string; deadline: string | null; progressPct: number; openTasks: number; status: string }[];
  tasks: { overdueUrgent: number; overdueHigh: number; blocked: number };
  content: { publishedThisWeek: number; weeklyTarget: number | null; weekElapsedFraction: number };
  keyResults: (KeyResultLike & { id: string; title: string; periodStart?: string })[];
  reviews: { weeklyDue: string | null; weeklyDone: boolean };
  operations: { ordersWaiting: number; csOpenOver24h: number; csPending: number };
  /** `name` is already resolved to the reader's language by the data layer; `key` stays for routing. */
  systems: { id: string; key: string; name?: string; score: number; nextAction: string | null }[];
  dismissals: { rule_code: string; entity_id: string | null; until_date: string | null }[];
}

export function evaluateRules(s: RulesSnapshot): AttentionItem[] {
  const items: AttentionItem[] = [];
  const push = (i: AttentionItem) => items.push(i);

  // 1. Revenue pace
  if (s.revenue.elapsedDays > 0 && s.revenue.variancePct <= -10) {
    push({ code: 'revenue_behind', severity: s.revenue.variancePct <= -20 ? 'critical' : 'high', entityType: 'revenue',
           params: { pct: Math.round(Math.abs(s.revenue.variancePct)), required: Math.round(s.revenue.requiredPace), actual: Math.round(s.revenue.actualPace) }, href: '/revenue' });
  }

  // 2. Hero product supply / stock
  for (const p of s.heroProducts) {
    const st = stockStatus({ onHand: p.onHand, reserved: p.reserved, unitsPerDay: p.unitsPerDay, safetyStock: p.safetyStock, reorderPoint: p.reorderPoint });
    const wos = weeksOfSupply({ onHand: p.onHand, reserved: p.reserved, unitsPerDay: p.unitsPerDay });
    if (st === 'critical') {
      push({ code: p.isHero ? 'hero_stock_critical' : 'stock_critical', severity: p.isHero ? 'high' : 'medium', entityType: 'product', entityId: p.id,
             params: { product: p.name, weeks: Number.isFinite(wos) ? Number(wos.toFixed(1)) : 0 }, href: `/inventory?product=${p.id}` });
    } else if (st === 'low' && p.isHero) {
      push({ code: 'hero_stock_low', severity: 'medium', entityType: 'product', entityId: p.id,
             params: { product: p.name, weeks: Number(wos.toFixed(1)) }, href: `/inventory?product=${p.id}` });
    }
  }
  for (const i of s.incomingLate) {
    push({ code: 'incoming_late', severity: 'medium', entityType: 'inventory', entityId: i.id, params: { product: i.name, eta: i.eta }, href: `/inventory?product=${i.id}` });
  }

  // 3. Projects
  for (const p of s.projects) {
    if (p.status === 'completed' || p.status === 'cancelled') continue;
    if (!p.deadline) continue;
    const days = dayDiff(s.asOf, p.deadline);
    if (days < 0 && p.progressPct < 100) {
      push({ code: 'project_overdue', severity: 'high', entityType: 'project', entityId: p.id, params: { project: p.name, days: Math.abs(days), progress: p.progressPct }, href: `/projects/${p.id}` });
    } else if (days < 7 && p.progressPct < 70) {
      push({ code: 'project_at_risk', severity: 'high', entityType: 'project', entityId: p.id, params: { project: p.name, days, tasks: p.openTasks }, href: `/projects/${p.id}` });
    }
  }

  // 4. Tasks
  if (s.tasks.overdueUrgent > 0) push({ code: 'tasks_overdue_urgent', severity: 'high', entityType: 'task', params: { count: s.tasks.overdueUrgent }, href: '/tasks?view=overdue' });
  else if (s.tasks.overdueHigh > 0) push({ code: 'tasks_overdue_high', severity: 'medium', entityType: 'task', params: { count: s.tasks.overdueHigh }, href: '/tasks?view=overdue' });
  if (s.tasks.blocked > 0) push({ code: 'tasks_blocked', severity: 'medium', entityType: 'task', params: { count: s.tasks.blocked }, href: '/tasks?status=blocked' });

  // 5. Content output vs weekly target (compared with the elapsed part of the week)
  if (s.content.weeklyTarget && s.content.weekElapsedFraction > 0.3) {
    const expected = s.content.weeklyTarget * s.content.weekElapsedFraction;
    if (s.content.publishedThisWeek < expected * 0.85) {
      push({ code: 'content_behind', severity: 'medium', entityType: 'content', params: { published: s.content.publishedThisWeek, target: s.content.weeklyTarget }, href: '/content?view=calendar' });
    }
  }

  // 6. AOV and CVR
  if (s.aov.current !== null && s.aov.previous) {
    const chg = ((s.aov.current - s.aov.previous) / s.aov.previous) * 100;
    if (chg <= -5) push({ code: 'aov_declined', severity: 'medium', entityType: 'revenue', params: { pct: Math.round(Math.abs(chg)) }, href: '/revenue' });
  }
  if (s.aov.current !== null && s.aov.target && s.aov.current < s.aov.target * 0.9) {
    push({ code: 'aov_below_target', severity: 'medium', entityType: 'revenue', params: { aov: Math.round(s.aov.current), target: Math.round(s.aov.target), pct: Math.round((1 - s.aov.current / s.aov.target) * 100) }, href: '/revenue' });
  }
  if (s.cvr.current !== null && s.cvr.target && s.cvr.current < s.cvr.target * 0.8) {
    push({ code: 'cvr_below_target', severity: 'medium', entityType: 'revenue', params: { cvr: Number(s.cvr.current.toFixed(2)), target: s.cvr.target }, href: '/revenue' });
  }

  // 7. Key results
  for (const kr of s.keyResults) {
    if (keyResultStatus(kr, s.asOf, kr.periodStart) === 'off_track') {
      push({ code: 'kr_off_track', severity: 'medium', entityType: 'key_result', entityId: kr.id, params: { kr: kr.title }, href: '/goals' });
    }
  }

  // 8. Reviews
  if (s.reviews.weeklyDue && !s.reviews.weeklyDone) {
    const d = dayDiff(s.asOf, s.reviews.weeklyDue);
    if (d < 0) push({ code: 'review_overdue', severity: 'medium', entityType: 'review', params: { days: Math.abs(d) }, href: '/reviews' });
    else if (d <= 1) push({ code: 'review_due', severity: 'low', entityType: 'review', params: { days: d }, href: '/reviews' });
  }

  // 9. Operations
  if (s.operations.csOpenOver24h > 0) push({ code: 'cs_stale', severity: 'medium', entityType: 'cs', params: { count: s.operations.csOpenOver24h }, href: '/operations?tab=cs' });
  if (s.operations.ordersWaiting > 0) push({ code: 'orders_waiting', severity: 'low', entityType: 'cs', params: { count: s.operations.ordersWaiting }, href: '/operations' });

  // 10. Business systems at 1/5 (max 2, lowest first)
  s.systems.filter(x => x.score <= 1).slice(0, 2).forEach(x =>
    push({ code: 'system_critical', severity: 'low', entityType: 'system', entityId: x.id, params: { system: x.name || x.key, next: x.nextAction ?? '' }, href: '/company/health' }));

  // dismissals / resolutions
  const active = items.filter(i => !s.dismissals.some(d => d.rule_code === i.code && (d.entity_id ?? null) === (i.entityId ?? null) && (!d.until_date || d.until_date >= s.asOf)));
  return active.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

/** 3–5 short executive summary lines for the Command Center, derived from the same snapshot. */
export function executiveSummary(s: RulesSnapshot, alerts: AttentionItem[]): { code: string; params: Record<string, string | number> }[] {
  const lines: { code: string; params: Record<string, string | number> }[] = [];
  const r = s.revenue;
  lines.push({ code: r.status === 'ahead' ? 'summary.revenue_ahead' : r.status === 'behind' ? 'summary.revenue_behind' : 'summary.revenue_on_pace',
               params: { pct: Math.round(Math.abs(r.variancePct)), projected: Math.round(r.projectedFinish) } });
  if (s.aov.current !== null && s.aov.target) lines.push({ code: s.aov.current >= s.aov.target ? 'summary.aov_ok' : 'summary.aov_below', params: { aov: Math.round(s.aov.current), target: Math.round(s.aov.target) } });
  const stock = alerts.filter(a => a.code.startsWith('hero_stock')).length;
  if (stock) lines.push({ code: 'summary.hero_replenish', params: { count: stock } });
  const proj = alerts.filter(a => a.code.startsWith('project_')).length;
  if (proj) lines.push({ code: 'summary.project_risk', params: { count: proj } });
  if (s.content.weeklyTarget) lines.push({ code: alerts.some(a => a.code === 'content_behind') ? 'summary.content_behind' : 'summary.content_on_target', params: { published: s.content.publishedThisWeek, target: s.content.weeklyTarget } });
  return lines.slice(0, 5);
}

function dayDiff(a: string, b: string): number {
  const p = (x: string) => { const [y, m, d] = x.slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((p(b) - p(a)) / 86_400_000);
}
