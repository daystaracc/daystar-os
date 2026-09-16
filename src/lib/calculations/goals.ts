/** Goals / OKR calculations. */
export type KrStatus = 'on_track' | 'at_risk' | 'off_track' | 'completed';

export interface KeyResultLike {
  start_value: number; current_value: number; target_value: number;
  direction?: 'increase' | 'decrease';
  deadline?: string | null; start_date?: string | null;
}

/** Progress from start → target, clamped 0–100. Works for decrease goals too. */
export function keyResultProgress(kr: KeyResultLike): number {
  const dir = kr.direction ?? 'increase';
  const span = kr.target_value - kr.start_value;
  if (span === 0) return kr.current_value === kr.target_value ? 100 : 0;
  const raw = ((kr.current_value - kr.start_value) / span) * 100;
  const pct = dir === 'decrease' ? raw : raw; // span already carries the sign
  return Math.min(100, Math.max(0, pct));
}

/** Status: compares progress with elapsed time when dates are known; otherwise progress thresholds. */
export function keyResultStatus(kr: KeyResultLike, asOf: string, periodStart?: string): KrStatus {
  const progress = keyResultProgress(kr);
  if (progress >= 100) return 'completed';
  const start = periodStart ?? kr.start_date;
  if (start && kr.deadline) {
    const total = Math.max(1, dayDiff(start, kr.deadline));
    const elapsed = Math.min(total, Math.max(0, dayDiff(start, asOf)));
    const expected = (elapsed / total) * 100;
    if (progress >= expected - 10) return 'on_track';
    if (progress >= expected - 25) return 'at_risk';
    return 'off_track';
  }
  return progress >= 60 ? 'on_track' : progress >= 30 ? 'at_risk' : 'off_track';
}

/** Project progress = done / (all non-backlog). */
export function projectProgress(t: { total: number; done: number }): number {
  return t.total > 0 ? Math.round((t.done / t.total) * 100) : 0;
}

export type ProjectHealth = 'healthy' | 'at_risk' | 'critical';
/** Deadline < 7 days and completion < 70% → at risk; overdue and not done, or blocked ≥ 2 → critical. */
export function projectHealth(p: { deadline?: string | null; progressPct: number; blocked?: number; overdue?: number; status?: string }, asOf: string): ProjectHealth {
  if (p.status === 'completed' || p.status === 'cancelled') return 'healthy';
  const daysLeft = p.deadline ? dayDiff(asOf, p.deadline) : null;
  if ((daysLeft !== null && daysLeft < 0 && p.progressPct < 100) || (p.blocked ?? 0) >= 2 || (p.overdue ?? 0) >= 3) return 'critical';
  if ((daysLeft !== null && daysLeft < 7 && p.progressPct < 70) || (p.blocked ?? 0) >= 1 || (p.overdue ?? 0) >= 1) return 'at_risk';
  return 'healthy';
}

/** Roll several progress percentages up into one (an objective's KRs, or a goal's objectives). `null` — not 0 — when there's nothing to average, so "no key results yet" never reads as "0% done". */
export function averageProgress(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

function dayDiff(a: string, b: string): number {
  const p = (s: string) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((p(b) - p(a)) / 86_400_000);
}
