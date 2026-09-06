'use server';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { homeFor, type Role } from '@/lib/permissions';

const schema = z.object({ email: z.string().email(), password: z.string().min(6), next: z.string().optional() });

export async function signIn(_prev: { error?: string } | undefined, formData: FormData): Promise<{ error?: string }> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalid' };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
  if (error) return { error: 'invalid' };

  // Resolve the home screen here rather than bouncing through "/": redirecting an
  // action to a page that itself redirects leaves the client router with an empty tree.
  const { data: membership } = await supabase.from('memberships').select('role').eq('profile_id', data.user.id).eq('status', 'active').limit(1).single();
  const home = membership ? homeFor(membership.role as Role) : '/no-organization';
  redirect(parsed.data.next && parsed.data.next.startsWith('/') ? parsed.data.next : home);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

/** Returns `true` once the request has been made — the same answer whether or not the address exists. */
export async function requestPasswordReset(_prev: boolean, formData: FormData): Promise<boolean> {
  const email = String(formData.get('email') ?? '');
  if (!z.string().email().safeParse(email).success) return false;
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/reset-password` });
  return true;
}
