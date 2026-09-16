/**
 * Revenue vocabulary shared by the data layer, the server actions and the UI.
 *
 * Lives outside `app/(app)/revenue/actions.ts` because a `'use server'` module may
 * only export async functions — exporting a plain array/type from it fails the build.
 * Mirrors `lib/tasks/constants.ts`.
 */
export const CHANNEL_KEYS = ['website', 'shopee', 'other'] as const;
export type ChannelKey = (typeof CHANNEL_KEYS)[number];

/** Every mutation returns this instead of throwing, so the client can roll back and explain. */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: 'forbidden' | 'invalid' | 'failed' };
