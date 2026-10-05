'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { REVIEW_TYPE, REVIEW_SECTION, type ActionResult } from '@/lib/reviews/constants';

// Every mutation returns an ActionResult instead of throwing — same pattern as every
// other screen this session (see app/(app)/tasks/actions.ts for the original).
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

/** `reviews_insert/update` RLS (generic loop, migration 0002): manager-or-above. Delete is founder-only. */
function canManage(role: string) { return role === 'founder' || role === 'manager'; }

function refresh(reviewId?: string) {
  revalidatePath('/reviews');
  if (reviewId) revalidatePath(`/reviews/${reviewId}`);
}

const createSchema = z.object({
  type: z.enum(REVIEW_TYPE),
  period_start: isoDate,
  period_end: isoDate,
}).refine(v => v.period_end >= v.period_start, { message: 'period_end before period_start' });

export async function createReview(raw: unknown): Promise<ActionResult<string>> {
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');
  if (!canManage(c.role)) return fail('forbidden');

  const { data, error } = await c.sb.from('reviews')
    // `answers` is NOT NULL with no DB default — starts empty, same "no answers yet"
    // representation `updateReview` already uses below (notes === null ? {} : { notes }).
    .insert({ ...parsed.data, organization_id: c.orgId, created_by: c.user.id, status: 'draft', answers: {} }).select('id').single();
  // 23505: unique (organization_id, type, period_start) — a review for this period already exists.
  if (error || !data) return fail(error?.code === '23505' ? 'invalid' : error?.code === '42501' ? 'forbidden' : 'failed');
  refresh();
  return ok(data.id);
}

const updateSchema = z.object({
  wins: emptyToNull(z.string().max(5000)).optional(),
  problems: emptyToNull(z.string().max(5000)).optional(),
  decisions: emptyToNull(z.string().max(5000)).optional(),
  priorities: emptyToNull(z.string().max(5000)).optional(),
  // Monthly Q&A (spec: "monthly review Q&A") — no fixed question set exists yet
  // (a real product decision, deliberately not invented here — see the scope note
  // in lib/data/reviews.ts), so this is a single free-text note stored under one
  // key rather than a rigid schema that would need to change the moment real
  // monthly questions are defined.
  notes: emptyToNull(z.string().max(5000)).optional(),
});

export async function updateReview(id: string, raw: unknown): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail('invalid');
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success || Object.keys(parsed.data).length === 0) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');
  if (!canManage(c.role)) return fail('forbidden');

  const { notes, ...rest } = parsed.data;
  const patch: { wins?: string | null; problems?: string | null; decisions?: string | null; priorities?: string | null; answers?: Record<string, string> } = { ...rest };
  if (notes !== undefined) patch.answers = notes === null ? {} : { notes };

  const { data, error } = await c.sb.from('reviews').update(patch).eq('id', id).select('id');
  if (error) return fail('failed');
  if (!data?.length) return fail('forbidden'); // RLS matched no row
  refresh(id);
  return ok(undefined);
}

/**
 * The routine action once wins/problems/decisions/priorities are filled in —
 * separate from `updateReview` the same way `setTaskStatus` and
 * `updateContentStatus` are split out from their screens' general update actions.
 * `completed_at` is stamped once and never overwritten by a later re-complete
 * (mirrors Content's `published_at`), so reopening and re-completing a review for
 * corrections doesn't quietly change its original completion date.
 */
export async function completeReview(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');
  if (!canManage(c.role)) return fail('forbidden');

  const { data: current } = await c.sb.from('reviews').select('completed_at').eq('id', id).maybeSingle();
  const patch: { status: 'completed'; completed_at?: string } = { status: 'completed' };
  if (current && !current.completed_at) patch.completed_at = new Date().toISOString();

  const { data, error } = await c.sb.from('reviews').update(patch).eq('id', id).select('id');
  if (error) return fail('failed');
  if (!data?.length) return fail('forbidden');
  refresh(id);
  return ok(undefined);
}

/** Reopens a completed review for corrections. `completed_at` is left as-is — it records when the review was first completed, not its current status. */
export async function reopenReview(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');
  if (!canManage(c.role)) return fail('forbidden');

  const { data, error } = await c.sb.from('reviews').update({ status: 'draft' }).eq('id', id).select('id');
  if (error) return fail('failed');
  if (!data?.length) return fail('forbidden');
  refresh(id);
  return ok(undefined);
}

/** `reviews_delete` RLS: founder-only. Cascades to its metrics. */
export async function deleteReview(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');
  if (c.role !== 'founder') return fail('forbidden');

  const { data, error } = await c.sb.from('reviews').delete().eq('id', id).select('id');
  if (error) return fail('failed');
  if (!data?.length) return fail('forbidden');
  refresh();
  return ok(undefined);
}

// ---- metrics -----------------------------------------------------------------
// `review_metrics_all` RLS: manager-or-above on the parent review's organization,
// for every operation including select — a stricter gate than `reviews` itself
// gets. No auto-fill (see lib/data/reviews.ts); this is a real number logged by
// hand, section by section, as a starting point for the automatic pre-fill this
// screen doesn't attempt yet.

const addMetricSchema = z.object({
  reviewId: uuid,
  section: z.enum(REVIEW_SECTION),
  metric: z.string().trim().min(1).max(100),
  value: emptyToNull(z.coerce.number()),
  previousValue: emptyToNull(z.coerce.number()),
  note: emptyToNull(z.string().max(500)),
});

export async function addReviewMetric(raw: unknown): Promise<ActionResult<string>> {
  const parsed = addMetricSchema.safeParse(raw);
  if (!parsed.success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');

  const { reviewId, value, previousValue, ...rest } = parsed.data;
  const { data, error } = await c.sb.from('review_metrics')
    .insert({ review_id: reviewId, value, previous_value: previousValue, ...rest }).select('id').single();
  if (error || !data) return fail(error?.code === '42501' ? 'forbidden' : 'failed');
  refresh(reviewId);
  return ok(data.id);
}

export async function deleteReviewMetric(id: string, reviewId: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success || !uuid.safeParse(reviewId).success) return fail('invalid');
  const c = await ctx();
  if (!c) return fail('forbidden');

  const { data, error } = await c.sb.from('review_metrics').delete().eq('id', id).select('id');
  if (error) return fail('failed');
  if (!data?.length) return fail('forbidden');
  refresh(reviewId);
  return ok(undefined);
}
