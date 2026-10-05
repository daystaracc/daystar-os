'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { CONTENT_TYPE, CONTENT_PLATFORM, CONTENT_STATUS, PILLAR_COLOR, type ActionResult, type ContentStatus } from '@/lib/content/constants';

// Every mutation returns an ActionResult instead of throwing — same pattern as
// app/(app)/tasks/actions.ts, app/(app)/projects/actions.ts, app/(app)/goals/actions.ts
// and app/(app)/products/actions.ts.
const ok = <T,>(data: T): ActionResult<T> => ({ ok: true, data });
const fail = (error: 'forbidden' | 'invalid' | 'failed'): ActionResult<never> => ({ ok: false, error });

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const emptyToNull = <T extends z.ZodTypeAny>(s: T) =>
  z.preprocess(v => (v === '' || v === undefined ? null : v), s.nullable());

async function ctx() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data: m } = await sb.from('memberships').select('organization_id, role').eq('profile_id', user.id).eq('status', 'active').limit(1).single();
  if (!m) return null;
  return { sb, user, orgId: m.organization_id, role: m.role };
}

function refresh() {
  revalidatePath('/content');
  revalidatePath('/overview');
}

// `content_insert` RLS: any active member may create content.
const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content_type: z.enum(CONTENT_TYPE).default('short_video'),
  platform: z.enum(CONTENT_PLATFORM).default('instagram'),
  owner_id: emptyToNull(uuid),
  product_id: emptyToNull(uuid),
  campaign_id: emptyToNull(uuid),
  // Added 2026-10-02 (migration 0012) — the main categorization axis now; optional
  // same as campaign_id/product_id, since not every piece is pillar-sorted from creation.
  pillar_id: emptyToNull(uuid),
  talent: emptyToNull(z.string().max(200)),
  concept: emptyToNull(z.string().max(2000)),
  hook: emptyToNull(z.string().max(500)),
  shoot_date: emptyToNull(isoDate),
  publish_date: emptyToNull(isoDate),
  url: emptyToNull(z.string().url().max(1000)),
  notes: emptyToNull(z.string().max(5000)),
});
// Every field explicitly `.optional()` — same style as products/actions.ts.
const updateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  content_type: z.enum(CONTENT_TYPE).optional(),
  platform: z.enum(CONTENT_PLATFORM).optional(),
  owner_id: emptyToNull(uuid).optional(),
  product_id: emptyToNull(uuid).optional(),
  campaign_id: emptyToNull(uuid).optional(),
  pillar_id: emptyToNull(uuid).optional(),
  talent: emptyToNull(z.string().max(200)).optional(),
  concept: emptyToNull(z.string().max(2000)).optional(),
  hook: emptyToNull(z.string().max(500)).optional(),
  shoot_date: emptyToNull(isoDate).optional(),
  publish_date: emptyToNull(isoDate).optional(),
  url: emptyToNull(z.string().url().max(1000)).optional(),
  notes: emptyToNull(z.string().max(5000)).optional(),
  status: z.enum(CONTENT_STATUS).optional(),
});

/** New content drawer: Title · Type · Platform · Owner · Product, plus the Advanced fields. Starts at `idea`. */
export async function createContent(raw: unknown): Promise<ActionResult<string>> {
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');

  const { data, error } = await c.sb.from('content')
    .insert({ ...parsed.data, organization_id: c.orgId, created_by: c.user.id, status: 'idea' }).select('id').single();
  if (error || !data) return fail(error?.code === '42501' ? 'forbidden' : 'failed');
  refresh();
  return ok(data.id);
}

/**
 * `content_update` RLS: managers/founders edit anything; everyone else only what
 * they own or created (see `canEditContent` in lib/permissions.ts, which the
 * drawer/list use to decide whether to show the edit control at all — the database
 * is the real gate, this just avoids offering a button that would fail).
 */
export async function updateContent(id: string, raw: unknown): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail('invalid');
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success || Object.keys(parsed.data).length === 0) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');

  const { data, error } = await c.sb.from('content').update(parsed.data).eq('id', id).select('id');
  if (error) return fail('failed');
  if (!data?.length) return fail('forbidden'); // RLS matched no row
  refresh();
  return ok(undefined);
}

