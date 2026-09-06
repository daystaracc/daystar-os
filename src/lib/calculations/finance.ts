/** Finance calculations (management view, not accounting). */

export interface DailySales { date: string; orders: number; gross_revenue: number; refunds?: number; platform_fees?: number; sessions?: number | null }

export function sumRevenue(rows: DailySales[]): { gross: number; net: number; orders: number; refunds: number; fees: number } {
  return rows.reduce((a, r) => ({
    gross: a.gross + Number(r.gross_revenue),
    net: a.net + Number(r.gross_revenue) - Number(r.refunds ?? 0) - Number(r.platform_fees ?? 0),
    orders: a.orders + Number(r.orders),
    refunds: a.refunds + Number(r.refunds ?? 0),
    fees: a.fees + Number(r.platform_fees ?? 0),
  }), { gross: 0, net: 0, orders: 0, refunds: 0, fees: 0 });
}

/** Average order value; null when there are no orders. */
export function aov(revenue: number, orders: number): number | null {
  return orders > 0 ? revenue / orders : null;
}

/** Website conversion rate in percent; null when sessions unknown. */
export function conversionRate(orders: number, sessions: number | null | undefined): number | null {
  return sessions && sessions > 0 ? (orders / sessions) * 100 : null;
}

export function grossMarginPct(revenue: number, cogs: number): number | null {
  return revenue > 0 ? ((revenue - cogs) / revenue) * 100 : null;
}

export interface ContributionInput {
  revenue: number; cogs: number; payment_fees: number; shipping: number; packaging: number; advertising: number; returns: number;
}
export interface Contribution {
  grossProfit: number; grossMarginPct: number | null; contributionProfit: number; contributionMarginPct: number | null;
  lines: { key: keyof ContributionInput | 'contribution'; value: number }[];
}

/** Revenue − COGS − Payment fees − Shipping − Packaging − Ads − Returns = Contribution Margin (the Playbook formula). */
export function contributionMargin(f: ContributionInput): Contribution {
  const grossProfit = f.revenue - f.cogs;
  const contributionProfit = grossProfit - f.payment_fees - f.shipping - f.packaging - f.advertising - f.returns;
  return {
    grossProfit,
    grossMarginPct: grossMarginPct(f.revenue, f.cogs),
    contributionProfit,
    contributionMarginPct: f.revenue > 0 ? (contributionProfit / f.revenue) * 100 : null,
    lines: [
      { key: 'revenue', value: f.revenue }, { key: 'cogs', value: -f.cogs }, { key: 'payment_fees', value: -f.payment_fees },
      { key: 'shipping', value: -f.shipping }, { key: 'packaging', value: -f.packaging }, { key: 'advertising', value: -f.advertising },
      { key: 'returns', value: -f.returns }, { key: 'contribution', value: contributionProfit },
    ],
  };
}

/** Product-level unit economics. */
export function unitMargin(price: number, cost: number): { profit: number; marginPct: number | null } {
  return { profit: price - cost, marginPct: price > 0 ? ((price - cost) / price) * 100 : null };
}

/** Paid ads metrics. Returns null where the denominator is zero. */
export function adMetrics(a: { spend: number; revenue: number; impressions: number; clicks: number; purchases: number }, totalRevenue?: number) {
  const safe = (n: number, d: number) => (d > 0 ? n / d : null);
  return {
    roas: safe(a.revenue, a.spend),
    mer: totalRevenue !== undefined ? safe(totalRevenue, a.spend) : null,
    cac: safe(a.spend, a.purchases),
    cpm: a.impressions > 0 ? (a.spend / a.impressions) * 1000 : null,
    ctr: a.impressions > 0 ? (a.clicks / a.impressions) * 100 : null,
    cpc: safe(a.spend, a.clicks),
    cvr: a.clicks > 0 ? (a.purchases / a.clicks) * 100 : null,
    aov: safe(a.revenue, a.purchases),
  };
}
