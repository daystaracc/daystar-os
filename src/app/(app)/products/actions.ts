'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { PRODUCT_STATUS, PRODUCT_TIER, type ActionResult } from '@/lib/products/constants';

// Every mutation returns an ActionResult instead of throwing — same pattern as
// app/(app)/tasks/actions.ts, app/(app)/projects/actions.ts and app/(app)/goals/actions.ts.
const ok = <T,>(data: T): ActionResult<T> => ({ ok: true, data });
const fail = (error: 'forbidden' | 'invalid' | 'failed'): ActionResult<never> => ({ ok: false, error });

const uuid = z.string().uuid();
const emptyToNull = <T extends z.ZodTypeAny>(s: T) =>
  z.preprocess(v => (v === '' || v === undefined ? null : v), s.nullable());

/**
 * Bounded 2026-09-17: was `z.record(z.string(), z.string())` with no length or entry
 * limit on either side — every other free-text field in this file (and every other
 * actions.ts in the app) has a `.max()`, this was the one exception. Real-world risk
 * is low (manager-or-above only, one plain-text input in VariantDrawer.tsx that
 * parses "key: value, key: value" pairs — see `parseAttributes`), but an unbounded
 * `z.record` is exactly the kind of gap the `next.config.ts` body-size-limit trap
 * (see ARCHITECTURE.md "Traps") exists to catch, so it's worth closing rather than
 * leaving as the only unbounded free-text field in the codebase. 20 entries / 50
 * chars per key / 200 chars per value comfortably covers real variant dimensions
 * (size, color, material, ...) with room to spare.
 */
const attributesSchema = z.record(z.string().trim().min(1).max(50), z.string().trim().min(1).max(200))
  .refine(obj => Object.keys(obj).length <= 20, { message: 'Too many attributes' });

async function ctx() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data: m } = await sb.from('memberships').select('organization_id, role').eq('profile_id', user.id).eq('status', 'active').limit(1).single();
  if (!m) return null;
  return { sb, user, orgId: m.organization_id, role: m.role };
}

/** `products_insert/update` RLS (generic loop, migration 0002): manager-or-above. Delete is founder-only. */
function canManage(role: string) { return role === 'founder' || role === 'manager'; }

function refresh(productId?: string) {
  revalidatePath('/products');
  revalidatePath('/overview');
  if (productId) revalidatePath(`/products/${productId}`);
}

// ---- products -------------------------------------------------------------

const createProductSchema = z.object({
  name: z.string().trim().min(1).max(200),
  sku: z.string().trim().min(1).max(60),
  category: emptyToNull(z.string().max(100)),
  collection: emptyToNull(z.string().max(100)),
  tier: z.enum(PRODUCT_TIER).default('core'),
  status: z.enum(PRODUCT_STATUS).default('draft'),
  price: z.coerce.number().min(0),
  cost: emptyToNull(z.coerce.number().min(0)),
  supplier_id: emptyToNull(uuid),
  is_hero: z.coerce.boolean().default(false),
  weight_g: emptyToNull(z.coerce.number().min(0)),
  material: emptyToNull(z.string().max(200)),
  specification: emptyToNull(z.string().max(200)),
  color: emptyToNull(z.string().max(100)),
  size: emptyToNull(z.string().max(100)),
  launch_date: emptyToNull(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  image_url: emptyToNull(z.string().url().max(1000)),
  notes: emptyToNull(z.string().max(5000)),
});
// Every field explicitly `.optional()` — same style as projects/actions.ts and goals/actions.ts.
const updateProductSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  sku: z.string().trim().min(1).max(60).optional(),
  category: emptyToNull(z.string().max(100)).optional(),
  collection: emptyToNull(z.string().max(100)).optional(),
  tier: z.enum(PRODUCT_TIER).optional(),
  status: z.enum(PRODUCT_STATUS).optional(),
  price: z.coerce.number().min(0).optional(),
  cost: emptyToNull(z.coerce.number().min(0)).optional(),
  supplier_id: emptyToNull(uuid).optional(),
  is_hero: z.coerce.boolean().optional(),
  weight_g: emptyToNull(z.coerce.number().min(0)).optional(),
  material: emptyToNull(z.string().max(200)).optional(),
  specification: emptyToNull(z.string().max(200)).optional(),
  color: emptyToNull(z.string().max(100)).optional(),
  size: emptyToNull(z.string().max(100)).optional(),
  launch_date: emptyToNull(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  image_url: emptyToNull(z.string().url().max(1000)).optional(),
  notes: emptyToNull(z.string().max(5000)).optional(),
});

export async function createProduct(raw: unknown): Promise<ActionResult<string>> {
  const parsed = createProductSchema.safeParse(raw);
  if (!parsed.success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');
  if (!canManage(c.role)) return fail('forbidden');

  const { data, error } = await c.sb.from('products')
    .insert({ ...parsed.data, organization_id: c.orgId, created_by: c.user.id }).select('id').single();
  if (error || !data) return fail(error?.code === '23505' ? 'invalid' : error?.code === '42501' ? 'forbidden' : 'failed'); // 23505: sku already exists
  refresh();
  return ok(data.id);
}

export async function updateProduct(id: string, raw: unknown): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail('invalid');
  const parsed = updateProductSchema.safeParse(raw);
  if (!parsed.success || Object.keys(parsed.data).length === 0) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');
  if (!canManage(c.role)) return fail('forbidden');

  const { data, error } = await c.sb.from('products').update(parsed.data).eq('id', id).select('id');
  if (error) return fail(error.code === '23505' ? 'invalid' : 'failed');
  if (!data?.length) return fail('forbidden'); // RLS matched no row
  refresh(id);
  return ok(undefined);
}

