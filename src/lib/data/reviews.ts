import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { ReviewType, ReviewStatus, ReviewSection } from '@/lib/reviews/constants';

export interface ReviewRow {
  id: string;
  type: ReviewType;
  periodStart: string;
  periodEnd: string;
  status: ReviewStatus;
  completedAt: string | null;
}

export interface ReviewMetricRow {
  id: string;
  section: ReviewSection;
  metric: string;
  value: number | null;
  previousValue: number | null;
  note: string | null;
}

export interface ReviewDetail extends ReviewRow {
  wins: string | null;
  problems: string | null;
  decisions: string | null;
  priorities: string | null;
  answers: Record<string, string>;
  metrics: ReviewMetricRow[];
}

export interface ReviewsPage { reviews: ReviewRow[]; error: boolean }

const SELECT = 'id, type, period_start, period_end, status, completed_at';
const DETAIL_SELECT = 'id, type, period_start, period_end, status, completed_at, wins, problems, decisions, priorities, answers';

/**
 * REVIEWS (spec §14 WBR/MBR) — "What did we learn, what do we decide?"
 *
 * `reviews_select` RLS (generic loop): every active member can technically read
 * this table, but `/reviews` is gated to founder/manager in the page itself — see
 * `can.viewReviews` in lib/permissions.ts for why. `review_metrics_all` requires
 * manager-or-above for every operation including select, so a member could never
 * usefully view this screen anyway (the review row with no metrics).
 *
 * Deliberately NOT built in this pass: automatic metric pre-fill with a
 * previous-period comparison (the spec's "weekly 13-metric review"). Which numbers
 * belong in that fixed set — across Growth/Product/Content/CRM/Operations/Finance/
 * Team — is a real product decision, not something to invent unattended (same
 * reasoning as the deferred customer/CRM phone-hashing work). What's built instead:
 * the actual review workflow (create for a period, write wins/problems/decisions/
 * priorities, mark complete, browse history) plus a manual "add metric" control so
 * a real number can be logged by hand today — see `addReviewMetric` in
 * app/(app)/reviews/actions.ts.
 */
export async function getReviewsPage(orgId: string): Promise<ReviewsPage> {
  const sb = await createClient();
  const { data, error } = await sb.from('reviews').select(SELECT).eq('organization_id', orgId).order('period_start', { ascending: false });
  if (error) return { reviews: [], error: true };

  const reviews: ReviewRow[] = (data ?? []).map(r => ({
    id: r.id,
    type: r.type as ReviewType,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    status: r.status as ReviewStatus,
    completedAt: r.completed_at,
  }));
  return { reviews, error: false };
}

export async function getReviewDetail(orgId: string, reviewId: string): Promise<ReviewDetail | null> {
  const sb = await createClient();
  const { data: r } = await sb.from('reviews').select(DETAIL_SELECT).eq('organization_id', orgId).eq('id', reviewId).maybeSingle();
  if (!r) return null;

  // review_metrics has no organization_id of its own — RLS reaches it through the
  // parent review, and this query does the same by scoping to review_id (already
  // confirmed to belong to this org above).
  const { data: metrics } = await sb.from('review_metrics').select('id, section, metric, value, previous_value, note').eq('review_id', reviewId);

  return {
    id: r.id,
    type: r.type as ReviewType,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    status: r.status as ReviewStatus,
    completedAt: r.completed_at,
    wins: r.wins,
    problems: r.problems,
    decisions: r.decisions,
    priorities: r.priorities,
    answers: (r.answers ?? {}) as Record<string, string>,
    metrics: (metrics ?? []).map(m => ({
      id: m.id,
      section: m.section as ReviewSection,
      metric: m.metric,
      value: m.value !== null ? Number(m.value) : null,
      previousValue: m.previous_value !== null ? Number(m.previous_value) : null,
      note: m.note,
    })),
  };
}
