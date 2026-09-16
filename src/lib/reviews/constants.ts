// Mirrors the check constraints on `reviews` / `review_metrics` in 0001_schema.sql —
// keep these arrays and the database constraints in sync by hand (no generated types
// are available in this sandbox; see the note at the top of src/types/database.ts).

export const REVIEW_TYPE = ['weekly', 'monthly'] as const;
export type ReviewType = (typeof REVIEW_TYPE)[number];

export const REVIEW_STATUS = ['draft', 'completed'] as const;
export type ReviewStatus = (typeof REVIEW_STATUS)[number];

export const REVIEW_SECTION = ['growth', 'product', 'content', 'crm', 'operations', 'finance', 'team'] as const;
export type ReviewSection = (typeof REVIEW_SECTION)[number];

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: 'forbidden' | 'invalid' | 'failed' };
