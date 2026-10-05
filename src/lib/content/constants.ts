// Mirrors the check constraints on `content` (0001_schema.sql, status collapsed by
// 0012_content_pillars.sql) and `pillars` (0012_content_pillars.sql) — keep these
// arrays and the database constraints in sync by hand (no generated types are
// available in this sandbox; see the note at the top of src/types/database.ts).

export const CONTENT_TYPE = ['short_video', 'photo', 'carousel', 'story', 'live', 'long_video', 'other'] as const;
export type ContentType = (typeof CONTENT_TYPE)[number];

export const CONTENT_PLATFORM = ['instagram', 'tiktok', 'youtube_shorts', 'facebook', 'other'] as const;
export type ContentPlatform = (typeof CONTENT_PLATFORM)[number];

// Collapsed 2026-10-02 (migration 0012) from an 8-stage production pipeline to this
// 4-value vocabulary, matching the artifact-based content calendar Lucas asked for
// ("make it exactly like the artifact" — see that migration's header comment for the
// old→new mapping). Listed in pipeline order — every place that sorts or steps
// through these statuses (the list page's default sort, the inline "advance stage"
// control, the Kanban column order) relies on this array's order, not just its
// membership. Each value also has a fixed glyph, used wherever status needs to read
// at a glance without taking over the pillar's color (see STATUS_GLYPH below and
// ContentBoard.tsx/ContentCalendar.tsx).
export const CONTENT_STATUS = ['idea', 'planned', 'shot', 'posted'] as const;
export type ContentStatus = (typeof CONTENT_STATUS)[number];

/** ○ nothing done yet · ◐ in pre-production · ● shot/in post · ✓ live. Matches the artifact exactly. */
export const STATUS_GLYPH: Record<ContentStatus, string> = { idea: '○', planned: '◐', shot: '●', posted: '✓' };

// Mirrors the `pillars.color` check constraint in 0012_content_pillars.sql — a fixed
// set of design-token-backed swatch keys (see the `--ct-pillar-*` custom properties
// in globals.css under `.content-theme`), not a freeform color a pillar could invent.
export const PILLAR_COLOR = ['gold', 'rose', 'sage', 'sky', 'violet', 'bronze', 'ember', 'slate'] as const;
export type PillarColor = (typeof PILLAR_COLOR)[number];

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: 'forbidden' | 'invalid' | 'failed' };
