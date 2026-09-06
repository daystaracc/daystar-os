'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

/**
 * The whole Tasks screen is URL state: view, layout, filters, open drawer and open
 * panel. That keeps every state linkable and shareable, and lets the server do the
 * filtering instead of shipping the whole table to the browser.
 */
export function useTaskParams() {
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

export const FILTER_KEYS = ['assignee', 'project', 'status', 'priority', 'label'] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];
