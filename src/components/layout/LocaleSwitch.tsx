'use client';
import { useTransition } from 'react';
import { setLocale } from '@/lib/i18n/actions';
import type { Locale } from '@/lib/i18n';

/** English ↔ 繁體中文. One click; persists to cookie + profile via a server action. */
export function LocaleSwitch({ locale, switchTo }: { locale: Locale; switchTo: string }) {
  const [pending, start] = useTransition();
  const next: Locale = locale === 'en' ? 'zh-Hant' : 'en';
  return (
    <button onClick={() => start(async () => { await setLocale(next); })} disabled={pending} aria-label={switchTo}
      className="btn-ghost h-8 px-2 text-xs font-medium tabular-nums">
      <span className={locale === 'en' ? 'text-ink' : 'text-ink-3'}>EN</span><span className="text-ink-3">/</span><span className={locale === 'zh-Hant' ? 'text-ink' : 'text-ink-3'}>繁</span>
    </button>
  );
}
