import { getT } from '@/lib/i18n/server';
import { ResetForm } from './ResetForm';

export default async function ResetPasswordPage() {
  const { t } = await getT();
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <div className="text-label uppercase text-ink-3">{t('app.subtitle')}</div>
          <h1 className="mt-1 text-3xl">{t('auth.reset')}</h1>
          <p className="mt-2 text-sm text-ink-2">{t('auth.resetIntro')}</p>
        </div>
        <ResetForm labels={{ email: t('auth.email'), reset: t('auth.reset'), sent: t('auth.resetSent'), back: t('auth.backToSignIn') }} />
      </div>
    </main>
  );
}
