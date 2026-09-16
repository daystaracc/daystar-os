// Mirrors the check constraints on products/product_variants in 0001_schema.sql —
// keep these arrays and the database constraints in sync by hand (no generated types
// are available in this sandbox; see the note at the top of src/types/database.ts).

// Shares its values with common.status in the i18n dictionaries — draft/active/
// low_stock/out_of_stock/discontinued were already there for other screens, so no
// new status labels were needed for this one.
export const PRODUCT_STATUS = ['draft', 'active', 'low_stock', 'out_of_stock', 'discontinued'] as const;
export type ProductStatus = (typeof PRODUCT_STATUS)[number];

export const PRODUCT_TIER = ['entry', 'core', 'premium', 'high_ticket'] as const;
export type ProductTier = (typeof PRODUCT_TIER)[number];

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: 'forbidden' | 'invalid' | 'failed' };
