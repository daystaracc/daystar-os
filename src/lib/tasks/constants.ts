/**
 * Task vocabulary shared by the data layer, the server actions and the UI.
 *
 * These live outside `app/(app)/tasks/actions.ts` because a `'use server'` module may
 * only export async functions — exporting a plain array from it fails the build.
 */
export const STATUS = ['backlog', 'todo', 'in_progress', 'blocked', 'review', 'done'] as const;
export const PRIORITY = ['urgent', 'high', 'medium', 'low'] as const;

export type TaskStatus = (typeof STATUS)[number];
export type TaskPriority = (typeof PRIORITY)[number];

/** Every mutation returns this instead of throwing, so the client can roll back and explain. */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: 'forbidden' | 'invalid' | 'failed' };
