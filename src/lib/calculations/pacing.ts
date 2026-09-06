/**
 * Target pacing engine — one calculation for every measurable target
 * (monthly revenue, weekly content, project completion, key results…).
 */
export type PaceStatus = 'ahead' | 'on_pace' | 'behind';

export interface PacingInput {
  target: number;
  actual: number;
  /** ISO date (inclusive) */
  periodStart: string;
  /** ISO date (inclusive) */
  periodEnd: string;
  /** ISO date; defaults to today */
  asOf?: string;
  /** Tolerance band (fraction of the expected amount) that still counts as on pace. Default ±5%. */
  tolerance?: number;
}

export interface Pacing {
  target: number;
  actual: number;
  progressPct: number;       // actual / target * 100
  totalDays: number;
  elapsedDays: number;       // days already completed (as-of day counts as in progress)
  remainingDays: number;
  expectedProgressPct: number; // elapsed / total * 100
  expectedActual: number;    // target * elapsed/total
  requiredPace: number;      // per remaining day to hit target
  actualPace: number;        // per elapsed day
  projectedFinish: number;   // actual pace * total days
  variance: number;          // actual − expectedActual (absolute)
  variancePct: number;       // (actual / expectedActual − 1) × 100  → "12% behind pace" means −12
  status: PaceStatus;
}

const DAY = 86_400_000;

export function daysBetween(a: string, b: string): number {
  return Math.round((toUTC(b) - toUTC(a)) / DAY);
}
function toUTC(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function computePacing(input: PacingInput): Pacing {
  const { target, actual } = input;
  const tolerance = input.tolerance ?? 0.05;
  const asOf = (input.asOf ?? new Date().toISOString()).slice(0, 10);

  const totalDays = Math.max(1, daysBetween(input.periodStart, input.periodEnd) + 1);
  // days fully elapsed before "asOf" (the as-of day itself is still running)
  const elapsedRaw = daysBetween(input.periodStart, asOf);
  const elapsedDays = Math.min(totalDays, Math.max(0, elapsedRaw));
  const remainingDays = Math.max(0, totalDays - elapsedDays);

  const expectedProgressPct = (elapsedDays / totalDays) * 100;
  const expectedActual = target * (elapsedDays / totalDays);
  const actualPace = elapsedDays > 0 ? actual / elapsedDays : 0;
  const requiredPace = remainingDays > 0 ? Math.max(0, target - actual) / remainingDays : 0;
  const projectedFinish = elapsedDays > 0 ? actualPace * totalDays : actual;
  const variance = actual - expectedActual;
  const variancePct = expectedActual > 0 ? (actual / expectedActual - 1) * 100 : 0;
  const progressPct = target > 0 ? (actual / target) * 100 : 0;

  let status: PaceStatus = 'on_pace';
  if (target > 0 && elapsedDays > 0 && expectedActual > 0) {
    if (variancePct > tolerance * 100) status = 'ahead';
    else if (variancePct < -tolerance * 100) status = 'behind';
  }
  if (actual >= target && target > 0) status = 'ahead';

  return { target, actual, progressPct, totalDays, elapsedDays, remainingDays, expectedProgressPct, expectedActual,
           requiredPace, actualPace, projectedFinish, variance, variancePct, status };
}

/** Month helpers for the monthly revenue target component. */
export function monthBounds(isoDate: string): { start: string; end: string } {
  const [y, m] = isoDate.slice(0, 10).split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, '0');
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(last).padStart(2, '0')}` };
}

/**
 * The same elapsed slice of the previous month, so month-to-date figures compare
 * like for like: 2026-09-05 → 2026-08-01 … 2026-08-05.
 *
 * Without this, "MoM" on the 5th compares 5 days against a full 31-day month and
 * every KPI reads as a ~85% collapse. The end is clamped to the previous month's
 * last day, so 2026-03-31 → 2026-02-01 … 2026-02-28.
 */
export function previousMonthToDate(isoDate: string): { start: string; end: string } {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  const lastDayOfPrev = new Date(Date.UTC(y, m - 1, 0)).getUTCDate();
  const prev = new Date(Date.UTC(y, m - 2, 1));
  const py = prev.getUTCFullYear(), pm = String(prev.getUTCMonth() + 1).padStart(2, '0');
  return { start: `${py}-${pm}-01`, end: `${py}-${pm}-${String(Math.min(d, lastDayOfPrev)).padStart(2, '0')}` };
}

/** ISO week (Mon–Sun) bounds for weekly targets. */
export function weekBounds(isoDate: string): { start: string; end: string } {
  const t = toUTC(isoDate);
  const dow = (new Date(t).getUTCDay() + 6) % 7; // Mon=0
  const start = new Date(t - dow * DAY), end = new Date(t + (6 - dow) * DAY);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}
