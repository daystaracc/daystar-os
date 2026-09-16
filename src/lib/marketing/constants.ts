/**
 * Marketing vocabulary (spec §08 — "Is paid / creator spend working?") shared by the
 * data layer, server actions and UI. Lives outside `app/(app)/marketing/actions.ts`
 * because a `'use server'` module may only export async functions. Mirrors
 * `lib/revenue/constants.ts` / `lib/reviews/constants.ts`.
 *
 * Three sub-areas share this one screen: Campaigns, Ad spend, Creators — see the
 * scope note in `lib/data/marketing.ts` for why they're one screen, not three.
 */
export const CAMPAIGN_STATUS = ['planning', 'active', 'completed', 'cancelled'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUS)[number];

export const AD_PLATFORM = ['meta', 'tiktok', 'google', 'other'] as const;
export type AdPlatform = (typeof AD_PLATFORM)[number];

export const CREATOR_PLATFORM = ['instagram', 'tiktok', 'youtube', 'other'] as const;
export type CreatorPlatform = (typeof CREATOR_PLATFORM)[number];

export const CREATOR_STATUS = [
  'prospect', 'contacted', 'agreed', 'product_sent', 'content_pending', 'published', 'successful', 'inactive',
] as const;
export type CreatorStatus = (typeof CREATOR_STATUS)[number];

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: 'forbidden' | 'invalid' | 'failed' };
