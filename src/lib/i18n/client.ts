'use client';
import { useEffect, useState } from 'react';
import { en } from './en';
import { DEFAULT_LOCALE, LOCALES, getDictionary, makeT, type Dictionary, type Locale } from './index';

/**
 * Translator for client components that cannot receive strings as props — error
 * boundaries, essentially. Everything else is handed resolved strings by the server,
 * which is cheaper and avoids the first-paint locale flip this hook accepts.
 */
export function useT() {
  const [dict, setDict] = useState<Dictionary>(en as Dictionary);

  useEffect(() => {
    const cookie = document.cookie.split('; ').find(c => c.startsWith('locale='))?.split('=')[1];
    const locale = (LOCALES as string[]).includes(cookie ?? '') ? (cookie as Locale) : DEFAULT_LOCALE;
    let alive = true;
    getDictionary(locale).then(d => { if (alive) setDict(d); });
    return () => { alive = false; };
  }, []);

  return makeT(dict);
}
