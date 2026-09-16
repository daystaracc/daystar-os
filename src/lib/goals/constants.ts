// Mirrors the check constraints on goals/objectives/key_results in 0001_schema.sql —
// keep these arrays and the database constraints in sync by hand (no generated types
// are available in this sandbox; see the note at the top of src/types/database.ts).

export const GOAL_LEVEL = ['company', 'annual', 'quarterly', 'monthly'] as const;
export type GoalLevel = (typeof GOAL_LEVEL)[number];

// goals.status and objectives.status share the same check constraint.
export const GOAL_STATUS = ['draft', 'on_track', 'at_risk', 'off_track', 'completed'] as const;
export type GoalStatus = (typeof GOAL_STATUS)[number];

export const OBJECTIVE_PERIOD = ['annual', 'quarterly', 'monthly'] as const;
export type ObjectivePeriod = (typeof OBJECTIVE_PERIOD)[number];

export const KR_UNIT = ['TWD', 'percent', 'count', 'ratio', 'days'] as const;
export type KrUnit = (typeof KR_UNIT)[number];

export const KR_DIRECTION = ['increase', 'decrease'] as const;
export type KrDirection = (typeof KR_DIRECTION)[number];

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: 'forbidden' | 'invalid' | 'failed' };
