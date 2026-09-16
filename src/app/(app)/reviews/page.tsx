import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Plus, ClipboardList } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import { can, type Role } from '@/lib/permissions';
import { getReviewsPage } from '@/lib/data/reviews';
import { REVIEW_TYPE, type ReviewType } from '@/lib/reviews/constants';
import { NewReviewDrawer } from '@/components/reviews/NewReviewDrawer';

export const dynamic = 'force-dynamic';

type Search = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const STATUS_TONE = { draft: 'pill-neutral', completed: 'pill-ok' } as const;

/**
 * REVIEWS (spec §14 WBR/MBR) — "What did we learn, what do we decide?"
 *
 * Gated to founder/manager in-app (`can.viewReviews`) even though `reviews_select`
 * RLS itself would let any member read this table — see the note on that permission
 * in lib/permissions.ts for why. See lib/data/reviews.ts for what this screen
 * deliberately does NOT attempt yet (automatic metric pre-fill).
 */
export default async function ReviewsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
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
  const { t } = await getT(profile?.locale);

  const page = await getReviewsPage(m.organization_id);
  const drawerOpen = first(sp.new) === '1';

  const typeFilter = (REVIEW_TYPE as readonly string[]).includes(first(sp.type) ?? '') ? (first(sp.type) as ReviewType) : undefined;
  const reviews = typeFilter ? page.reviews.filter(r => r.type === typeFilter) : page.reviews;

  const typeLabels = { weekly: t('reviews.type_.weekly'), monthly: t('reviews.type_.monthly') };
  const statusLabels = { draft: t('reviews.status_.draft'), completed: t('reviews.status_.completed') };
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6 animate-fade-up">
      <header className="flex items-baseline justify-between">
        <h1>{t('reviews.heading')}</h1>
        <Link href="?new=1" scroll={false} className="btn-primary"><Plus className="h-4 w-4" />{t('reviews.newReview')}</Link>
      </header>

      <div className="flex flex-wrap gap-1.5">
        <Link href="/reviews" scroll={false} className={`pill ${!typeFilter ? 'pill-ok' : 'pill-neutral'}`}>{t('common.all')}</Link>
        {REVIEW_TYPE.map(rt => (
          <Link key={rt} href={`?type=${rt}`} scroll={false} className={`pill ${typeFilter === rt ? 'pill-ok' : 'pill-neutral'}`}>{typeLabels[rt]}</Link>
        ))}
      </div>

      {page.error ? (
        <div className="card card-pad text-sm text-bad">{t('reviews.loadFailed')}</div>
      ) : !reviews.length ? (
        <div className="card card-pad text-sm text-ink-3">{typeFilter ? t('reviews.emptyFiltered') : t('reviews.empty')}</div>
      ) : (
        <ul className="card divide-y divide-border">
          {reviews.map(r => (
            <li key={r.id}>
              <Link href={`/reviews/${r.id}`} className="row-hover flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap sm:gap-4">
                <ClipboardList className="h-4 w-4 shrink-0 text-ink-3" />
                <span className="pill pill-neutral w-20 shrink-0 justify-center">{typeLabels[r.type]}</span>
                <span className="min-w-0 flex-1 basis-full truncate text-sm font-medium sm:basis-auto">{r.periodStart} – {r.periodEnd}</span>
                <span className={`pill ${STATUS_TONE[r.status]} w-24 shrink-0 justify-center`}>{statusLabels[r.status]}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {drawerOpen && (
        <NewReviewDrawer onCloseHref="/reviews" today={today}
          labels={{
            newReview: t('reviews.newReview'), type: t('reviews.type'), periodStart: t('reviews.periodStart'), periodEnd: t('reviews.periodEnd'),
            typeLabels,
            create: t('reviews.create'), creating: t('reviews.creating'), cancel: t('reviews.cancel'),
            close: t('common.close'), saveFailed: t('reviews.saveFailed'), duplicateFailed: t('reviews.duplicateFailed'),
          }} />
      )}
    </div>
  );
}
