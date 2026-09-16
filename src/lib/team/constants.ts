/**
 * Team (spec §13) — "Who owns what, who is loaded?" Unlike every other screen
 * built this session, `/team` is open to **every** active member for read — the
 * spec's own permission matrix (§03) shows Founder/Manager/Member all with a row
 * (Founder ●, Manager ●, Member "read"), and that matches RLS exactly:
 * `memberships_select`/`departments_select`/`profiles_select` (migration 0002)
 * all resolve to "any active member of the org," not the generic-loop's usual
 * manager-or-above split. Writing is a different story — `memberships_write`/
 * `departments_write` are both `is_founder(organization_id)` for every operation
 * — so this screen needed no new `can.viewX` gate (the existing `can.manageUsers`,
 * already founder-only, covers the write side), the same "no new permission
 * needed" situation Finance was in. See `app/(app)/team/actions.ts` for the
 * write-side mirror.
 */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: 'forbidden' | 'invalid' | 'failed' };