/** `products_delete` RLS: founder-only. Cascades to variants and inventory rows. */
export async function deleteProduct(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');
  if (c.role !== 'founder') return fail('forbidden');

  const { data, error } = await c.sb.from('products').delete().eq('id', id).select('id');
  if (error) return fail('failed');
  if (!data?.length) return fail('forbidden');
  refresh();
  return ok(undefined);
}

// ---- variants ---------------------------------------------------------------
// `product_variants_write` RLS: manager-or-above on the parent product's
// organization, for every operation including delete — no founder-only split here,
// unlike products/goals/objectives/key_results.

const createVariantSchema = z.object({
  product_id: uuid,
  name: z.string().trim().min(1).max(200),
  sku: z.string().trim().min(1).max(60),
  price: emptyToNull(z.coerce.number().min(0)),
  cost: emptyToNull(z.coerce.number().min(0)),
  attributes: attributesSchema.default({}),
});
const updateVariantSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  sku: z.string().trim().min(1).max(60).optional(),
  price: emptyToNull(z.coerce.number().min(0)).optional(),
  cost: emptyToNull(z.coerce.number().min(0)).optional(),
  attributes: attributesSchema.optional(),
});

export async function createVariant(raw: unknown): Promise<ActionResult<string>> {
  const parsed = createVariantSchema.safeParse(raw);
  if (!parsed.success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');
  if (!canManage(c.role)) return fail('forbidden');

  const { data, error } = await c.sb.from('product_variants').insert(parsed.data).select('id').single();
  if (error || !data) return fail(error?.code === '23505' ? 'invalid' : error?.code === '42501' ? 'forbidden' : 'failed');
  refresh(parsed.data.product_id);
  return ok(data.id);
}

export async function updateVariant(id: string, productId: string, raw: unknown): Promise<ActionResult> {
  if (!uuid.safeParse(id).success || !uuid.safeParse(productId).success) return fail('invalid');
  const parsed = updateVariantSchema.safeParse(raw);
  if (!parsed.success || Object.keys(parsed.data).length === 0) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');
  if (!canManage(c.role)) return fail('forbidden');

  const { data, error } = await c.sb.from('product_variants').update(parsed.data).eq('id', id).select('id');
  if (error) return fail(error.code === '23505' ? 'invalid' : 'failed');
  if (!data?.length) return fail('forbidden');
  refresh(productId);
  return ok(undefined);
}

export async function deleteVariant(id: string, productId: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success || !uuid.safeParse(productId).success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');
  if (!canManage(c.role)) return fail('forbidden');

  const { data, error } = await c.sb.from('product_variants').delete().eq('id', id).select('id');
  if (error) return fail('failed');
  if (!data?.length) return fail('forbidden');
  refresh(productId);
  return ok(undefined);
}

// ---- stock counts -----------------------------------------------------------
// `inventory_movements_insert` RLS: ANY active member, not just manager-or-above —
// "fulfillment staff adjust stock" is the documented intent in migration 0002.
// Movements are append-only (no update/delete policy exists for anyone), and
// on_hand only ever moves through the `apply_inventory_movement` trigger — so this
// reads the current count and writes the *difference*, exactly like
// `productImportPlan.ts` does for a product import. An unchanged count writes
// nothing, so re-submitting the same number twice is a no-op, not a doubled count.

const stockCountSchema = z.object({
  productId: uuid,
  variantId: uuid.nullable(),
  countedOnHand: z.coerce.number().int().min(0),
});

export async function recordStockCount(raw: unknown): Promise<ActionResult> {
  const parsed = stockCountSchema.safeParse(raw);
  if (!parsed.success) return fail('invalid');
  const { productId, variantId, countedOnHand } = parsed.data;
  const c = await ctx();
  if (!c) return fail('forbidden');
  // Any active member may log a count — no canManage() gate here.

  const query = c.sb.from('inventory').select('on_hand').eq('organization_id', c.orgId).eq('product_id', productId);
  const { data: existing, error: readError } = await (variantId ? query.eq('variant_id', variantId) : query.is('variant_id', null)).maybeSingle();
  if (readError) return fail('failed');

  const onHandNow = existing?.on_hand ?? 0;
  const delta = countedOnHand - onHandNow;
  if (delta === 0) { refresh(productId); return ok(undefined); } // no change → no audit row, same rule as the product importer

  const { error } = await c.sb.from('inventory_movements').insert({
    organization_id: c.orgId, product_id: productId, variant_id: variantId,
    type: 'count', quantity: delta, created_by: c.user.id, note: 'Manual stock count',
  });
  if (error) return fail(error.code === '42501' ? 'forbidden' : 'failed');
  refresh(productId);
  return ok(undefined);
}
