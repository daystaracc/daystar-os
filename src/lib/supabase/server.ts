import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/types/database';

/** Supabase client for Server Components, Server Actions and Route Handlers (uses the user's session → RLS applies). */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (all) => { try { all.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch { /* called from a Server Component: middleware refreshes the session instead */ } },
    },
  });
}
