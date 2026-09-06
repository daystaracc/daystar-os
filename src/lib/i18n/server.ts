import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { DEFAULT_LOCALE, LOCALES, getDictionary, makeT, type Locale } from './index';

const asLocale = (v?: string | null): Locale | undefined =>
  v && (LOCALES as string[]).includes(v) ? (v as Locale) : undefined;

/**
 * Locale resolution order: cookie set by the switch → profile.locale → default (zh-Hant).
 *
 * Callers that already hold the profile (the app shell) pass it in. Callers that do
 * not — the root layout, which sets `<html lang>` — would otherwise see only the
 * cookie and label an English page as zh-Hant on a device that has never used the
 * switch, so the profile is looked up here as a last step before the default.
 */
export async function getLocale(profileLocale?: string | null): Promise<Locale> {
  const fromCookie = asLocale((await cookies()).get('locale')?.value);
  if (fromCookie) return fromCookie;

  const fromArg = asLocale(profileLocale);
  if (fromArg) return fromArg;

  return (await signedInProfileLocale()) ?? DEFAULT_LOCALE;
}

/** The signed-in user's saved preference, or undefined when nobody is signed in. */
async function signedInProfileLocale(): Promise<Locale | undefined> {
  try {
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return undefined;
    const { data } = await sb.from('profiles').select('locale').eq('id', user.id).single();
    return asLocale(data?.locale);
  } catch {
    return undefined; // never let language resolution break a render
  }
}

export async function getT(profileLocale?: string | null) {
  const locale = await getLocale(profileLocale);
  const dict = await getDictionary(locale);
  return { locale, t: makeT(dict), dict };
}
