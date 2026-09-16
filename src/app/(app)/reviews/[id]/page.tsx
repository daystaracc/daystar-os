import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import { can, type Role } from '@/lib/permissions';
import { getReviewDetail } from '@/lib/data/reviews';
import { REVIEW_SECTION } from '@/lib/reviews/constants';
import { ReviewActions } from '@/components/reviews/ReviewActions';
import { ReviewForm } from '@/components/reviews/ReviewForm';
import { ReviewMetrics } from '@/components/reviews/ReviewMetrics';

export const dynamic = 'force-dynamic';

const STATUS_TONE = { draft: 'pill-neutral', completed: 'pill-ok' } as const;

/** Review detail — same founder/manager gate as the list page (`can.viewReviews`); see that page's header comment for why. */
export default async function ReviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: profile }, { data: m }] = await Promise.all([
    sb.from('profiles').select('locale').eq('id', user.id).single(),
    sb.from('memberships').select('organization_id, role').eq('profile_id', user.id).eq('status', 'active').limit(1).single(),
  ]);
  if (!m) redirect('/no-organization');
  const role = m.role as Role;
  if (!can.viewReviews(role)) redirect('/my-work');
  const { t, locale } = await getT(profile?.locale);

  const review = await getReviewDetail(m.organization_id, id);
  if (!review) notFound();

  const typeLabels = { weekly: t('reviews.type_.weekly'), monthly: t('reviews.type_.monthly') };
  const statusLabels = { draft: t('reviews.status_.draft'), completed: t('reviews.status_.completed') };
  const sectionLabels = Object.fromEntries(REVIEW_SECTION.map(s => [s, t(`reviews.sectionLabels.${s}`)])) as Record<(typeof REVIEW_SECTION)[number], string>;

  return (
    <div className="space-y-6 animate-fade-up">
      <Link href="/reviews" className="inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" />{t('reviews.backToReviews')}</Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate">{review.periodStart} – {review.periodEnd}</h1>
            <span className="pill pill-neutral">{typeLabels[review.type]}</span>
            <span className={`pill ${STATUS_TONE[review.status]}`}>{statusLabels[review.status]}</span>
          </div>
          {review.completedAt && (
            <p className="mt-1 text-xs text-ink-3">
              {t('reviews.status_.completed')} {new Date(review.completedAt).toLocaleDateString(locale === 'en' ? 'en-US' : 'zh-TW')}
            </p>
          )}
        </div>
        <ReviewActions reviewId={review.id} status={review.status} canDelete={role === 'founder'}
          labels={{
            markComplete: t('reviews.markComplete'), reopen: t('reviews.reopen'),
            delete: t('reviews.delete'), deleteConfirm: t('reviews.deleteConfirm'),
            saveFailed: t('reviews.saveFailed'), deleteFailed: t('reviews.deleteFailed'),
          }} />
      </header>

      <ReviewForm reviewId={review.id} type={review.type}
        initial={{
          wins: review.wins ?? '', problems: review.problems ?? '', decisions: review.decisions ?? '', priorities: review.priorities ?? '',
          notes: review.answers.notes ?? '',
        }}
        labels={{
          wins: t('reviews.wins'), problems: t('reviews.problems'), decisions: t('reviews.decisions'), priorities: t('reviews.priorities'), notes: t('reviews.notes'),
          save: t('reviews.save'), saving: t('reviews.saving'), saveFailed: t('reviews.saveFailed'),
        }} />

      <ReviewMetrics reviewId={review.id} metrics={review.metrics}
        labels={{
          metrics: t('reviews.metrics'), empty: t('reviews.metricsEmpty'), addMetric: t('reviews.addMetric'),
          section: t('reviews.section'), metric: t('reviews.metric'), value: t('reviews.value'), previousValue: t('reviews.previousValue'), note: t('reviews.note'),
          add: t('reviews.add'), adding: t('reviews.adding'), cancel: t('reviews.cancel'),
          delete: t('common.delete'), deleteConfirm: t('reviews.deleteConfirm'), saveFailed: t('reviews.saveFailed'), deleteFailed: t('reviews.deleteFailed'),
          sectionLabels,
        }} />
    </div>
  );
}
