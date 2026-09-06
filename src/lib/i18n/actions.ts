'use server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { LOCALES, type Locale } from './index';

/** Language switch: persists to a cookie (instant) and to the profile (follows the user across devices). */
export async function setLocale(locale: Locale) {
  if (!LOCALES.includes(locale)) return;
  (await cookies()).set('locale', locale, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) await supabase.from('profiles').update({ locale }).eq('id', user.id);
  revalidatePath('/', 'layout');
}
