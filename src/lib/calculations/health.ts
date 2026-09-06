/** Business system health (1–5 per system) and the company status line. */
import type { PaceStatus } from './pacing';

export type SystemStatus = 'healthy' | 'at_risk' | 'critical';
export type CompanyStatus = 'on_track' | 'at_risk' | 'off_track';

export function systemStatus(score: number): SystemStatus {
  return score >= 4 ? 'healthy' : score >= 2 ? 'at_risk' : 'critical';
}

export function healthScore(systems: { score: number }[]): { total: number; max: number; pct: number } {
  const total = systems.reduce((a, s) => a + s.score, 0);
  const max = systems.length * 5;
  return { total, max, pct: max > 0 ? (total / max) * 100 : 0 };
}

export interface CompanyStatusInput {
  revenuePace: PaceStatus;
  /** number of open critical alerts (from rules) */
  criticalAlerts: number;
  highAlerts: number;
  /** key results by status */
  krOffTrack: number;
  krAtRisk: number;
}

/**
 * Deterministic company status:
 *  off_track – revenue behind AND (a critical alert OR ≥2 KRs off track)
 *  at_risk   – revenue behind, or any critical alert, or ≥2 high alerts, or any KR off track
 *  on_track  – otherwise
 */
export function companyStatus(i: CompanyStatusInput): CompanyStatus {
  const behind = i.revenuePace === 'behind';
  if (behind && (i.criticalAlerts > 0 || i.krOffTrack >= 2)) return 'off_track';
  if (behind || i.criticalAlerts > 0 || i.highAlerts >= 2 || i.krOffTrack > 0) return 'at_risk';
  return 'on_track';
}
