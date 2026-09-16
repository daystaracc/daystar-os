// Mirrors the check constraints on `content` in 0001_schema.sql — keep these arrays
// and the database constraints in sync by hand (no generated types are available in
// this sandbox; see the note at the top of src/types/database.ts).

export const CONTENT_TYPE = ['short_video', 'photo', 'carousel', 'story', 'live', 'long_video', 'other'] as const;
export type ContentType = (typeof CONTENT_TYPE)[number];

export const CONTENT_PLATFORM = ['instagram', 'tiktok', 'youtube_shorts', 'facebook', 'other'] as const;
export type ContentPlatform = (typeof CONTENT_PLATFORM)[number];

// Listed in pipeline order (spec §07: Idea → … → Published) — every place that sorts
// or steps through these statuses (the list page's default sort, the inline "advance
// stage" control) relies on this array's order, not just its membership.
export const CONTENT_STATUS = ['idea', 'script', 'ready_to_shoot', 'shot', 'editing', 'review', 'scheduled', 'published'] as const;
export type ContentStatus = (typeof CONTENT_STATUS)[number];

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: 'forbidden' | 'invalid' | 'failed' };
