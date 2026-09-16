/**
 * CRM vocabulary (spec §09 — "Are customers coming back?") shared by the data
 * layer, server actions and UI. Lives outside `app/(app)/crm/actions.ts` because a
 * `'use server'` module may only export async functions. Mirrors
 * `lib/marketing/constants.ts` / `lib/reviews/constants.ts`.
 */
export const CRM_FLOW_KEY = [
  'welcome', 'abandoned_cart', 'post_purchase', 'review_request', 'cross_sell', 'winback',
  'vip', 'launch', 'restock', 'birthday', 'lapsed', 'high_value',
] as const;
export type CrmFlowKey = (typeof CRM_FLOW_KEY)[number];

export const CRM_FLOW_CHANNEL = ['line', 'email', 'sms', 'other'] as const;
export type CrmFlowChannel = (typeof CRM_FLOW_CHANNEL)[number];

export const CRM_FLOW_STATUS = ['planned', 'draft', 'active', 'paused'] as const;
export type CrmFlowStatus = (typeof CRM_FLOW_STATUS)[number];

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: 'forbidden' | 'invalid' | 'failed' };
