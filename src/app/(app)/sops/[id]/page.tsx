import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import type { Role } from '@/lib/permissions';
import { getSopDetail, getSopOptions } from '@/lib/data/sops';
import { SOP_CATEGORY, SOP_STATUS } from '@/lib/sops/constants';
import { SopDrawer } from '@/components/sops/SopDrawer';
import { SopActions } from '@/components/sops/SopActions';

export const dynamic = 'force-dynamic';

type Search = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const STATUS_TONE = { draft: 'pill-neutral', active: 'pill-ok', needs_review: 'pill-warn', archived: 'pill-neutral' } as const;

export default async function SopDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
  const { id } = await params;
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
  const { t, locale } = await getT(profile?.locale);

  const sop = await getSopDetail(m.organization_id, id, role, locale);
  if (!sop) notFound();

  const editOpen = first(sp.edit) === '1' && sop.canEdit;
  const options = sop.canEdit ? await getSopOptions(m.organization_id) : { owners: [] };

  const categoryLabels = Object.fromEntries(SOP_CATEGORY.map(x => [x, t(`sops.category_.${x}`)])) as Record<(typeof SOP_CATEGORY)[number], string>;
  const statusLabels = Object.fromEntries(SOP_STATUS.map(x => [x, t(`sops.status_.${x}`)])) as Record<(typeof SOP_STATUS)[number], string>;

  return (
    <div className="space-y-6 animate-fade-up">
      <Link href="/sops" className="inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" />{t('sops.backToSops')}</Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate">{sop.title}</h1>
            <span className="pill pill-neutral">{categoryLabels[sop.category]}</span>
            <span className={`pill ${STATUS_TONE[sop.status]}`}>{statusLabels[sop.status]}</span>
          </div>
          <p className="mt-1 text-xs text-ink-3">{t('sops.version', { n: sop.version })} · {sop.owner?.name ?? t('sops.noOwner')} · {t('sops.updated')} {new Date(sop.updatedAt).toLocaleDateString(locale === 'en' ? 'en-US' : 'zh-TW')}</p>
        </div>
        <SopActions sopId={sop.id} canEdit={sop.canEdit} canDelete={sop.canDelete}
          labels={{ edit: t('common.edit'), delete: t('sops.delete'), deleteConfirm: t('sops.deleteConfirm'), deleteFailed: t('sops.deleteFailed') }} />
      </header>

      <div className="card card-pad">
        {sop.contentMd ? (
          <p className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-ink-2">{sop.contentMd}</p>
        ) : (
          <p className="text-sm text-ink-3">{t('sops.contentEmpty')}</p>
        )}
      </div>

      {editOpen && (
        <SopDrawer options={options} onCloseHref={`/sops/${sop.id}`}
          sop={{ id: sop.id, title: sop.title, category: sop.category, status: sop.status, ownerId: sop.owner?.id ?? '', contentMd: sop.contentMd }}
          labels={{
            newSop: t('sops.newSop'), editSop: t('sops.editSop'),
            title: t('sops.title'), category: t('sops.category'), status: t('sops.status'), owner: t('common.owner'), content: t('sops.content'),
            noOwner: t('sops.noOwner'),
            save: t('sops.save'), saving: t('sops.saving'), cancel: t('sops.cancel'), create: t('sops.create'),
            close: t('common.close'), saveFailed: t('sops.saveFailed'),
            categoryLabels, statusLabels,
          }} />
      )}
    </div>
  );
}
