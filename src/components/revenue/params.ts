'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

/**
 * Revenue screen state (period preset, open drawer, entry being edited) lives in the
 * URL, same as `components/tasks/params.ts` — every state stays linkable and shareable.
 */
export function useRevenueParams() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const href = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }, [params, pathname]);

  const set = useCallback((patch: Record<string, string | null>) => {
    router.push(href(patch), { scroll: false });
  }, [href, router]);

  return { params, href, set };
}
