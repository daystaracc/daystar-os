import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import { ImportWizard } from './ImportWizard';

export const dynamic = 'force-dynamic';

/**
 * Product-master import (Showmore 商品管理 → 匯出).
 *
 * Members are redirected: the database refuses their writes anyway, so offering the
 * screen would only produce a failure at the end of a long form.
 */
export default async function ImportPage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');
  const [{ data: profile }, { data: m }] = await Promise.all([
    sb.from('profiles').select('locale').eq('id', user.id).single(),
    sb.from('memberships').select('organization_id, role').eq('profile_id', user.id).eq('status', 'active').limit(1).single(),
  ]);
  if (!m) redirect('/no-organization');
  if (m.role === 'member') redirect('/my-work');
  const { t } = await getT(profile?.locale);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">{t('import.title')}</h1>
        <p className="mt-1 text-sm text-ink-2">{t('import.subtitle')}</p>
      </header>

      <ImportWizard labels={{
        choose: t('import.choose'), chooseHint: t('import.chooseHint'),
        parsing: t('import.parsing'), reparse: t('import.reparse'),
        previewTitle: t('import.previewTitle'), products: t('import.products'),
        variants: t('import.variants'), units: t('import.units'),
        costed: t('import.costed'), uncosted: t('import.uncosted'),
        attributes: t('import.attributes'), freeText: t('import.freeText'),
        warnings: t('import.warnings'), confirm: t('import.confirm'),
        importing: t('import.importing'), cancel: t('import.cancel'),
        doneTitle: t('import.doneTitle'), created: t('import.created'),
        updated: t('import.updated'), unchanged: t('import.unchanged'),
        nothing: t('import.nothing'), failed: t('import.failed'),
      }} />
    </div>
  );
}
