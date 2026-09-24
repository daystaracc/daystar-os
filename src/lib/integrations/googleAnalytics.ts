import 'server-only';
import { createSign } from 'node:crypto';

/**
 * Read-only client for the GA4 Data API (https://analyticsdata.googleapis.com), used
 * by the Marketing page's "Website traffic" card (added 2026-09-22, Lucas's request
 * for a morning traffic glance). Auth is a Google service-account JWT, signed and
 * exchanged for an access token by hand with `node:crypto` + `fetch` — no
 * `googleapis`/`google-auth-library` dependency, matching this codebase's existing
 * `showmoreClient.ts` idiom of a thin hand-rolled I/O layer rather than an SDK.
 *
 * Setup (one-time, in Google Cloud Console + GA4):
 *  1. Create a service account, enable the "Google Analytics Data API" on its project.
 *  2. In GA4 Admin → Property Access Management, add that service account's email as
 *     a Viewer on the daystar.tw GA4 property.
 *  3. Set three Vercel env vars: `GOOGLE_ANALYTICS_CLIENT_EMAIL` (the service
 *     account's email), `GOOGLE_ANALYTICS_PRIVATE_KEY` (its PEM private key, literal
 *     `\n` for newlines — Vercel's env editor does this automatically for a
 *     multi-line value), and `GA4_PROPERTY_ID` (the numeric GA4 property id, no
 *     "properties/" prefix — Admin → Property details).
 *
 * Any of the three missing is treated as "not configured yet", not an error — see
 * `getWebsiteTrafficReport`'s `notConfigured` flag.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function envReady(): boolean {
  return Boolean(process.env.GOOGLE_ANALYTICS_CLIENT_EMAIL && process.env.GOOGLE_ANALYTICS_PRIVATE_KEY && process.env.GA4_PROPERTY_ID);
}

/**
 * Access tokens are cache-worthy across requests within the same warm serverless
 * instance (~1hr lifetime; refreshed 5min early here). Module-scope state is fine —
 * a cold start just re-signs a fresh JWT, same as the first call ever would.
 */
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;

  const email = process.env.GOOGLE_ANALYTICS_CLIENT_EMAIL!;
  const privateKey = process.env.GOOGLE_ANALYTICS_PRIVATE_KEY!.replace(/\\n/g, '\n');
  const now = Math.floor(Date.now() / 1000);

  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64url(JSON.stringify({ iss: email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }));
  const unsigned = `${header}.${claim}`;
  const signature = base64url(createSign('RSA-SHA256').update(unsigned).sign(privateKey));
  const jwt = `${unsigned}.${signature}`;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Google token exchange → ${res.status}: ${await res.text().catch(() => '')}`);
  const body = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: body.access_token, expiresAt: Date.now() + (body.expires_in - 300) * 1000 };
  return body.access_token;
}

interface GA4Report {
  rows?: { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] }[];
}

async function runReport(body: Record<string, unknown>): Promise<GA4Report> {
  const propertyId = process.env.GA4_PROPERTY_ID!;
  const token = await getAccessToken();
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`GA4 runReport → ${res.status}: ${await res.text().catch(() => '')}`);
  return res.json() as Promise<GA4Report>;
}

// ---------------------------------------------------------------------------

export interface WebsiteTrafficTotals {
  sessions: number;
  users: number;
  pageviews: number;
  avgSessionDurationSeconds: number;
  /** 0–1, not 0–100 — matches GA4's own `engagementRate` scale; UI formats as a percent. */
  engagementRate: number;
}

export interface WebsiteTrafficPage { path: string; views: number }
export interface WebsiteTrafficSource { channel: string; sessions: number }

export interface WebsiteTrafficReport {
  /** The date this report is for, e.g. yesterday's YYYY-MM-DD — always a full day, never "today", since GA4 processing lags a few hours behind real time. */
  date: string;
  totals: WebsiteTrafficTotals;
  /** The day before `date`, for the delta the KPI cards show. Null only if that comparison call itself failed — the headline totals are still shown. */
  previousTotals: WebsiteTrafficTotals | null;
  topPages: WebsiteTrafficPage[];
  sources: WebsiteTrafficSource[];
  error: boolean;
  /** True when the GA4 env vars aren't set — the UI shows "not connected yet" rather than "couldn't load", since the two need different next steps. */
  notConfigured: boolean;
}

const EMPTY_TOTALS: WebsiteTrafficTotals = { sessions: 0, users: 0, pageviews: 0, avgSessionDurationSeconds: 0, engagementRate: 0 };
const num = (v: string | undefined) => Number(v ?? 0);

function toTotals(report: GA4Report, rangeIndex: number): WebsiteTrafficTotals | null {
  // With two dateRanges and no explicit dimension, GA4 adds an implicit "dateRange"
  // dimension (values "date_range_0" / "date_range_1", in the order the ranges were
  // given) — this pulls out the row for the range we asked for.
  const row = report.rows?.find(r => r.dimensionValues?.[0]?.value === `date_range_${rangeIndex}`);
  if (!row) return null;
  const [sessions, users, pageviews, avgSessionDurationSeconds, engagementRate] = row.metricValues ?? [];
  return {
    sessions: num(sessions?.value), users: num(users?.value), pageviews: num(pageviews?.value),
    avgSessionDurationSeconds: num(avgSessionDurationSeconds?.value), engagementRate: num(engagementRate?.value),
  };
}

/**
 * Yesterday's site-wide traffic, vs the day before, plus yesterday's top 5 pages and
 * traffic-source breakdown. Three `runReport` calls in parallel, one shared access
 * token. Any failure — missing env vars, a bad key, GA4 down — degrades to
 * `error: true` with empty data, same "missing is not zero" discipline as the rest of
 * this app's data layer; it never throws into the page.
 */
export async function getWebsiteTrafficReport(): Promise<WebsiteTrafficReport> {
  if (!envReady()) {
    return { date: '', totals: EMPTY_TOTALS, previousTotals: null, topPages: [], sources: [], error: false, notConfigured: true };
  }

  const yesterday = 'yesterday';
  const dayBefore = '2daysAgo';

  try {
    const [totalsReport, pagesReport, sourcesReport] = await Promise.all([
      runReport({
        dateRanges: [{ startDate: yesterday, endDate: yesterday }, { startDate: dayBefore, endDate: dayBefore }],
        metrics: [{ name: 'sessions' }, { name: 'activeUsers' }, { name: 'screenPageViews' }, { name: 'averageSessionDuration' }, { name: 'engagementRate' }],
      }),
      runReport({
        dateRanges: [{ startDate: yesterday, endDate: yesterday }],
        dimensions: [{ name: 'pagePath' }],
        metrics: [{ name: 'screenPageViews' }],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: '5', // GA4 Data API's `limit` is an int64, which Google's JSON mapping sends as a string.
      }),
      runReport({
        dateRanges: [{ startDate: yesterday, endDate: yesterday }],
        dimensions: [{ name: 'sessionDefaultChannelGroup' }],
        metrics: [{ name: 'sessions' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: '6',
      }),
    ]);

    const totals = toTotals(totalsReport, 0) ?? EMPTY_TOTALS;
    const previousTotals = toTotals(totalsReport, 1);
    const topPages: WebsiteTrafficPage[] = (pagesReport.rows ?? []).map(r => ({
      path: r.dimensionValues?.[0]?.value ?? '/', views: num(r.metricValues?.[0]?.value),
    }));
    const sources: WebsiteTrafficSource[] = (sourcesReport.rows ?? []).map(r => ({
      channel: r.dimensionValues?.[0]?.value ?? 'Unassigned', sessions: num(r.metricValues?.[0]?.value),
    }));

    // GA4's relative date keywords resolve against its own processing clock — report
    // "yesterday" from the app server's own calendar (Vercel runs UTC) minus one day,
    // close enough for a label and avoids a second API round-trip just to ask GA4 what
    // date it meant.
    const date = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

    return { date, totals, previousTotals, topPages, sources, error: false, notConfigured: false };
  } catch {
    return { date: '', totals: EMPTY_TOTALS, previousTotals: null, topPages: [], sources: [], error: true, notConfigured: false };
  }
}
