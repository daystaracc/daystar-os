// Mirrors the check constraints on `sops` in 0001_schema.sql — keep these arrays and
// the database constraints in sync by hand (no generated types are available in this
// sandbox; see the note at the top of src/types/database.ts).

export const SOP_CATEGORY = ['fulfillment', 'inventory', 'customer_service', 'content', 'marketing', 'product', 'finance', 'website', 'operations', 'management', 'other'] as const;
export type SopCategory = (typeof SOP_CATEGORY)[number];

export const SOP_STATUS = ['draft', 'active', 'needs_review', 'archived'] as const;
export type SopStatus = (typeof SOP_STATUS)[number];

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: 'forbidden' | 'invalid' | 'failed' };