/**
 * Inline "advance stage" control on the list — the routine action of moving a piece
 * to the next pipeline column without opening the full edit drawer, same idea as
 * `setTaskStatus` and Goals' `updateKeyResultValue`. The first time a piece reaches
 * `posted` (renamed from `published` by migration 0012 — see that file's header
 * comment), this also stamps `published_at` — once set it's never overwritten by a
 * later save, so re-editing a posted piece can't quietly change when it "went live".
 */
export async function updateContentStatus(id: string, status: ContentStatus): Promise<ActionResult> {
  if (!uuid.safeParse(id).success || !CONTENT_STATUS.includes(status)) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');

  const patch: { status: ContentStatus; published_at?: string } = { status };
  if (status === 'posted') {
    const { data: current } = await c.sb.from('content').select('published_at').eq('id', id).maybeSingle();
    if (current && !current.published_at) patch.published_at = new Date().toISOString();
  }
  const { data, error } = await c.sb.from('content').update(patch).eq('id', id).select('id');
  if (error) return fail('failed');
  if (!data?.length) return fail('forbidden');
  refresh();
  return ok(undefined);
}

// ---- pillars (added 2026-10-02, migration 0012) --------------------------
// `pillars_insert`/`pillars_update` RLS: manager-or-above (mirrors `campaigns`,
// a content-marketing taxonomy — not founder-only like `departments`).
// `pillars_delete`: founder-only, same as `departments` and every other
// generic-loop table's delete policy.

const pillarSchema = z.object({
  name: z.string().trim().min(1).max(100),
  name_zh: emptyToNull(z.string().max(100)),
  color: z.enum(PILLAR_COLOR).default('gold'),
  sort_order: z.number().int().default(0),
});

function refreshPillars() {
  revalidatePath('/content');
}

/** "Manage pillars" modal — create. Manager-or-above only (`pillars_insert` RLS). */
export async function createPillar(raw: unknown): Promise<ActionResult<string>> {
  const parsed = pillarSchema.safeParse(raw);
  if (!parsed.success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');

  const { data, error } = await c.sb.from('pillars')
    .insert({ ...parsed.data, organization_id: c.orgId, created_by: c.user.id }).select('id').single();
  if (error || !data) return fail(error?.code === '42501' ? 'forbidden' : error?.code === '23505' ? 'invalid' : 'failed');
  refreshPillars();
  return ok(data.id);
}

/** "Manage pillars" modal — rename/recolor/reorder. Manager-or-above only (`pillars_update` RLS). */
export async function updatePillar(id: string, raw: unknown): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail('invalid');
  const parsed = pillarSchema.partial().safeParse(raw);
  if (!parsed.success || Object.keys(parsed.data).length === 0) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');

  const { data, error } = await c.sb.from('pillars').update(parsed.data).eq('id', id).select('id');
  if (error) return fail(error.code === '23505' ? 'invalid' : 'failed');
  if (!data?.length) return fail('forbidden');
  refreshPillars();
  return ok(undefined);
}

/**
 * "Manage pillars" modal — delete. Founder-only (`pillars_delete` RLS). Any content
 * piece on this pillar is left in place with `pillar_id` set back to null (the
 * column's `on delete set null`, migration 0012) — deleting a pillar never deletes
 * content.
 */
export async function deletePillar(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');

  const { data, error } = await c.sb.from('pillars').delete().eq('id', id).select('id');
  if (error) return fail('failed');
  if (!data?.length) return fail('forbidden');
  refreshPillars();
  return ok(undefined);
}

/** `content_delete` RLS: manager-or-above only — no owner carve-out, unlike update. */
export async function deleteContent(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');

  const { data, error } = await c.sb.from('content').delete().eq('id', id).select('id');
  if (error) return fail('failed');
  if (!data?.length) return fail('forbidden');
  refresh();
  return ok(undefined);
}
