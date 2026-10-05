/** Role helpers mirrored from the RLS policies (UI convenience only — the database is the authority). */
export type Role = 'founder' | 'manager' | 'member';

export const can = {
  viewFinance: (r: Role) => r === 'founder',
  viewRevenue: (r: Role) => r === 'founder' || r === 'manager',
  editTargets: (r: Role) => r === 'founder',
  manageUsers: (r: Role) => r === 'founder',
  manageProjects: (r: Role) => r === 'founder' || r === 'manager',
  editProducts: (r: Role) => r === 'founder' || r === 'manager',
  recordInventoryMovement: (_r: Role) => true,
  createTask: (_r: Role) => true,
  scoreSystems: (r: Role) => r === 'founder' || r === 'manager',
  // `reviews_select` RLS (generic loop) actually grants every active member read
  // access to the `reviews` table, and `review_metrics_all` requires manager-or-above
  // for every operation including select — but the spec's permission matrix (§03)
  // shows Reviews as founder/manager only with no member row at all, and the sidebar
  // nav already gates `/reviews` the same way. This screen follows the spec/nav
  // intent rather than the more permissive `reviews` RLS, same kind of deliberate
  // choice as Revenue's `viewRevenue` gate — flagged here rather than silently
  // exposing a partial page (reviews with no visible metrics) to members.
  viewReviews: (r: Role) => r === 'founder' || r === 'manager',
  // Same reasoning as `viewReviews` above: `campaigns_select`/`creators_select` (both
  // in the generic loop) grant every active member read access, but `ad_spend_daily`
  // requires manager-or-above for every operation including select, and
  // `campaign_metrics`/`creator_content` are readable only through their manager+
  // parent — so a member could open this screen and see campaign/creator names with
  // no spend or performance data at all. The spec's permission matrix (§03) shows
  // Marketing as founder/manager only with no member row, matching that.
  viewMarketing: (r: Role) => r === 'founder' || r === 'manager',
  // `pillars_insert`/`pillars_update` RLS (migration 0012, 2026-10-02): manager-or-
  // above — mirrors `campaigns`, a content-marketing taxonomy, not founder-only like
  // `departments`. Deleting a pillar is founder-only (`pillars_delete`), checked
  // inline in PillarManager.tsx the same way `can.viewFinance`-style role checks are
  // used elsewhere, rather than adding a second `can.*` entry for one delete button.
  managePillars: (r: Role) => r === 'founder' || r === 'manager',
  // `customers_all` RLS is founder-only for every operation including select — the
  // strictest table this session has built against — and the spec's own
  // permission matrix (§03) shows CRM as founder-only too (no manager or member
  // row at all), even though `crm_flows`/`crm_metrics_monthly` are in the more
  // permissive generic loop (select = any member). One notch stricter than
  // `viewReviews`/`viewMarketing` for the same underlying reason: don't show a
  // partial screen to a role that can't see the data the screen is about.
  viewCRM: (r: Role) => r === 'founder',
  // Matches the sidebar nav (`lib/nav.ts`'s `settings` item is `roles: ['founder']`)
  // and `organizations_update` RLS (`public.is_founder(id)`, migration 0002) — same
  // founder-only shape as `viewFinance`/`viewCRM`.
  viewSettings: (r: Role) => r === 'founder',
  // `activity_logs_select` RLS (0002_rls.sql) is manager-or-above with no narrower
  // spec-vs-RLS gap to account for (unlike viewReviews/viewMarketing/viewCRM above,
  // which are each deliberately stricter than their table's own RLS) — this mirrors
  // it exactly.
  viewAuditLog: (r: Role) => r === 'founder' || r === 'manager',
};

/** Navigation visible per role. Members land on My Work. */
export function homeFor(role: Role): string { return role === 'member' ? '/my-work' : '/overview'; }

/**
 * Mirrors the `tasks_update` RLS policy so the UI can disable controls the database
 * would reject anyway: managers and founders edit anything; everyone else edits the
 * tasks they own, are assigned, or created.
 *
 * One deliberate gap, found in the 2026-09-16 audit: `tasks_update` RLS also allows
 * `is_task_assignee(id)` — anyone listed in the `task_assignees` junction table, a
 * multi-assignee capability that exists in the schema (migration 0001) but has no
 * UI built for it anywhere in this app (nothing ever inserts into `task_assignees`
 * — `lib/data/tasks.ts` doesn't even select from it). Since the table is always
 * empty in practice, this function's answer matches RLS's for every task that
 * actually exists today. It would stop matching only if something started writing
 * to `task_assignees` without this function being updated alongside it — worth
 * remembering if that feature ever gets built, not an active bug right now.
 */
export function canEditTask(task: { owner_id: string | null; assignee_id: string | null; created_by: string | null }, role: Role, userId: string): boolean {
  if (role === 'founder' || role === 'manager') return true;
  return task.owner_id === userId || task.assignee_id === userId || task.created_by === userId;
}

/** `tasks_delete`: managers and above, or whoever created it. */
export function canDeleteTask(task: { created_by: string | null }, role: Role, userId: string): boolean {
  return role === 'founder' || role === 'manager' || task.created_by === userId;
}

/**
 * Mirrors the `content_update` RLS policy: managers and founders edit any content
 * piece; everyone else edits only the ones they own or created. Unlike tasks,
 * `content_delete` has no such carve-out — deleting is manager-or-above only,
 * checked inline where needed (`role === 'founder' || role === 'manager'`).
 */
export function canEditContent(content: { owner_id: string | null; created_by: string | null }, role: Role, userId: string): boolean {
  if (role === 'founder' || role === 'manager') return true;
  return content.owner_id === userId || content.created_by === userId;
}
