'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { parseCsv } from '@/lib/import/csv';
import { parseShowmoreProducts } from '@/lib/import/showmoreProducts';
import { planProductImport, EXTERNAL_SOURCE, type ExistingState, type ProductImportPlan } from '@/lib/import/productImportPlan';

export interface ImportOutcome {
  ok: boolean;
  message?: string;
  summary?: ProductImportPlan['summary'];
}

/**
 * Import the Showmore product master.
 *
 * The **file text** is sent, not a client-built payload, and parsed again here: the
 * preview the user approved and the rows written come from the same pure function, and
 * a tampered payload cannot write arbitrary products.
 *
 * Writes go in dependency order — products, then variants, then stock — and stock only
 * ever moves through `inventory_movements`, so the audit trail stays complete and the
 * `apply_inventory_movement` trigger keeps `inventory.on_hand` and product status right.
 *
 * RLS is the authority on permission; the role check here only produces a better message.
 */
export async function importShowmoreProducts(csvText: string): Promise<ImportOutcome> {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, message: 'Not signed in.' };

  const { data: membership } = await sb
    .from('memberships').select('organization_id, role')
    .eq('profile_id', user.id).eq('status', 'active').limit(1).single();
  if (!membership) return { ok: false, message: 'No organization.' };
  if (membership.role === 'member') return { ok: false, message: 'Only founders and managers can import the catalogue.' };
  const orgId = membership.organization_id;

  const parsed = parseShowmoreProducts(parseCsv(csvText));
  if (!parsed.products.length) {
    return { ok: false, message: parsed.warnings[0] ?? 'Nothing to import.' };
  }

  const existing = await loadExistingState(sb, orgId);
  const plan = planProductImport(parsed.products, existing);

  // --- products -------------------------------------------------------------
  const productIdByExternal = new Map(existing.products.map(p => [p.externalId, p.id]));
  for (const p of [...plan.products.create, ...plan.products.update]) {
    const row = {
      organization_id: orgId,
      name: p.name,
      sku: p.sku,
      price: p.price,
      cost: p.cost,
      external_source: EXTERNAL_SOURCE,
      external_id: p.externalId,
      updated_at: new Date().toISOString(),
    };
    if (p.id) {
      const { error } = await sb.from('products').update(row).eq('id', p.id);
      if (error) return { ok: false, message: `products: ${error.message}` };
    } else {
      const { data, error } = await sb.from('products').insert({ ...row, created_by: user.id }).select('id').single();
      if (error) return { ok: false, message: `products: ${error.message}` };
      productIdByExternal.set(p.externalId, data.id);
    }
  }

  // --- variants -------------------------------------------------------------
  for (const v of [...plan.variants.create, ...plan.variants.update]) {
    const productId = productIdByExternal.get(v.productExternalId);
    if (!productId) return { ok: false, message: `Missing product for variant ${v.externalId}.` };
    const row = {
      product_id: productId,
      name: v.name,
      sku: v.sku,
      price: v.price,
      cost: v.cost,
      attributes: v.attributes,
      external_source: EXTERNAL_SOURCE,
      external_id: v.externalId,
    };
    const { error } = v.id
      ? await sb.from('product_variants').update(row).eq('id', v.id)
      : await sb.from('product_variants').insert(row);
    if (error) return { ok: false, message: `product_variants: ${error.message}` };
  }

  // --- stock, as counts -----------------------------------------------------
  if (plan.movements.length) {
    const variantIdByExternal = await loadVariantIds(sb, [...productIdByExternal.values()]);
    const movements = [];
    for (const m of plan.movements) {
      const productId = productIdByExternal.get(m.productExternalId);
      const variantId = variantIdByExternal.get(m.variantExternalId);
      if (!productId || !variantId) return { ok: false, message: `Missing variant ${m.variantExternalId} for the stock count.` };
      movements.push({
        organization_id: orgId,
        product_id: productId,
        variant_id: variantId,
        type: 'count' as const,
        quantity: m.quantity,
        reference: 'Showmore 官網庫存',
        note: `Counted to ${m.countedTo}`,
        created_by: user.id,
      });
    }
    // Inserted in batches: the trigger runs per row, and one oversized statement is
    // the difference between a slow import and a timed-out one.
    for (let i = 0; i < movements.length; i += 100) {
      const { error } = await sb.from('inventory_movements').insert(movements.slice(i, i + 100));
      if (error) return { ok: false, message: `inventory_movements: ${error.message}` };
    }
  }

  revalidatePath('/overview');
  return { ok: true, summary: plan.summary };
}

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * The Showmore-sourced rows already in this organization, keyed the way the planner
 * needs them. Rows created by hand (no `external_id`) are deliberately invisible here:
 * the import owns only what it created, and must never adopt or overwrite them.
 *
 * The three tables are read separately and joined in memory rather than with embedded
 * selects — `inventory` has no declared relationship to `product_variants` for
 * PostgREST to follow, and the uuid → external-id map is right here anyway.
 */
async function loadExistingState(sb: Client, orgId: string): Promise<ExistingState> {
  const { data: productData } = await sb
    .from('products').select('id, sku, external_id')
    .eq('organization_id', orgId).eq('external_source', EXTERNAL_SOURCE);

  const productRows = (productData ?? []).filter((p): p is typeof p & { external_id: string } => !!p.external_id);
  if (!productRows.length) return { products: [], variants: [], stock: [] };

  const productIds = productRows.map(p => p.id);
  const externalByProductId = new Map(productRows.map(p => [p.id, p.external_id]));

  const [{ data: variantData }, { data: stockData }] = await Promise.all([
    sb.from('product_variants').select('id, sku, external_id, product_id')
      .in('product_id', productIds).eq('external_source', EXTERNAL_SOURCE),
    sb.from('inventory').select('on_hand, product_id, variant_id')
      .eq('organization_id', orgId).in('product_id', productIds),
  ]);

  const variantRows = (variantData ?? []).filter((v): v is typeof v & { external_id: string } => !!v.external_id);
  const externalByVariantId = new Map(variantRows.map(v => [v.id, v.external_id]));

  return {
    products: productRows.map(p => ({ id: p.id, sku: p.sku, externalId: p.external_id })),
    variants: variantRows
      .filter(v => externalByProductId.has(v.product_id))
      .map(v => ({ id: v.id, sku: v.sku, externalId: v.external_id, productExternalId: externalByProductId.get(v.product_id)! })),
    stock: (stockData ?? [])
      .filter(s => externalByProductId.has(s.product_id))
      .map(s => ({
        productExternalId: externalByProductId.get(s.product_id)!,
        variantExternalId: s.variant_id ? externalByVariantId.get(s.variant_id) ?? null : null,
        onHand: Number(s.on_hand),
      })),
  };
}

/** variant external_id → uuid, for the products just written. */
async function loadVariantIds(sb: Client, productIds: string[]): Promise<Map<string, string>> {
  if (!productIds.length) return new Map();
  const out = new Map<string, string>();
  for (let i = 0; i < productIds.length; i += 200) {
    const { data } = await sb.from('product_variants').select('id, external_id')
      .in('product_id', productIds.slice(i, i + 200)).eq('external_source', EXTERNAL_SOURCE);
    for (const v of data ?? []) if (v.external_id) out.set(v.external_id, v.id);
  }
  return out;
}
