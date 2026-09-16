/**
 * Project vocabulary shared by the data layer, the server actions and the UI.
 *
 * Lives outside `app/(app)/projects/actions.ts` because a `'use server'` module may
 * only export async functions — mirrors `lib/tasks/constants.ts` and
 * `lib/revenue/constants.ts`.
 */
export const PROJECT_STATUS = ['planning', 'active', 'at_risk', 'blocked', 'completed', 'cancelled'] as const;
export type ProjectStatus = (typeof PROJECT_STATUS)[number];

/** Every mutation returns this instead of throwing, so the client can roll back and explain. */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: 'forbidden' | 'invalid' | 'failed' };
