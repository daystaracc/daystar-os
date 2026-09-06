import { getT } from '@/lib/i18n/server';
import { LoginForm } from './LoginForm';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const { t } = await getT();
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <div className="text-label uppercase text-ink-3">{t('app.subtitle')}</div>
          <h1 className="mt-1 text-3xl">DAYSTAR OS</h1>
          <p className="mt-2 text-sm text-ink-2">{t('auth.welcome')}</p>
        </div>
        <LoginForm next={next} labels={{ email: t('auth.email'), password: t('auth.password'), signIn: t('auth.signIn'), forgot: t('auth.forgot'), invalid: t('auth.invalid') }} />
      </div>
    </main>
  );
}
