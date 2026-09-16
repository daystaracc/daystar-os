import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Upload, ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import { can, type Role } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

/**
 * Settings landing page — founder-only, matching `lib/nav.ts`'s `settings` item
 * (`roles: ['founder']`) and `organizations_update` RLS. This didn't exist at all
 * before 2026-09-15: the sidebar has linked to `/settings` since the nav was
 * built, but only `/settings/import` ever had a `page.tsx` — clicking "Settings"
 * 404'd for every founder. Found while auditing for exactly this class of bug
 * (the same one global search and notifications had, fixed 2026-09-14).
 *
 * Deliberately minimal: organization name/slug/created-at are shown read-only,
 * not editable. `organizations.currency`/`.timezone` exist in the schema but
 * nothing in this app actually reads them yet (revenue formatting is hardcoded
 * to TWD everywhere — see `lib/calculations/format.ts`), so an edit form for
 * them would change a value nothing acts on — worse than not having the field.
 * The one real sub-section today is the product/order import; this page is a
 * hub for that and whatever gets added here later (member invites, currency
 * once something consumes it, etc.), not a stand-in for a settings feature
 * that hasn't been asked for.
 */
export default async function SettingsPage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: profile }, { data: m }] = await Promise.all([
    sb.from('profiles').select('locale').eq('id', user.id).single(),
    sb.from('memberships').select('organization_id, role').eq('profile_id', user.id).eq('status', 'active').limit(1).single(),
  ]);
  if (!m) redirect('/no-organization');
  const role = m.role as Role;
  if (!can.viewSettings(role)) redirect('/my-work');
  const { t, locale } = await getT(profile?.locale);

  const { data: org } = await sb.from('organizations').select('name, slug, created_at').eq('id', m.organization_id).single();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">{t('settings.heading')}</h1>
        <p className="mt-1 text-sm text-ink-2">{t('settings.subtitle')}</p>
      </header>

      <section className="space-y-2">
        <h2 className="label">{t('settings.orgSection')}</h2>
        <div className="card card-pad grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3">
          <Field label={t('settings.orgName')} value={org?.name ?? '—'} />
          <Field label={t('settings.orgSlug')} value={org?.slug ?? '—'} />
          <Field label={t('settings.orgSince')} value={org?.created_at ? new Date(org.created_at).toLocaleDateString(locale === 'zh-Hant' ? 'zh-TW' : 'en-US') : '—'} />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="label">{t('settings.dataSection')}</h2>
        <ul className="card divide-y divide-border">
          <li>
            <Link href="/settings/import" className="row-hover flex items-center gap-3 px-4 py-3">
              <Upload className="h-4 w-4 shrink-0 text-ink-3" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{t('settings.importCard')}</div>
                <div className="truncate text-xs text-ink-3">{t('settings.importCardDetail')}</div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-ink-3" />
            </Link>
          </li>
        </ul>
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="label">{label}</dt>
      <dd className="truncate text-sm font-medium">{value}</dd>
    </div>
  );
}
