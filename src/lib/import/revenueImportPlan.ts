/**
 * Turns Showmore's parsed order export (`showmore.ts`'s `days` — one row per
 * date+channel) plus what's already in `sales_daily` into an explicit write plan.
 * Pure, so the wizard can show exactly what will happen before anything is written,
 * mirroring `productImportPlan.ts`.
 *
 * Unlike the product import, there is no `external_id` to key on — `sales_daily`'s
 * own `unique(organization_id, date, channel_id)` already is the identity. A day is
 * "new" when no row exists for that date+channel yet, "changed" when one exists but
 * orders/gross/refunds differ from what Showmore now reports, and "unchanged"
 * otherwise (re-importing the same file is then visibly a no-op, not just silently
 * harmless). `platform_fees`, `sessions` and `notes` are deliberately outside this
 * plan — Showmore's order export reports none of them, so the write must never touch
 * those columns, or a re-import would erase a manually-entered session count or note.
 */
import type { DayChannelTotals } from './showmore';

export interface ExistingRevenueDay { date: string; channelKey: string; orders: number; gross_revenue: number; refunds: number }

export interface PlannedRevenueDay {
  date: string;
  channelKey: string;
  orders: number;
  gross_revenue: number;
  refunds: number;
  isNew: boolean;
  changed: boolean;
}

export interface RevenueImportPlan {
  days: PlannedRevenueDay[];
  summary: {
    created: number; updated: number; unchanged: number;
    totalOrders: number; totalGross: number; totalRefunds: number;
  };
}

export function planRevenueImport(parsedDays: DayChannelTotals[], existing: ExistingRevenueDay[]): RevenueImportPlan {
  const byKey = new Map(existing.map(e => [`${e.date}|${e.channelKey}`, e]));

  const days: PlannedRevenueDay[] = parsedDays.map(d => {
    const found = byKey.get(`${d.date}|${d.channelKey}`);
    const changed = !found || found.orders !== d.orders || found.gross_revenue !== d.gross || found.refunds !== d.refunds;
    return { date: d.date, channelKey: d.channelKey, orders: d.orders, gross_revenue: d.gross, refunds: d.refunds, isNew: !found, changed };
  });

  return {
    days,
    summary: {
      created: days.filter(d => d.isNew).length,
      updated: days.filter(d => !d.isNew && d.changed).length,
      unchanged: days.filter(d => !d.isNew && !d.changed).length,
      totalOrders: parsedDays.reduce((a, d) => a + d.orders, 0),
      totalGross: parsedDays.reduce((a, d) => a + d.gross, 0),
      totalRefunds: parsedDays.reduce((a, d) => a + d.refunds, 0),
    },
  };
}
