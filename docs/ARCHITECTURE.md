# DAYSTAR OS — Architecture

**Product:** DAYSTAR OS · Business Operating System
**Purpose:** the place founders and team members open every day to understand, manage and operate DAYSTAR — and the operating infrastructure for growing to NT$100M+/year without the company depending on the founders' memory.

The product connects one chain, and every screen sits on that chain:

```
VISION → GOALS → KPIs → PROJECTS → TASKS → PEOPLE → OPERATIONS → RESULTS → REVIEWS → DECISIONS
```

Every screen must answer at least one of: *Where are we now? Where are we going? Are we on track? What is wrong? What matters most right now? Who owns it? What happens next?* If a feature answers none of these, it does not ship.

Source of truth for the strategy: **《DAYSTAR — 100M PLAYBOOK》** (14 chapters, built from the three strategy documents: Taiwan market sizing, 100M growth blueprint, international expansion). This document translates it into software; it does not invent a different framework.

---

## 0. Current state — read this first (updated 2026-10-05)

Sections 1–10 are the product spec and remain the target. This section is where the
build actually is. It is written for someone picking this up cold.

**Live:** https://daystar-os.vercel.app · repo `daystaracc/daystar-os` (private) ·
Vercel project `daystar-os`, scope `daystar3`.
Accounts: `kaistarkai77@gmail.com` (KAi, founder) · `lucasmccollister@gmail.com`
(Lucas, founder) · `dtyangtony@gmail.com` (Alexander, member) — password `daystar2026`.

### Built and verified

| Area | State |
|---|---|
| Auth, middleware route protection, app shell, role-based nav | code-reviewed clean (2026-09-16) — `middleware.ts` matches the standard Supabase SSR pattern, no issues found |
| i18n EN ↔ 繁中, key parity enforced by test, `localizedField()` for `*_zh` columns | done |
| Command Center `/overview` | typechecks clean (2026-09-13), code-reviewed clean (2026-09-16) — live-verified informally (it's the page everyone lands on and has been open all session), but never through the same click-test discipline as the newer screens |
| My Work `/my-work` (member home) | typechecks clean (2026-09-13), code-reviewed clean (2026-09-16) |
| Tasks `/tasks` — list · kanban (drag-drop) · calendar, full CRUD, recurrence, filters, detail panel | typechecks clean (2026-09-13), code-reviewed clean (2026-09-16) — one real bug found and fixed (§ below); everything else checked out |
| Revenue `/revenue` — KPI cards, period switcher (today/7d/30d/month/quarter/year), table of `sales_daily` entries, add/edit/delete drawer | **live-verified 2026-09-15** — real order history imported (6,772 orders), numbers match the pre-verified parse |
| Revenue order-import wizard `/revenue/import` — Showmore order CSV → preview (diffed new/changed/unchanged) → confirm | **live-verified 2026-09-15** — see above; hit and fixed a real body-size-limit bug along the way (§ below) |
| Projects `/projects` — list (health/status/progress/owner/deadline), detail page (progress, stats, notes, linked tasks, members), create/edit drawer, member add/remove | **live-verified 2026-10-01** — list and detail render correctly against real data (health scores, progress bars, linked tasks) |
| Goals `/goals` — goals → objectives → key results (OKR hierarchy), grouped list by level, detail page with inline key-result progress updates, create/edit/delete at all three levels | **live-verified 2026-10-01** — grouped list and objective/key-result hierarchy render correctly against real data |
| Products `/products` — catalogue list (tier/status/stock/margin), detail page with variants, per-variant stock counting, create/edit/delete | **live-verified 2026-09-14** — real catalogue imported (102 products, 321 variants); code-reviewed 2026-09-15 to confirm no stale-seed assumptions |
| Inventory `/inventory` — read-only dashboard: valuation, stock-status breakdown, reorder-needed list linking into Products | **live-verified 2026-09-14** (see Products above) — reads the same real `inventory` rows, no caps |
| Content `/content` — list/calendar/kanban over a 4-stage status (idea/planned/shot/posted, collapsed from 8 by migration 0012) + **pillars** as the main categorization axis (added 2026-10-02, replacing the old stage-as-category overload), optional product/campaign link, dark/gold `.content-theme` skin | **live-verified 2026-10-02** — migration 0012 run, `db:types` regenerated for real, pillar create/assign/filter and the 4-stage status pipeline all click-tested against the live database (not just typechecked). See the 2026-10-02 entry below for the full trail and the one cleanup item left (a throwaway test pillar) |
| Company health `/company/health` — 11 fixed systems scorecard (score, owner, bottleneck, next action, score history), edit-only | **live-verified 2026-10-01** — all 11 systems render correctly with real owners (Lucas/KAi/Alexander), status, next actions, last-reviewed dates. This was the last screen in the whole app still marked "not yet click-tested" — the sweep is now complete |
| SOPs `/sops` — document library across 11 fixed categories, list + detail page, hand-versioned | **live-verified 2026-10-01** — list renders correctly against real data (6 SOPs across categories/statuses: 生效中/待審閱/草稿) |
| Reviews `/reviews` — weekly/monthly WBR/MBR: create by period, wins/problems/decisions/priorities, manual metrics log grouped by section, mark complete/reopen, list + detail page | **live-verified 2026-10-01** — real draft weekly review (週覆盤 2026-08-31 – 2026-09-06, 草稿) renders correctly |
| Marketing `/marketing` — Campaigns / Ad spend / Creators in one tabbed screen (`?tab=`); campaign daily metrics, ad spend log with real ROAS/CAC/CPM/CTR/CVR/**MER** (added 2026-09-16), creator roster with a manual content/sales log | **live-verified 2026-10-01** — renders correctly against real data |
| CRM `/crm` — Flows (12 fixed automations) / Monthly metrics / Customers in one tabbed screen; founder-only | **live-verified 2026-09-15** — 5,404 real customers imported; Customers tab rebuilt with pagination + search (was hard-capped at top 200, see below) |
| Finance `/finance` — Monthly management P&L / Expenses in one tabbed screen; founder-only, contribution-margin math | **live-verified 2026-10-01** — renders correctly against real data |
| Team `/team` — directory + live workload (open/overdue task counts) for every active member; edit-only, founder-only writes, open to all for read | **live-verified 2026-10-01** — renders correctly against real data |
| Settings `/settings` — organization info + data/import hub | **new 2026-09-15** — this page didn't exist; the sidebar link 404'd for every founder until now. See below |
| Customer import — `/revenue/import` now also populates `customers` from the same file, phone numbers hashed and never stored | **live-verified 2026-09-15** — see Revenue above; hit and fixed a real `ON CONFLICT` bug in migration `0008` (§ below, fixed by `0009`) |
| Global search `⌘K` — searches nav + tasks/projects/goals/products/content/SOPs | **live-verified 2026-10-01** — opens correctly, returns real cross-module results (tasks, products, content) for a live query, fast, no debounce issues |
| Notifications `/notifications` — read + mark-read UI, unread badge on the bell icon | **live-verified 2026-10-01** — page renders correctly, showed the expected empty state before the fan-out below existed |
| Audit Log `/audit-log` — read-only, paginated (50/page) feed over `activity_logs`, filterable by entity type (fixed 12-value set — tasks/projects/inventory movements/revenue entries/targets/monthly finance/key results/health scores/the 4 cron-written types), founder+manager via `can.viewAuditLog` (mirrors `activity_logs_select` RLS exactly). The last remaining Phase 6 item | **live-verified 2026-10-05** — deployed (commit `5984bc5`, the 2026-10-02 work finally pushed) and confirmed rendering real rows on the live site |
| Notifications fan-out — `GET /api/cron/notifications-fanout`, a Vercel Cron job (daily, `vercel.json`) that writes rows into the `notifications` table, reusing `evaluateRules()` (the exact same logic behind Overview's "What needs attention") against a narrower, admin-client-gathered snapshot. Covers revenue pace, hero-stock, overdue tasks, content/ad-spend stalls, stale CS — not yet project health, key results, AOV/CVR, reviews, or the systems score (see the route's own doc comment for why and how to extend it) | **live-verified 2026-10-05, end-to-end, after fixing a real production bug** — deployed since `5984bc5` but silently never executed (see the 2026-10-05 entry below: `middleware.ts` redirected every cron/internal/webhook call to `/login` before the route's own secret-header check ever ran). Fixed in `06b43db`; after redeploy, a manual Run produced a real `200` (2.45s execution) and populated 3 real notifications on `/notifications` — overdue tasks, a content stall, and a 31-day paid-ads gap |
| Operations `/operations` — **new 2026-09-21**: Daily log (`operations_daily`, upsert-by-day) / CS cases (`customer_service_cases`, full CRUD with status workflow) in one tabbed screen (`?tab=daily` / `?tab=cs`). See § below — this page didn't exist; the sidebar link 404'd since the app's first session |
| Showmore order sync — **daily automated scraping sync** (superseded the 2026-09-21 webhook/API plan below — Lucas declined the paid Showmore API plan, so this is a browser-scraping fallback hitting the admin panel directly), once-daily at 5PM Taipei with a 5-day rolling catch-up window. `SHOWMORE_SYNC_SECRET` confirmed set in Vercel | **independently reconciled 2026-10-05** — Lucas pasted the raw Showmore order export (158 rows, Oct 1–5) and every app-side daily total matched it exactly (151 non-abandoned orders, NT$154,463, per-day breakdown all ✓ — see the delivered reconciliation spreadsheet). The apparent "off by NT$1,049" discrepancy that prompted the check turned out to be the normal once-a-day sync lag, not a bug. **Cadence decision made 2026-10-05: keep once-daily** (Lucas's call, given the data is already proven accurate day-to-day) — the increase-frequency and revisit-the-paid-API-plan options are explicitly not being pursued right now |

> **✅ Decision made 2026-09-16: email only, not phone.** Asked directly ("email
> only" / "add phone + email" / "keep as-is"), Lucas picked **email only**.
> Built same day — `lib/import/customerAggregation.ts` now also reads `收件人
> Email` (the one other exception to `CUSTOMER_COLUMNS` never being read,
> alongside the already-existing phone-hash exception), stores it **as real,
> readable text** (not hashed, unlike phone — that's the whole point of the
> decision), and takes the most-recent-order's value the same way `name`
> already did. `importShowmoreCustomers` (`app/(app)/revenue/import/actions.ts`)
> now writes it to `customers.email` on every import. Phone stays exactly as it
> was — hash-only, never the real number; that part of the original design was
> explicitly NOT reversed. 4 new tests added for the email path (latest-order-
> wins, missing-column doesn't warn since email isn't the identity key,
> no-email-anywhere stays null) — same verification method as everything else
> in this sandbox (parses clean via `tsx`, and unlike most other changes this
> one was also actually *run* end-to-end with synthetic data via a throwaway
> script, not just parsed, since a real `node:crypto`-shaped identity/hash flow
> was worth exercising rather than only reading). Not yet click-tested against
> Lucas's live database (needs a real import re-run once he's deployed).

**Every screen in the sidebar now resolves — nothing 404s any more** (2026-09-15:
this was actually false until today — `/settings` had linked from the sidebar
with no page behind it since the nav was built; see below), **and the two
dead top-bar controls (search, the bell) both go somewhere real.**
`npm run typecheck` is clean, the product import and the full order/customer
import have both run successfully against Lucas's real data (§ below). What's
left: click-testing the screens still marked "typechecks clean, not yet
click-tested" in the table above — nothing else is currently blocked on Lucas.

**2026-10-05: the "3 days to make this usable" push — closed a 13-day deploy gap,
found and fixed a real production bug (cron jobs were silently never running),
and independently reconciled revenue against raw order data.** Lucas opened the
session frustrated: "I want this shit to work in three days... have not been able
to use this OS." Root cause wasn't any one broken screen — `git log` on his
machine showed nothing had been pushed to `main` since Sept 24 (`8f7ed0d`),
so the live site had been running an 11-day-old build the whole time Content's
pillar migration, the Audit Log screen, both cron routes, and the React #418
hydration fix all existed only on his laptop.

Sequence: (1) diagnosed an apparent revenue-numbers discrepancy (Lucas: "off by
1049") — traced to the Showmore sync's normal once-daily cadence lag, not a bug;
Lucas then pasted the raw 158-row Showmore export (Oct 1–5) and it matched the
app's numbers exactly (151 orders, NT$154,463, every day ✓ — delivered as an
xlsx reconciliation with live formulas, not hardcoded). The NT$1,049 figure
itself was never located in the data; closest candidate was a NT$1,149 excluded
order, flagged as a likely typo. (2) `npm run typecheck` surfaced a real blocker,
`creators.cost` typed `NOT NULL DEFAULT 0` where every other cost column in this
app treats `null` as "unknown" — migration `0013_creators_cost_nullable.sql`
loosens the constraint without touching any existing row (which of the 6
zero-cost creators are genuinely free vs. never-entered is still Lucas's call,
not made here). (3) All 36 outstanding files committed and pushed (`5984bc5`),
landing Content pillars, Audit Log, both cron routes, the hydration fix, and
`vercel.json` on production for the first time. (4) Lucas clicked "Run" on
`notifications-fanout` and saw nothing happen — turned out `src/middleware.ts`'s
route matcher never excluded `api/cron`, `api/internal`, or `api/webhooks`
(only `api/public`), so every one of those server-to-server calls (authenticated
by their own secret header, never a session cookie) got a 307 redirect to
`/login` before the route's own auth check ran. Vercel logs a 307 as a normal
response, so this failed completely silently — not just tonight's manual click,
every scheduled run since the cron was deployed. Fixed in `06b43db` (added the
three folders to the matcher's exclusion list; none of those routes rely on the
session check, they all already gate on their own secret). After redeploy,
confirmed via Vercel's request logs: the same call that 307'd now returns a real
`200` in 2.45s, and `/notifications` shows 3 real rows (overdue tasks, a content
stall, a 31-day paid-ads gap). **This was the first time notifications-fanout has
ever successfully executed.**

One side-finding from the notifications content itself: the content-stall
notification reads "0 pieces in 3/7 days (target 0/week)" — `/content` confirms
no weekly content target is actually set, so that's a missing-target data gap,
not a real 0-content problem. Worth setting a real `targets.weekly_content` row.

Two items still need Lucas's own hands (both hit the same destructive-action
tool guard that blocks this agent from clicking them): deleting the "Claude test
pillar (delete me)" row on `/content` (open 管理內容支柱 → 刪除支柱), and manually
running `auto-reorder-tasks` once to confirm the same middleware fix covers it
too (it should — same matcher, same deploy — but hasn't been independently
click-tested the way notifications-fanout was).

**2026-10-01: Showmore sync fixed and diagnosed, a real global hydration bug found and
fixed, and the full click-testing sweep finished.**

*Showmore sync.* The `SHOWMORE_SYNC_SECRET` Lucas added to Vercel is correctly wired —
confirmed by getting a `400` ("no days provided") instead of a `401` from
`/api/internal/showmore-daily-sync`. Ran the full browser-scraping-and-POST flow by hand
(Showmore admin panel → scrape 5 days of orders → POST to the sync endpoint) and got a
clean `200`, 91 orders, NT$99,853 for Sept 27–Oct 1, confirmed live on `/revenue`. The
real finding: the *daily scheduled* task has been reporting `SUCCEEDED` every day for a
week while silently doing nothing, because the unattended run can't get live
Chrome/device access without a same-day human approval (`no_signed_approval` — found by
manually firing the trigger and reading the actual rejection reason, not from any log
Lucas would normally see). This is a structural gate, not a bug in the sync code itself.
Options for Lucas: approve the run manually each day, keep doing periodic manual syncs
(what was done today), or go back to the paid Showmore API plan to remove the
human-approval dependency. A 12-day historical gap (Sept 15–26) was left unfilled after
two attempts hit Showmore's known date-filter bug (see "Traps that cost time in earlier
sessions" below) — low priority, cosmetic, not blocking anything.

*React #418 hydration bug (new, previously undetected).* Found live via the browser
console on production — fires on every single page load, project-wide, including every
page click-tested below. Root cause: `TopBar.tsx` (`'use client'`) called `new
Date().toLocaleDateString(...)` directly in its render body to show today's date. That
runs twice — once during SSR on the server's clock/timezone, once during hydration on
the browser's — and the two never agree for a Taipei user (UTC+8) against a Vercel
function that's presumably UTC. Fixed by computing `today` once, server-side, in
`(app)/layout.tsx` (a pure server component — safe to call `Date` there, it runs once
per request) and passing it into `TopBar` as a plain string prop instead. **This fix is
written to Lucas's local `daystar-os` folder only — it has not been committed to git,
pushed, or deployed.** `git add`/`commit`/`push` from that folder is the next step;
until then production still throws #418 on every load (confirmed still reproducing
during this session's click-testing, console logs captured below). A second console
error — `TypeError: Cannot read properties of null (reading 'parentNode') at $RS
(/tasks:8:2011)` — was chased down further on a second pass: it reproduces reliably on
`/tasks` (not a one-off), but `/tasks` itself still renders and works correctly despite
it (confirmed again via a full page read). `$RS` at that location is Next.js's own
minified inline Suspense-streaming helper, not app code, and it fires right alongside
#418 every time — the likely explanation is that it's a secondary symptom of the same
hydration mismatch (React's streaming insertion script loses track of a DOM node once
hydration has already failed once on the page), not a second, independent bug. No source
maps were available to confirm this for certain from a production bundle. Worth a 10-
second console check after the #418 fix is deployed — if it disappears along with #418,
that confirms it; if it's still there, it's a real second issue worth a proper look.

*Click-testing sweep finished.* Every screen previously marked "not yet click-tested" in
the table above was opened against the live site with real data and confirmed correct:
Projects, Goals, Content, SOPs, Reviews, Marketing, Finance, Team, Global search (⌘K —
opens correctly, live cross-module results for a real query), and Notifications (correct
expected-empty state, confirming the gap is "no fan-out/cron yet," not a rendering bug).
Company health `/company/health` is the one screen still not click-tested.

**2026-10-01, continued: Company Health click-tested (the sweep is now 100% complete),
and a first real automation engine built.** Company Health renders correctly — all 11
systems, real owners, real next actions. That closes out every screen that was ever
marked "not yet click-tested" in the table above.

With the click-testing done, built `GET /api/cron/notifications-fanout` — the first
piece of actual automation in this codebase, and the direct answer to the Notifications
row that's sat at "UI built, nothing populates it" since 2026-09-14. Deliberately built
as a **plain Vercel Cron job**, not a Claude-scheduled task: the Showmore sync's
scheduled task drives a real browser and turned out to silently need same-day human
approval it often doesn't get (see above) — a Vercel Cron hitting a Next.js route has no
such dependency, it just runs on Vercel's own infrastructure or fails loudly in Vercel's
own cron logs. Worth remembering as the template for any future "fully automated" piece
of this app: prefer a cron route over a Claude-scheduled browser task whenever the work
doesn't actually require a real browser.

The route reuses `evaluateRules()` from `lib/calculations/rules.ts` completely
unchanged — the same function that already drives Overview's "What needs attention" —
so the business rules themselves have exactly one definition. What's new is only the
input-gathering, done via the service-role admin client (no user session exists for a
cron caller) rather than `getCommandCenter`'s session-scoped one. Scope is deliberately
narrower than the full Overview snapshot for v1: revenue pace, hero-product stock,
overdue tasks, a content-output stall, an ad-spend stall, and stale CS cases — the rules
that were actually firing on the real Overview page today. Project health, key results,
AOV/CVR-vs-target, reviews-due and the systems score are left for a later pass (the
route's own comment explains exactly what to add and why it wasn't done now, rather than
risk a second, drifting half-copy of the full ~20-query snapshot). Severity is filtered
to critical/high only for v1 — medium/low stay Overview-only, to keep the bell icon for
things worth an actual interruption. Dedup is per (recipient, rule, entity): an
unresolved issue won't re-notify every day while the last notification about it is still
unread, but will again once it's marked read if the issue is still there.

Also added: `vercel.json` (didn't exist before — this is the first cron config in the
repo) scheduling the route daily at 23:00 UTC / 07:00 Taipei, and `CRON_SECRET` in
`.env.example` with setup steps (Vercel's cron trigger sends it automatically as a
Bearer token once the env var is set — same shape as `SHOWMORE_SYNC_SECRET` but Lucas
generates this one himself, Claude didn't).

**Not yet typechecked, not yet deployed — same bar as everything else written in this
session with no shell access on Lucas's machine.** Before trusting it: `npm run
typecheck`, set `CRON_SECRET` in Vercel, `git push` (it'll go out with the pending
hydration fix), and one manual `curl` against the route with the secret to confirm it
writes real rows before waiting for the first scheduled run.

*Two old open decisions, re-surfaced from `TOMORROW_2HR_GUIDE.md` (2026-09-18) — still
unresolved, still genuinely Lucas's call, not something to build blind.* Re-read that
file today while looking for Lucas's own stated priorities rather than guessing. Two
items in it were flagged then as "needs you to decide" and still are:

1. **CRM monthly metrics (repeat rate, retention revenue) are hand-typed into
   `crm_metrics_monthly` every month** (`lib/data/crm.ts` confirms: that table is a
   generic manually-entered table, no computation). The `customers` table only stores
   running totals per customer (`orders_count`, `total_spent`, `first_order_at`,
   `last_order_at` — confirmed in `0001_schema.sql`), not individual orders, so there's
   no per-month data to compute from today. Three real options, in increasing order of
   completeness vs. effort: **(a)** leave it manual — zero risk, status quo; **(b)**
   compute monthly new/returning/repeat-revenue automatically whenever the full CSV
   import wizard runs (it already reads order-level rows in `customerAggregation.ts`
   on the way in, just doesn't bucket them by month afterward) — covers bulk imports
   only, not the lightweight daily Showmore sync; **(c)** add a real
   `customer_orders`-style ledger table and have both import paths write to it — the
   only path to true month-by-month automation, but it means reversing a deliberate
   privacy decision already made for the daily sync (`showmore-daily-sync`'s own doc
   comment: "No line items, no customer PII — just `{date, orders, gross, refunds}`"),
   not just adding a column. That trade-off is Lucas's to weigh, not something to
   change unilaterally.
2. **Reviews' metrics are manually logged each week/month.** Auto-pulling them needs
   Lucas to say which numbers belong in a weekly vs. a monthly review — a judgment call
   about how he actually runs reviews, not something inferrable from the schema.

Neither is blocking anything today — flagging them here so the next time Lucas has five
minutes to decide, the options are already laid out instead of needing to be rediscovered.

*Stale duplicate folder noticed, not touched.* `C:\Users\user\Desktop\Daystar-OS` (no
underscore) is a second connected folder with its own copy of this project, untouched
since 2026-09-05 — it predates and is unrelated to all work done in
`DAYSTAR_OS_foundation\daystar-os` since. Worth Lucas's own cleanup at some point so it
doesn't get confused for the live repo; nothing was changed or deleted there.

**2026-10-02: first automation-engine slice (auto-reorder tasks), then Content taken
from "just restyle" to a real schema change (pillars + a collapsed 4-stage status) at
Lucas's explicit request.**

*Auto-reorder tasks (`GET /api/cron/auto-reorder-tasks`, daily 22:00 UTC / 06:00
Taipei, `vercel.json`).* The second piece of actual automation after the notifications
fan-out above: mirrors Inventory's reorder-needed detection and creates a `tasks` row
per product/variant that needs restocking, deduped via an `auto-reorder` label plus a
`[auto-reorder-key: productId:variantId]` marker in the description so re-runs don't
spam duplicates. **Typechecks clean** — confirmed via Lucas's own `npm run typecheck`
paste, same run that also covered the Content restyle files below. Not yet
click-tested against a real reorder-needed product.

*Content: visual restyle, then — on Lucas's own explicit second ask — a real data-model
change.* Lucas pasted a standalone artifact prototype ("Daystar Content Calendar": dark/
gold theme, a `pillars` taxonomy, a 4-stage idea/planned/shot/posted pipeline with
glyphs ○◐●✓) and said he wanted it built in. First answer, asked directly: **"just
restyle — no data model change."** Built exactly that — a `.content-theme` dark/gold
CSS skin (`content/layout.tsx`, `globals.css`) over the List/Calendar/Kanban/drawer,
the real 8-stage pipeline and all fields untouched. Committed, byte-verified, and
**typechecks clean** (same Lucas-run `npm run typecheck` as above).

Lucas then explicitly reversed course mid click-test: **"Yes — make it exactly like the
artifact"** — collapse the real 8-stage `content.status` down to idea/planned/shot/
posted, and add a `pillars` table as the main categorization axis ahead of
content_type/platform, replacing (not adding to) how Content categorizes things today.
This is `supabase/migrations/0012_content_pillars.sql` plus app-code changes across
`lib/content/constants.ts`, `lib/data/content.ts`, `content/actions.ts` (new
`createPillar`/`updatePillar`/`deletePillar`, manager-or-above create/rename,
founder-only delete — mirrors `campaigns`), the two other `'published'`→`'posted'`
literal sites (`commandCenter.ts`, `notifications-fanout/route.ts`), both i18n
dictionaries, and reworked `ContentCalendar`/`ContentBoard` (pillar color for identity,
a status glyph instead of the old 8-stage color ramp) plus a new `PillarManager.tsx`
("Manage pillars" panel) and pillar filter chip row.

**Update, same day: migration run, typed, tested, and click-verified — with two real
findings along the way, one fixed, one still open.** Lucas ran migration 0012 by hand
in the Supabase SQL editor (succeeded, no rows returned) and `npm run db:types`
(regenerated `src/types/database.ts` for real — 91KB, replacing the hand-patched
version this entry originally shipped with). `npm run test:calc` came back **121/121
green**. `npm run lint` came back clean (2 pre-existing warnings, unrelated to this
change — `postcss.config.mjs` and `WebsiteTraffic.tsx`).

`npm run typecheck` surfaced 3 errors — **none in the pillars/status-collapse files
themselves**; all three were pre-existing bugs the hand-patched `database.ts` had been
quietly masking until the real schema types replaced it:

1. **`reviews.actions.ts` — `createReview`'s insert was missing `answers`**, a NOT NULL
   JSON column with no DB default. Fixed same session: insert now sends `answers: {}`,
   matching the empty-state `updateReview` already uses a few lines down
   (`notes === null ? {} : { notes }`). Committed, byte-verified. **Fixed.**
2. **`marketing/actions.ts` — `creators.cost` is `NOT NULL DEFAULT 0` in the live
   database**, not nullable as `0001_schema.sql` documents (`cost numeric, -- NULL =
   unknown; never treat as 0`). Confirmed directly against the live DB (`information_schema.columns`):
   `is_nullable = NO`, `column_default = 0`. This is schema drift — the column
   predates all migrations currently tracked in `supabase/migrations/`, so nothing
   in this repo explains when or how it became NOT NULL. **The data already shows the
   failure mode the comment was written to prevent**: of 6 creators total, 0 have a
   null cost and 5 sit at cost = 0 — there's no way from the data alone to tell which
   of those 5 are real $0 collabs versus creators whose cost was simply never entered.
   **Not fixed — left for Lucas.** Two decisions, not one: (a) whether to migrate the
   column back to nullable (straightforward — drop the NOT NULL and the default); (b)
   what to do with the 5 existing cost=0 rows, which depends on Lucas actually knowing
   which of his 6 creators had a real $0 cost versus an unentered one. No migration
   file written for this yet — deliberately, since (b) needs his input first.

Then **live click-tested** against the running dev server (not just typechecked): opened
`/content`, created a real pillar through the new "Manage pillars" panel, confirmed it
appeared in the filter chips and the manager list, opened a content item's edit drawer,
assigned the pillar, saved, reopened the drawer fresh and confirmed it stuck. The
4-stage status pipeline (構想/規劃中/已拍攝/已發布) renders and is selectable on every
row. No console or module-resolution errors. One deliberate test artifact is still
sitting in the live database: a pillar named **"Claude test pillar (delete me)"**,
created to verify the create/assign flow end-to-end. Deleting it needs a click Lucas has
to make himself — `PillarManager.tsx`'s delete button goes through a native
`window.confirm()` (`remove()`, line 76), which this session's browser automation is
deliberately barred from clicking through (see the new Traps entry below). Open
"管理內容支柱" → click the trash icon next to it → confirm. That delete will also
auto-clear it from the one content item it was test-assigned to, via the `pillar_id`
column's `ON DELETE SET NULL` — nothing else to undo by hand.

No real pillars are seeded — Lucas hasn't said what his actual content pillars should
be named, so the "Manage pillars" panel is otherwise empty and he creates his own
whenever he's ready.

**2026-10-02, later: Audit Log built — the last open item in Phase 6 Intelligence,
done autonomously while Lucas was away.** With the day's blocking items (migration,
db:types, the live click-test) all finished and nothing left that needed his input,
this was picked specifically because it needed no business decision: `activity_logs`
(migration 0001) already had a manager-or-above select policy and, as of 0011
(2026-09-21), a matching insert policy — the table has been filling up since this
session's very first cron jobs went in, with no screen to read it back. `can.viewAuditLog`
(`permissions.ts`) mirrors `activity_logs_select` RLS exactly, same deterministic shape
as `viewFinance`/`managePillars` — no "spec vs. RLS" judgment call needed, unlike
`viewReviews`/`viewMarketing`/`viewCRM`.

Built: `lib/data/auditLog.ts` (`getActivityLog`, 50-row pages, optional entity-type
filter — mirrors `getCustomersPage`'s exact pagination shape from `lib/data/crm.ts`),
`app/(app)/audit-log/page.tsx` (plain server-rendered list + `<Link>`-based pagination/
filtering, no client component needed — nothing on this screen is interactive beyond
navigation), a new `auditLog` nav entry (`lib/nav.ts`, System group, founder+manager),
and the full `auditLog.*` i18n block in both dictionaries (title/subtitle/empty/
loadFailed/pagination copy + a label for each of the 12 fixed `entity_type` values the
trigger function and the four direct-insert cron/sync routes can produce — enumerated
by hand, the same "fixed known set" shape as Company Health's 11 systems, since
PostgREST has no clean `DISTINCT` to query instead).

One real constraint worth remembering: `activity_logs.summary` is built **in Postgres**,
inside `log_activity()` (the trigger function, `0001_schema.sql`) — it's always English
text regardless of the viewer's locale, because the database has no notion of the
request's language. Rendered as-is rather than re-translated, same restraint already
applied to Showmore's raw CSV warnings elsewhere in this app.

**Honest status: written and i18n-parity-verified for real (actually executed the same
deep-key-comparison check used throughout this session — 1131 keys each, zero diff), the
new `permissions.test.ts` case for `can.viewAuditLog` actually run too (patched import
extension in a scratch copy only, since this sandbox's `node --experimental-strip-types`
needs one and `tsx` isn't installable here — 21/21 passing, not just read by eye). Every
`.ts` file syntax-checked; `page.tsx` could only be read carefully (JSX isn't supported
by Node's type-stripping). None of this is real `tsc`, real `test:calc`, or a click-test
against a running app — those still need Lucas's own machine, same as the pillars work
above.** Added to tomorrow's guide.

**2026-09-16: the whole build was never in git until today, and the first
`git push` since didn't reach GitHub.** `git status` on Lucas's machine showed
every screen from this entire session (everything from Revenue through
Settings/Notifications) as uncommitted or untracked — the live site at
daystar-os.vercel.app had been running a much older version this whole time,
unrelated to any of the individual bugs described elsewhere on this page.
Lucas committed everything in one shot (commit `c96460c`, 142 files, 15,588
insertions) — `git config` already has the correct commit-author email
(`325529981+daystaracc@users.noreply.github.com`), so that known Vercel
Hobby-plan gotcha is not the issue here. He ran `git push` but had to step
away before it finished; checking `.git/refs/remotes/origin/main` afterward
shows it's still pointing at the old commit (`52a316e`), not `c96460c` — **the
push did not reach GitHub, so the live site is still not updated.** Most
likely explanation (unconfirmed — this session has no shell access to see the
terminal output): the repo's remote is `https://github.com/...` (HTTPS, per
`.git/config`), and a `git push` over HTTPS on Windows commonly pops up a Git
Credential Manager sign-in window the first time — if that appeared right as
Lucas had to leave, the push would just be sitting there waiting for it,
not failed outright. **Next step for Lucas:** re-run `git push` from the
`daystar-os` folder; if a sign-in window appears, complete it. If it fails
with an actual error instead, paste the error.

**2026-09-13: the first real `npm run typecheck` against this code.** Every screen
above was written by hand in a sandbox with no npm registry access, so until today
nothing had run against a real TypeScript compiler — "written, not verified" meant
exactly that. Lucas ran `npm run typecheck` on his own machine and it found exactly
**2 errors, both in Revenue** (`lib/data/revenue.ts` and
`app/(app)/revenue/import/actions.ts` — the same `channelOf()`-style helper in each
had its type assertion written with optional fields (`{ key?: string }`) while the
function's declared return type required them (`{ key: string }`); fixed by removing
the `?`). **Projects and Goals had zero errors on the very first check** — real
evidence the hand-written-against-schema approach works, not just a hopeful claim.
Also confirmed working for real: `npm run dev` starts clean, the middleware redirect
to `/login` fires correctly, and the login page compiles. Still outstanding: actually
clicking through each screen's CRUD (create/edit/delete a revenue entry, a project, a
goal) — typechecking proves the code is internally consistent, not that the RLS
policies, the postgrest join shapes, or the UI logic behave correctly against a live
database. Do that click-through before trusting any of these screens with real data.

Verified end-to-end against the deployed build: login as both roles, member
redirected to `/my-work` with no Finance/Revenue in nav **and refused by RLS at the
database** (0 rows on another user's task); kanban drop persists; inline status
change persists; completing a recurring task spawns exactly one next occurrence;
EN/繁 switch flips live; no horizontal overflow at 390px or 360px in either language.

`npm run test:calc` = **61 tests** (51 + 3 for `quarterBounds`/`yearBounds`/
`resolvePeriod`/`previousPeriod`, + 5 for `revenueImportPlan.ts`'s new/changed/
unchanged diffing — both added for the Revenue screen, + 1 for `averageProgress()`,
added for the Goals screen, + 1 for `previousMonthBounds()`, added for the Reviews
screen). The Projects screen added no new pure-logic files; Goals added exactly one
small pure function (rolling several progress percentages into one, e.g. an
objective's key results into the objective's own progress bar) and tested it
properly rather than leaving it unverified like the rest of the screen. Products,
Inventory, Content, Company Health and SOPs added none. Reviews added
`previousMonthBounds(isoDate)` — the full calendar month before the one `isoDate`
falls in, distinct from `previousMonthToDate`'s same-elapsed-days slice, since a
monthly review is written about a month that's already fully over — and tested it
with the January-rollover and leap-year edge cases. Marketing added none — it's the
first real caller of `adMetrics()`, already written and tested when the calculation
layer was built. CRM added none either — nothing on that screen is computed from
anything yet, since `customers` is still empty (see the CRM verification note
below). Finance added none either — it's the first real caller of
`contributionMargin()`, already written and tested when the calculation layer was
built (see the Finance verification note below). Team added none either — its
workload counts are a plain JS reduce over already-fetched task rows (same shape
as Marketing/CRM's totals), not a new calculation-layer function. **Marketing's MER
was built 2026-09-16** — see the dedicated note below the "Traps" list. Re-ran the full
suite after each addition. Keep it green; it is the only automated gate.

**A note on how the Revenue screen was verified.** It was built in a sandbox with no
npm registry access at all (blocked at the network level, not package-specific) and no
way to run `next`/`tsc`/`supabase-js` locally. What's actually proven: the new pure
functions in `pacing.ts` (`quarterBounds`, `yearBounds`, `resolvePeriod`,
`previousPeriod`) ran for real via `tsx --test` and pass, and the new `revenue` i18n
keys pass the exact EN/繁中 key-parity test. The data layer (`lib/data/revenue.ts`),
server actions (`app/(app)/revenue/actions.ts`) and components
(`components/revenue/*`, `app/(app)/revenue/page.tsx`) import `@supabase/ssr`, `zod`,
`react` or `next` — none installable here — so they were written by hand against the
exact schema/RLS/patterns in this file and in `lib/data/commandCenter.ts` /
`app/(app)/tasks/*`, but **never typechecked or run**. Run `npm run typecheck` and open
`/revenue` locally before trusting it. Most likely failure mode if something's wrong:
a column name or a `postgrest-js` join-shape mismatch (see the `channelOf()` /
`nameOf()` gotcha below) — not a logic bug.

**A note on how the Projects screen was verified (written 2026-09-12).** Same sandbox,
same constraint: no `next`/`tsc`/`@supabase/ssr` locally, so nothing here has run
against real Next.js or Postgres. What happened instead: the screen was written
against the actual applied schema (`projects`, `project_members`, `v_project_progress`
from `0001_schema.sql`) and the actual applied RLS (`0002_rls.sql`'s generic
per-table loop — see the note below), following the exact structural patterns already
proven out in `lib/data/tasks.ts` and `components/tasks/*`. It was then read back
end-to-end by hand, twice, file by file, since there is no compiler to catch mistakes
here — that review caught and fixed two real bugs before they reached the repo: a
dropped `canManage` variable in `getProjectsPage`, and a status-label lookup that would
have shown `undefined` for most task statuses on the project detail page (tasks and
projects use different status vocabularies). `npm run test:calc` was re-run after
writing every file and stayed at 59/59 — but that suite doesn't cover this screen at
all, since none of its logic is pure/testable in the way `pacing.ts` or
`revenueImportPlan.ts` is. **Run `npm run typecheck` and click through `/projects` and
a project's detail page locally before trusting this screen** — that is the first real
test it will get.

One deliberate scope decision: the spec's info architecture (§03) describes member
read access to Projects as "own", but the RLS actually deployed (migration 0002's
generic loop, applied to `projects` along with several other tables) grants **select to
every active org member**, not just the project's own people — and grants insert/update
to manager-or-above, delete to founder-only. This screen was built to match the RLS
that is actually live in the database, not the narrower spec column, with a comment
to that effect in `app/(app)/projects/page.tsx`. Narrowing read access to match the
spec would need a new migration (a scoped `projects_select` policy, e.g. via
`project_members`), not a UI change — flagging it here rather than deciding it
unilaterally.

**A note on how the Goals screen was verified (written 2026-09-12).** Same sandbox,
same constraint, same process as Projects: built against the actual schema
(`goals` → `objectives` → `key_results`, all from `0001_schema.sql`) and the actual
RLS (`0002_rls.sql`'s generic loop covers all three tables identically to
`projects` — select = every org member, insert/update = manager-or-above, delete =
founder-only), then read back by hand end-to-end since there is still no compiler
here. One genuine pure-logic addition this time: `averageProgress()` in
`lib/calculations/goals.ts` rolls a list of key-result progress percentages up into
one number (an objective's progress from its key results, a goal's progress from all
its key results across every objective) — it returns `null`, not `0`, for an empty
list, so "no key results yet" never misreads as "0% done" the way a missing
denominator would. It's genuinely tested (`npm run test:calc`, now 60). Everything
else — the data layer, the three server-action files, all six components, both
pages — is written but **never run against Next.js or Postgres**. The one place
most likely to have a real bug: the query-param scheme for the three stacked
drawers on the detail page (`?edit=1` for the goal, `?newObjective=1` /
`?editObjective=<id>` for an objective, `?newKr=<objectiveId>` / `?editKr=<id>` for
a key result) — click through all five of those manually before trusting the
screen. `npm run typecheck` first, as with Revenue and Projects.

One UI simplification worth knowing about: the inline "update current value"
control on each key result (the routine weekly action — typing this period's
number and clicking Update) calls a narrower action, `updateKeyResultValue()`, that
only ever writes `current_value` — it never touches title/unit/target/etc, so it
can't accidentally corrupt a key result while someone is just logging progress. The
full edit drawer (`KeyResultDrawer`, via the pencil icon) is the only way to change
anything else about a key result.

**A note on how the Products screen was verified (written 2026-09-13).** Same
process as Projects and Goals, with two differences. First, it was built *after*
Lucas's real `npm run typecheck` run (above) and has **not** been through that check
yet — treat it as the least-verified of the four new screens until it has. Second,
this is the first screen whose RLS is not a uniform manager-or-above/founder split:
`products` itself follows the generic loop (read = any member, write = manager+,
delete = founder-only, same as Projects/Goals), but `product_variants_write` covers
create/update/**and delete** at manager-or-above with no founder-only carve-out, and
`inventory_movements_insert` is open to **any active member** — the migration's own
comment says why: "fulfillment staff adjust stock." So on this screen, unlike every
other one built so far, the inline stock-count control is visible to every team
member, not gated behind `canManage`. Get the role check on this screen right before
trusting it — a permission mismatch here is the one place this session's usual
manager-or-above assumption would be wrong.

Stock status (critical/low/ok/overstock/dead) and margin are computed from
`lib/calculations/inventory.ts` — `stockStatus()`, `productMarginPct()` — both
already tested (`npm run test:calc`, still 60; this screen added no new pure logic,
only new callers of functions already proven). Velocity (units/day, which
`stockStatus()` needs) comes from summing `product_sales_daily` over the trailing 30
days — currently **seeded/fake data for the 8 demo products** (see below), so stock
status on today's catalogue will look wrong until the real product import (next
section) replaces it. A product or variant with zero sales in that window shows "no
sales data" rather than guessing a status — same "missing denominator is not zero"
rule as everywhere else in this codebase.

The stock-count control writes an `inventory_movements` row carrying the
*difference* between what's typed and the current `on_hand` (never a direct write to
`inventory` — that column only moves through the database trigger), so entering the
same count twice is a no-op, exactly like a product import re-run. A count equal to
the current on-hand writes nothing at all, on purpose.

**A note on how the Inventory screen was verified (written 2026-09-13).** This one is
simpler than the others: it's a pure read-only dashboard with no server actions at
all (stock is still only ever counted from the Products detail page). It rolls up
every `inventory` row an org has into three things, all via functions already tested
by `npm run test:calc`: total valuation (`inventoryValuation()`), a count of products
per stock status (`stockStatus()`), and a reorder list for anything critical or low
(`reorderSuggestion()`). No new pure logic was added, so the suite stayed at 60/60.
The one thing worth getting right on review, and the one place a bug would hide: a
row with zero units sold in the trailing 30 days must be distinguished from a row
with *no sales data at all* in that window — the former is real "dead stock" (a
correct, computable status), the latter is "we don't know yet" and must **not** be
counted as dead. `getInventoryOverview()` does this with a `Map` keyed by
`product_id:variant_id` built only from rows that actually appear in
`product_sales_daily`, checked with `.has()` rather than `.get() ?? 0` — a row absent
from the map goes to `unknownCount`, never into `statusCounts.dead`. Given the same
seeded/fake `product_sales_daily` data noted above, expect the valuation and reorder
numbers to look wrong until the real product import runs — same caveat as Products.
Like Products, this screen was written after the last real typecheck run and has
**not** been through `npm run typecheck` yet — do that before trusting it, same as
every other screen in this table marked "written, not yet typechecked."

**A note on how the Content screen was verified (written 2026-09-13).** Same
process again: built against the actual schema (`content` from `0001_schema.sql`)
and the actual RLS (`0002_rls.sql`) — which, worth flagging, is genuinely different
from every other screen's RLS this session: `content_insert` is open to any active
member (like the inventory stock count, not like Products), `content_update` allows
managers/founders to edit anything **or** the piece's own owner/creator to edit it
(a real per-row "member: own" carve-out, not just a role check — mirrored as
`canEditContent()` in `lib/permissions.ts`, the same shape as the existing
`canEditTask()`), and `content_delete` is manager-or-above only with no owner
exception. Deliberate scope cut, flagged rather than silently shipped: the spec
describes a full calendar view and drag-drop kanban pipeline (§07); this is a flat
list sorted by pipeline stage (idea…published) with a status `<select>` per row to
advance a piece, and a create/edit drawer — no calendar grid, no drag-and-drop. That
was a judgment call made unattended (see the 2026-09-13 "keep building" session) to
avoid shipping an untested drag-and-drop interaction with no way to click-test it
here; the calendar/kanban views are a reasonable follow-up once someone has clicked
through this simpler version. Also deliberately out of scope: logging
`content_metrics` (views/likes/etc.) — there is no UI for it yet, so every piece's
view count reads 0, honestly, rather than a fabricated number. The weekly
publishing-pace card reuses `computePacing()` and `weekBounds()` from
`lib/calculations/pacing.ts` (already tested for Revenue) — no new pure logic, so
`npm run test:calc` stayed at 60. One thing worth double-checking on review: the
edit drawer has no separate detail-fetch (unlike Products), so the list's own select
statement carries every editable field (`talent`, `concept`, `hook`, `url`,
`notes`) purely so re-saving one field can't silently blank the others — get that
wrong and editing a title would wipe a hook.

**A note on how Company Health was verified (written 2026-09-13).** This one closes
a real gap rather than adding a new spec item: the Command Center's "Business
health" section and its `HealthGrid` have linked to `/company/health` (and
`/company/health#<key>` anchors per system) since earlier in this session, but the
page never existed — every click 404'd. Built against `business_systems` and
`system_scores` (`0001_schema.sql`) and the actual RLS (`business_systems` is in
the same generic per-table loop as Products/Goals/Projects: select = any member,
update = manager-or-above, delete = founder-only). Deliberate scope decision: this
screen only **edits** the 11 systems, it never creates or deletes one — they're
fixed, seeded rows (`unique (organization_id, key)`), so a create/delete UI would
have no legitimate use and was left out rather than built and hidden. The scoring
logic itself needed no new code at all: `business_systems_after_score` (a database
trigger) derives `status` from `score` and stamps `last_reviewed_at`, and a second
trigger appends every score change to `system_scores` — the app only ever writes
`score` plus the ownership-matrix fields (owner/bottleneck/next action/future
owner/transfer date/goal) and reads the results back. The two pure functions used
(`systemStatus()`, `healthScore()` in `lib/calculations/health.ts`) already existed
and are already tested from when the Command Center's health card was built, so
`npm run test:calc` stayed at 60. Like every other screen written after Lucas's real
typecheck run, this has **not** been through `npm run typecheck` yet.

**A note on how SOPs was verified (written 2026-09-13).** Built against `sops`
(`0001_schema.sql`) and its RLS, which is the same generic per-table loop as
Products/Goals/Projects/Company Health (select = any member, write =
manager-or-above, delete = founder-only) — no per-row nuance this time, unlike
Content. A list page (filterable by the 11 fixed categories) and a real detail page
per SOP (unlike Content, which has no detail page) with the full procedure text and
an edit drawer. One genuine design decision worth flagging: `sops.version` is a
plain integer column with **no database trigger** behind it, unlike Company
Health's score history — so `updateSop()` in `app/(app)/sops/actions.ts` reads the
current `content_md` before saving and only bumps `version` when the procedure text
itself actually changed; relabeling the title, category, status or owner never
counts as a new version. Also worth noting: this is the one drawer this session
where the "≤5 visible fields + Advanced" rule doesn't apply — an SOP only ever has
five fields total (title/category/status/owner/content), and the procedure text is
the point of the document, not secondary detail, so it's always visible as a
full-height textarea rather than hidden behind a toggle. No markdown rendering
library exists in this project (checked `package.json` before writing this), so
`content_md` is shown as plain preformatted text (`whitespace-pre-wrap`, matching
the same convention `TaskPanel.tsx` already uses for descriptions) — headings and
lists in the raw markdown source show as raw `#`/`-` characters today, not
rendered. That's an honest limitation, not a bug: adding a markdown renderer needs
a new npm package, which can't be installed or verified from this sandbox. No new
pure logic was added, so `npm run test:calc` stayed at 60. Like the rest of this
batch, not yet run through `npm run typecheck`.

**A note on how Reviews was verified (written 2026-09-13).** Built against
`reviews` and `review_metrics` (`0001_schema.sql`). This is the one screen this
session where the app-level access gate deliberately does **not** match the more
permissive RLS: `reviews_select` (the generic per-table loop) actually lets any
active member read the table, but `review_metrics_all` requires manager-or-above
for **every** operation including select, and the spec's own permission matrix
(§03) shows Reviews as founder/manager only with no member row at all — the
sidebar nav already gated `/reviews` the same way. Rather than ship a page a
member could open and see a review with no visible metrics, `can.viewReviews` was
added to `lib/permissions.ts` (founder or manager only) and both the list and
detail pages redirect anyone else to `/my-work` — the same kind of deliberate
tightening as Revenue's `viewRevenue` gate. The bigger scope decision: the spec's
"weekly 13-metric review" implies a fixed set of numbers pulled automatically from
every other domain (Growth/Product/Content/CRM/Operations/Finance/Team) with a
previous-period comparison. **Deliberately not built** — which exact metrics
belong in that fixed set is a real, unvalidated product decision, not something to
invent unattended, the same reasoning as the still-deferred customer/CRM
phone-hashing work (item 6 below). What's built instead is the real underlying
workflow: create a weekly or monthly review for a period (the drawer suggests the
most recently *completed* Mon–Sun week or calendar month via the new
`previousMonthBounds()`, editable before creating), write wins/problems/decisions/
priorities (always visible, no Advanced toggle — this is the review's actual
content, not metadata about it, same reasoning as SOPs' procedure text), mark it
complete or reopen it (`completed_at` stamped once and never overwritten, the same
narrow-action pattern as Content's `published_at`), and a manual "add metric"
control grouped by the spec's seven sections so a real number can be logged by
hand today, with a % delta shown against a logged previous value via the
already-tested `pctChange()`/`formatDelta()`. A monthly review also gets a free-text
notes field, since there's no fixed monthly-question schema yet either — it's
stored in the `answers` JSONB column (`{notes: "..."}`) rather than a new column,
since that shape is still genuinely undecided. No new database-facing pure logic
beyond `previousMonthBounds()` (see above). Like the rest of this batch, not yet
run through `npm run typecheck` or click-tested against a live database.

**A note on how Marketing was verified (written 2026-09-13).** Built against five
tables at once (`campaigns`, `campaign_metrics`, `ad_spend_daily`, `creators`,
`creator_content`, all `0001_schema.sql`) rather than one — the spec's §03 shows a
single "08 Marketing" permission row covering campaigns/paid/creators together, so
this is one tabbed screen (`?tab=campaigns|ad-spend|creators`), not three separate
nav items. RLS is mixed in a way worth understanding before trusting this screen:
`campaigns` and `creators` are in the generic per-table loop (select = any active
member, insert/update = manager-or-above, delete = founder-only, same as
Products/Goals/Projects/SOPs), but `ad_spend_daily` requires manager-or-above for
*every* operation including select, and `campaign_metrics`/`creator_content` are
reachable only through their manager+ parent. A member could therefore open this
screen and see campaign or creator names with zero spend or performance numbers —
so, like Revenue and Reviews, the whole page is gated to founder/manager via the
new `can.viewMarketing` (`lib/permissions.ts`), and `app/(app)/marketing/actions.ts`
bakes the same role check straight into its `ctx()` helper (mirroring
`app/(app)/revenue/actions.ts`) rather than relying on RLS alone to refuse a
member's request.

No new pure logic was needed: `adMetrics()` (ROAS/MER/CAC/CPM/CTR/CPC/CVR/AOV) was
already written and tested when the calculation layer was built, and this is its
first real caller — `npm run test:calc` stayed at 61. One number is deliberately
left blank rather than guessed: MER (spend as a share of *total store* revenue) needs
the org's total revenue over the same date window, which lives in `sales_daily`
behind the Revenue screen — cross-referencing the two screens is flagged as a
reasonable follow-up, not wired up unattended here. Every other ad-spend figure
only needs `ad_spend_daily`'s own columns and is computed for real, over a rolling
90-day window so the totals stay meaningful as the log grows rather than "all
time." Campaign ROAS is a simpler inline safe-divide (attributed revenue ÷ spend
from `campaign_metrics`, null when spend is 0) since campaign-level data has no
impressions/clicks to feed the fuller `adMetrics()` shape.

Two relational fields were deliberately left unbuilt rather than half-built:
linking a campaign to a `project_id` (the column exists and is nullable; Projects
already has its own screen and this isn't the primary "is spend working"
question) and linking `creator_content.content_id` to a specific Content OS entry
(the existing free-text `products_sent`/`url` columns cover today's need without a
content picker). Both are reasonable follow-ups, not gaps hidden from view. Like
the rest of this batch, not yet run through `npm run typecheck` or click-tested
against a live database — the query most worth checking first is the campaign/
creator rollups in `lib/data/marketing.ts` (`getCampaignsPage`/`getCreatorsPage`),
which aggregate a second table's rows in JS after an `.in(ids)` fetch rather than
a single joined query.

**A note on how CRM was verified (written 2026-09-13).** Built against `customers`,
`crm_flows` and `crm_metrics_monthly` (all `0001_schema.sql`). This is the
strictest permission gate of anything built this session: `customers_all` RLS is
founder-only for *every* operation including select — stricter even than
`ad_spend_daily` — so `can.viewCRM` (`lib/permissions.ts`) gates the whole `/crm`
screen to founder-only, one notch past Reviews/Marketing's founder-or-manager, even
though `crm_flows`/`crm_metrics_monthly` are in the more permissive generic loop.
`app/(app)/crm/actions.ts` bakes the same founder-only check into its `ctx()`
helper rather than relying on RLS alone.

One real difference from Company Health's fixed-11-systems pattern, flagged rather
than silently copied: this sandbox has no `supabase/seed.sql` to confirm whether
the 12 `crm_flows` rows (welcome, abandoned_cart, post_purchase, review_request,
cross_sell, winback, vip, launch, restock, birthday, lapsed, high_value) are
already seeded per organization the way the 11 business systems apparently are.
Rather than assume seeding happened and build an edit-only scorecard that could
show nothing to edit, this screen supports **creating** a flow for any key this
org hasn't used yet (the create drawer's dropdown only offers unused keys, and the unique
`(organization_id, key)` constraint backstops it), alongside editing and
founder-only delete — so the screen is useful whether or not the 12 rows already
exist. `key` can only be set on create; editing shows it as a fixed label, since it
identifies the row. None of `crm_flows`'s numeric columns (messages, sends,
conversions, revenue) are computed by a trigger the way Company Health's score/
status are — there's no automation platform wired in — so every number here is
typed in by hand, same as everywhere else this pass.

The bigger scope decision covered the whole screen: `customers` was genuinely
empty. Populating it from order history needed the phone-number hashing decision
that was deliberately deferred earlier this session — and that decision is about
*writing* to `customers`, not about reading whatever's there, so
`getCustomersPage` (`lib/data/crm.ts`) was already a real, finished read path: a
"top customers by spend" list, capped at 200 rows. Monthly CRM metrics (repeat
rate, retention revenue, LTV, etc.) remain manual for now: `crm_metrics_monthly`
has no way to compute itself from `customers`, so it's still a hand-typed monthly
log (upsert on `unique(organization_id, month)`, same "saving replaces this
period" idiom as Revenue and Marketing's ad spend). Like the rest of this batch,
not yet click-tested against a live database.

**2026-09-14: `customers` is now populated by the order import, not left empty.**
Lucas approved the design directly — *"just do it, standard salted hash is
fine"* — after the earlier deferral above. The approach, in
`lib/import/customerAggregation.ts` (new, 10 tests, pure/no I/O):

- The Showmore order export's `訂購人` (name) and `訂購人電話` (phone) columns are
  now read — the only two `CUSTOMER_COLUMNS` fields this app has ever read (see
  the file-level comment in `lib/import/showmore.ts`). Every other PII column
  (address, bank account, gender, birthday, recipient info) is still never read,
  unchanged.
- The phone number itself is **never stored**. It's normalized
  (`normalizePhone`: strips non-digits, folds an `886`/`+886` country code to a
  domestic leading `0`, rejects anything under 8 digits) and immediately hashed
  with HMAC-SHA256 (`hashPhone`, Node's built-in `node:crypto`, no new
  dependency), keyed by a server-only env var `CUSTOMER_PHONE_HASH_SALT`. HMAC
  rather than a bare hash specifically so the value resists a rainbow-table
  attack even if the database were exposed. An order with no usable phone is
  excluded from customer aggregation entirely — never bucketed under a fake key,
  same "missing denominator is not zero" rule used everywhere else.
- New migration `supabase/migrations/0008_customer_phone_hash.sql` adds
  `customers.phone_hash` and a unique `(organization_id, phone_hash)` index
  (`where phone_hash is not null`) — **not yet applied to the live database,
  Lucas needs to run it.**
- `importShowmoreCustomers` (`app/(app)/revenue/import/actions.ts`) is a new
  action, wired into the *existing* `/revenue/import` wizard as a second,
  parallel write (`Promise.all` alongside `importShowmoreOrders`) — not a
  separate upload screen. It re-parses the **raw file text** server-side with
  the real salt; the client-side preview in `RevenueImportWizard.tsx` computes
  its counts with a throwaway, hardcoded, non-secret `PREVIEW_SALT` so the real
  `CUSTOMER_PHONE_HASH_SALT` never reaches the browser bundle. Each customer row
  is a full REPLACE of that phone hash's lifetime totals (upsert on
  `organization_id,phone_hash`) — same idiom as `importShowmoreOrders` — which
  means **the uploaded file must always be the complete order history, not just
  new orders**, or existing customers' totals will be understated. The wizard's
  copy says this, and it's re-stated in the action's own doc comment.
- If `CUSTOMER_PHONE_HASH_SALT` isn't set, the action fails gracefully with a
  message naming the missing env var — nothing partially imports. **Lucas needs
  to set this in both his local `.env` and Vercel project settings** before this
  works live: any long random secret string, generated once and never rotated
  casually (rotating it would orphan every previously-imported customer under a
  now-unmatchable hash).
- `npm run test:calc` grew from 61 to **71** (10 new tests in
  `lib/import/__tests__/customerAggregation.test.ts`, covering phone
  normalization edge cases, hash determinism/salt-sensitivity, order grouping
  and status-exclusion, and aggregate totals/date-tracking). i18n key parity
  stayed 3/3.

**2026-09-15: fixed a real bug in the customers upsert, hit on the first live
import.** With migration `0008` applied and `CUSTOMER_PHONE_HASH_SALT` set,
Lucas ran the first real order import (~7k orders, full history): the revenue
side (`sales_daily`) succeeded, but the customers side failed with *"there is
no unique or exclusion constraint matching the ON CONFLICT specification"*.
Cause: `0008`'s unique index was partial (`where phone_hash is not null`),
and Supabase's `.upsert(rows, { onConflict: 'organization_id,phone_hash' })`
compiles to a plain `ON CONFLICT (...) DO UPDATE` with no `WHERE` clause —
Postgres won't match that against a partial index. New migration
`0009_customer_phone_hash_plain_unique.sql` replaces it with an ordinary
(non-partial) unique index on the same columns; a plain unique index already
treats every `NULL` as distinct, so nothing is lost — **Lucas needs to run
`0009` before retrying the customer import** (re-uploading the same file and
confirming again is safe either way, since the revenue side just upserts
unchanged rows).

**2026-09-15: a second real bug on the same import — the request was too big.**
Before the `ON CONFLICT` bug above was even reached, the first import attempt
failed outright with *"Body exceeded 2mb limit"* — `next.config.ts` capped
server-action payloads at 2mb, and the real order-history CSV (~7k orders,
1.5 years, multi-line rows) is bigger than that. Raised to 15mb, with room to
grow as order history accumulates. Both fixes (this and the `ON CONFLICT` one
above) are now live-verified: the full import completed successfully after
them — 6,772 orders into `sales_daily`, 5,404 customers into `customers`,
matching the pre-approved preview exactly.

**2026-09-15: CRM Customers rebuilt — full list, search, pagination.** With
real customers actually in the database, `getCustomersPage`'s old
`.limit(200)` "top customers" view (written back when the table was empty)
turned out to hide 96% of them — Lucas noticed his customer count looked low
and asked for "all of them." `lib/data/crm.ts`'s `getCustomersPage` now
paginates the whole table (50/page, `{ count: 'exact' }` for the total) and
takes an optional search term matched against name/email/phone via `.ilike`
`.or(...)` (input sanitized against PostgREST's filter syntax first — see
`sanitizeSearchTerm`'s comment). `app/(app)/crm/page.tsx`'s `CustomersTab` now
reads `q`/`page` from the URL, renders a plain GET search form and Prev/Next
controls, and shows email/phone/tags inline per row (already-existing
`CustomerRow` fields the UI never displayed before). No new database column —
this was a read-path/UI-only fix.

**2026-09-15: found and fixed a real dead sidebar link — `/settings`.**
`lib/nav.ts` has linked the sidebar's "Settings" item to `/settings` (founder-
only) since the nav was first built, but only `/settings/import` ever had a
`page.tsx` behind it — the parent route had no page at all, so clicking
"Settings" 404'd for every founder, the entire session, and nobody had clicked
it yet to surface it. Found by auditing every `lib/nav.ts` `href` against an
actual `page.tsx` on disk, the same class of bug global search and
notifications were (2026-09-14, below) — worth remembering as a standing check
whenever a new nav item is added. New `app/(app)/settings/page.tsx`: a minimal,
deliberately read-only hub — organization name/slug/created-at, and a card
linking to the existing product/order import. `organizations.currency`/
`.timezone` exist in the schema but nothing in the app reads them yet (revenue
formatting is hardcoded to TWD — `lib/calculations/format.ts`), so they're not
exposed as editable fields that would look functional but silently do nothing;
`organizations_update` RLS (founder-only) is confirmed but not yet used by any
UI. New `can.viewSettings` in `lib/permissions.ts`, same founder-only shape as
`viewFinance`/`viewCRM`.

**2026-09-16: audited Tasks, My Work, Command Center, and auth/middleware — the
earliest-built screens, from before this session's close-review discipline
existed. One real bug found and fixed; one latent (currently harmless) gap
documented; one cosmetic non-issue noted.**

1. **Fixed:** `completeTask` (`app/(app)/tasks/actions.ts`) spawns a recurring
   task's next occurrence via a second `insert`, but discarded that insert's
   result entirely — if it failed (any constraint violation), the task would
   still show as completed with no trace anywhere that its recurrence had
   silently stopped. Now logs the error server-side (`console.error`) when
   this happens. Didn't widen `ActionResult`'s error union to surface it in
   the UI itself — that's a bigger, app-wide change than this specific fix
   warrants; worth doing later if this ever actually fires in practice.
2. **Documented, not fixed (currently harmless):** `canEditTask`
   (`lib/permissions.ts`) claims to mirror `tasks_update` RLS but is missing
   one branch — RLS also allows anyone in the `task_assignees` junction table
   (`is_task_assignee(id)`) to edit a task, a multi-assignee capability that
   exists in the schema (migration 0001) but has no UI anywhere in this app
   (`lib/data/tasks.ts` doesn't even select from `task_assignees`). Since
   nothing ever writes to that table, it's always empty, so `canEditTask`'s
   answer matches RLS for every task that exists today — but it would stop
   matching the moment multi-assignee writes were ever added without also
   updating this function. Comment corrected to say so precisely.
3. **Not a bug, just a note:** the recurring-task rule string (e.g.
   `weekly:MON`) looks like it should drive which weekday a task repeats on,
   and `TaskDrawer.tsx`'s dropdown only ever offers `weekly:MON` regardless of
   the task's actual due date — but `recurrence.ts`'s `nextOccurrence` never
   actually reads the day suffix for `weekly:*`, it just adds 7 days to the
   existing due date (so the real weekday is always whatever the due date
   already was, correctly). The label is inert — cosmetically it can say
   "MON" for a task due on a Tuesday, but nothing computes anything wrong
   from that mismatch. Not worth fixing on its own.

Auth/middleware (`src/middleware.ts`) was also read closely — standard
Supabase SSR session-refresh-and-redirect pattern, nothing found.

**2026-09-16: code-level review of the two remaining unreviewed screens, both
clean.** Global search (`lib/search/actions.ts`, `CommandPalette.tsx`) and
Notifications (`lib/data/notifications.ts`, the `/notifications` page, its
`NotificationsList` component, and `notifications/actions.ts`) were the only
two screens left from the 2026-09-14 build that hadn't had the same
permission-vs-RLS/edge-case pass the other eleven got on 2026-09-15. Checked:
`notifications_select`/`_update` RLS (`0002_rls.sql`) is recipient-only and
matches every query and update in the app exactly (all scoped with an explicit
redundant `.eq('recipient_id', ...)`, same defense-in-depth convention used
everywhere else); there is no insert policy and the app never attempts one,
consistent with "populate path is a separate fan-out/cron concern, not built
this pass"; the unread badge in `TopBar.tsx` and the list's own unread count
in `NotificationsList.tsx` both derive from the same `read_at is null` shape,
so they can't drift out of sync with each other. Global search's RLS-inherits-
automatically design (no app-level role gate, relies entirely on each queried
table's own `*_select` policy) checked out against all six searched tables
(tasks/projects/goals/products/content/sops). One minor, very-low-severity
nitpick found and worth a one-line fix whenever someone's next in this file:
`globalSearchEntities`'s `like` escaping (`lib/search/actions.ts`) only escapes
literal `%`/`_` in the query, not a literal backslash — `crm.ts`'s
`sanitizeSearchTerm` (built 2026-09-15) escapes all three. In practice this
only affects search relevance if someone's task/project/goal/product/content/SOP
title is searched using a query containing a literal backslash character,
which doesn't come up in normal use — not a security issue (RLS still scopes
every result), not fixed proactively since it's cosmetic and unrelated to
tonight's actual ask. No new bugs. This closes out the full screen-by-screen
code review — every screen in the app has now had this pass at least once.

**2026-09-14: global search (⌘K) and `/notifications` are both built** — the two
items flagged "being worked on now" in `TEST_RUN_GUIDE.md`. Both were previously
dead: the top bar's search button and `⌘K` fired a `daystar:open-search` DOM event
with nothing listening, and the bell icon linked to a 404.

- **Search.** `lib/nav.ts` is a new file: the sidebar's own list of every
  navigable screen (`NAV_GROUPS`), pulled out of `Sidebar.tsx` so it's a single
  shared source — `Sidebar.tsx` now imports it instead of defining it locally,
  and `components/layout/CommandPalette.tsx` (new) searches the exact same list.
  `CommandPalette` renders a ⌘K-style modal: it listens for the same
  `daystar:open-search` event the top bar's button and keyboard shortcut already
  dispatched (so neither trigger needed to change), shows every nav item the
  signed-in role can see when the query is empty, filters that list client-side
  as you type, and — for a query of 2+ characters — also calls a new server
  action, `lib/search/actions.ts`'s `globalSearchEntities`, which searches
  `tasks.title`, `projects.name`, `goals.title`, `products.name`,
  `content.title` and `sops.title` (`ilike`, 5 results per type, debounced
  200ms) and returns direct links to each (`/tasks?task=<id>`,
  `/projects/<id>`, `/goals/<id>`, `/products/<id>`, `/content?edit=<id>`,
  `/sops/<id>`). Deliberately not every table: Revenue/Finance/Marketing/CRM
  rows don't have one obvious title field to match against, and building a
  bespoke result shape for each was out of scope for this pass. No new
  app-level permission check — every query goes through the signed-in user's
  own Supabase client, so the existing `*_select` RLS (generic-loop,
  any-active-member) is what actually decides what comes back; if a table's RLS
  ever tightens, search inherits that automatically. Rendered once, in
  `app/(app)/layout.tsx`, alongside `TopBar`/`Sidebar` — it needs the same
  role/nav data those already fetch, so no extra query.
- **Notifications.** `lib/data/notifications.ts` (new) reads the existing
  `notifications` table (`0001_schema.sql`) — `notifications_select` RLS is
  recipient-only (`recipient_id = auth.uid()`), so this was always going to be
  a real, finished read path the moment the page existed, same shape as CRM's
  `getCustomersPage` before the customer import existed. `app/(app)/notifications/
  actions.ts` adds `markNotificationRead`/`markAllNotificationsRead`
  (`notifications_update` RLS, also recipient-only). The page itself
  (`app/(app)/notifications/page.tsx` + `components/notifications/
  NotificationsList.tsx`) has Unread/All tabs and an optimistic mark-read (same
  `useOptimistic` pattern as the Command Center's `AttentionList`). The top
  bar's bell now shows a real unread-count badge — `app/(app)/layout.tsx` runs
  one extra `head: true` count query alongside its existing profile/membership
  fetch and passes it into `TopBar`.
  **There is still no way to create a notification from the app** — `notifications`
  has no insert policy for regular users (`0002_rls.sql`), because populating it
  (something writing a row when e.g. a task is assigned or goes overdue) is a
  fan-out/cron concern, deliberately not built this pass. So `/notifications`
  will correctly show empty until that exists — that's expected, not a bug, the
  same "read path ready, write path deferred" shape as Customers before
  2026-09-14 above.
- No new pure calculation logic in either — `npm run test:calc` stayed at 71.
  i18n key parity stayed 3/3, and a full cross-check of every `t('namespace.key')`
  call in the codebase against the English dictionary (703 calls checked) found
  zero missing keys, new `search.*`/`notifications.*` keys included.

**A note on how Finance was verified (written 2026-09-13).** Built against
`financial_monthly` and `expenses` (both `0001_schema.sql`). Unlike every other
screen built this session, this one needed **no new permission**: `can.viewFinance`
(`lib/permissions.ts`) already existed, unused, from an earlier session, and it's
already founder-only — which is exactly what `financial_monthly_all`/`expenses_all`
RLS require (`is_founder(organization_id)` for every operation including select,
same strictness as `customers_all`). So the app gate and the database rule agree
without any deliberate tightening, the first time that's been true this session.
`app/(app)/finance/actions.ts` still bakes the same founder-only check into its
`ctx()` helper rather than relying on RLS alone, matching every other domain's
actions file.

Two tabs, two genuinely different shapes. **Monthly P&L** is one row per month
(upsert on `unique(organization_id, month)`, the same "saving replaces this
period" idiom used everywhere else this session), run through
`contributionMargin()` — already written and tested when the calculation layer
was built, so this is its first real caller, the same relationship Marketing had
with `adMetrics()`. `npm run test:calc` stayed at 61. The drawer shows revenue,
COGS, cash balance and inventory value up front (the four numbers the Command
Center already reads — see `lib/data/commandCenter.ts`'s existing
`financial_monthly` query) and puts the full contribution-margin waterfall
(payment fees, shipping, packaging, advertising, returns, operating expenses)
under Advanced, since those are typically filled in once from a bookkeeping
export rather than eyeballed line by line. **Expenses** is a real CRUD entity,
not an upsert-by-period — `expenses` has no `unique` constraint and RLS allows
update/delete same as insert, and more than one expense obviously happens per
day — shown over a rolling 90-day window (same shape as Marketing's ad-spend
log) with a running total, rather than an unbounded "all time" list. `category`
is a plain free-text field: the database puts no `CHECK` constraint on it, unlike
every enum this app has built against so far (campaign status, ad platform,
CRM flow channel/status), so the form doesn't invent a fixed list either — it's
whatever categories Lucas actually uses, ready to tighten into an enum later if a
real set of categories emerges. Like the rest of this batch, not yet run through
`npm run typecheck` or click-tested against a live database.

**A note on how Team was verified (written 2026-09-13, the last screen this
pass).** Built against `memberships`, `departments` and `profiles` (all
`0001_schema.sql`). This is the **only** screen this session that's open to every
active member for read — `memberships_select`/`departments_select`/
`profiles_select` (migration 0002) all resolve to "any active member of the org,"
not the usual manager-or-above split, and that matches the spec's own permission
matrix (§03: Founder ●, Manager ●, Member "read") exactly. So `/team` needed no
`can.viewX` gate at all — the page never redirects anyone away, the same
"no new permission needed" situation Finance was in, just on the read side this
time instead of the write side. Writing is a different story: `memberships_write`/
`departments_write` are both founder-only for every operation, so only a founder
sees the edit pencil (`canEdit = role === 'founder'` in `page.tsx`), and
`updateMembership` (`app/(app)/team/actions.ts`) re-checks founder-only itself
rather than trusting that UI gate — the same "gate the mutation, not the page"
shape Products/Goals/Projects already use for their manager-or-above writes.

Edit-only, same shape as Company Health's 11 fixed systems: memberships come from
real people signing up (the `handle_new_user` trigger creates a profile per
`auth.users` row), not from typing a new row here, so there's no create/delete UI.
One guard the database doesn't enforce on its own: a founder can't change *their
own* role away from founder through this form — the role field is disabled
client-side on your own row, and `updateMembership` checks it again server-side,
since a disabled `<select>` is a UX nicety, not a security boundary. Workload
("who is loaded?") is a live count of each member's open and overdue tasks,
fetched once for the whole org (`tasks_select` RLS is already org-wide for every
active member) and rolled up per assignee in JS — the same shape as Marketing's
campaign-metrics rollup, not a new calculation-layer function, so
`npm run test:calc` stayed at 61.

One scope decision, flagged rather than silently skipped: department **management**
(create/edit/delete) was not built. This screen reads whatever departments already
exist — for display, and for the edit drawer's dropdown — but there's no
`supabase/seed.sql` in this sandbox to know whether Lucas already has a real
department list worth preserving, and the core "who owns what, who is loaded"
question doesn't need it. A reasonable follow-up once departments themselves need
editing, same category of deferral as CRM's customer import or Marketing's
campaign/content links. Like the rest of this batch, not yet run through
`npm run typecheck` or click-tested against a live database.

### Data state — part real, part seed

The database is **not** all demo data any more. Know which is which:

| Table | State |
|---|---|
| `sales_daily` | **REAL** for channel `website`, 2026-01-01 → 2026-08-31 (243 rows, 3,787 orders, NT$3,712,089, refunds NT$183,125). Imported from Showmore. |
| `sales_daily` (shopee) | **SEEDED/FAKE** — 30 rows, Aug 1–30, 201 orders, NT$187,930. Shopee has no export yet. |
| `sales_daily` | **nothing** for 2026-09-01 onwards, so the Command Center shows NT$0 for September. This is expected, not a bug. |
| `product_sales_daily` | **SEEDED/FAKE** — 206 rows. Real product attribution is blocked (below). |
| `products` / `inventory` | **SEEDED/FAKE** — 8 products. The real catalogue is 102 products / 320 variants. |
| `product_variants` | empty |
| `tasks`, `content`, `business_systems`, `reviews`, `sops` | seed data, fine to keep |
| `customers` | populated by the order import (`/revenue/import`) as of 2026-09-14 — see the CRM verification note above. Not yet run against the live database (migration `0008` and the `CUSTOMER_PHONE_HASH_SALT` env var are both still pending on Lucas's side). |
| `crm_metrics_monthly` | 1 row — repeat-customer *monthly* metrics still hand-typed, not computed |
| `sales_daily.sessions` | **empty before 2026-09-08.** Google Analytics (`G-Z4D3DGFW5J`) was installed on the website that day, so sessions — and therefore CVR — exist only from then on. Historical CVR is genuinely unknowable, not zero. |

Backups of anything deleted are in the session scratchpad as
`sales_daily-backup-*.json`; if they are gone, the seed can be re-run from
`supabase/seed.sql` for those dates.

### Migrations — 0005, 0006 and 0007 are now applied (2026-09-11)

`0001`–`0007` are all applied to the live database — verified with read-only queries:
`products.cost` is nullable, `inventory`/`product_sales_daily`/`inventory_movements`
all have `variant_id`, and `products`/`product_variants` have `external_source`/
`external_id`. The product import is unblocked at the schema level; what's still
missing is the real Showmore product-export CSV file itself (see "What is next" below).

For reference, here's what they changed, in order:

- `0005_products_cost_nullable.sql` — `products.cost` is `not null default 0`, which
  makes "cost unknown" impossible and reads as 100% margin. Makes it nullable.
- `0006_variant_level_stock.sql` — adds `variant_id` to `inventory`,
  `product_sales_daily` and `inventory_movements`, widens both unique constraints to
  `UNIQUE NULLS NOT DISTINCT`, and rewrites `apply_inventory_movement()` to work per
  variant and roll product status up across variants.
- `0007_external_ids.sql` — adds `external_source` / `external_id` to `products` and
  `product_variants` so an import can find the rows it created last time. Without it a
  second product import duplicates all 102 products.

`0001` now contains all three, so a **fresh** database needs only `0001`; the live
project predates them and still needs all three run. All are guarded and re-runnable.

`src/types/database.ts` has been hand-edited to match, or nothing that touches these
columns would compile — re-run `npm run db:types` once they are applied and the note at
the top of that file can go.

Verify with: `products.cost` absent from `required` in the PostgREST OpenAPI
document, and `inventory.variant_id` present.

### Mid-flight: the Revenue import

`src/lib/import/showmore.ts` is a **pure, tested parser** for Showmore's
`訂單管理 → 匯出` order export. It reproduces the real 8-month file exactly:
3,787 orders / NT$3,712,089 / AOV 980.2, every month matching to the dollar.

Things the real files forced, all of which have tests — do not "simplify" these away:

- **`訂單編號` must stay text.** It is 18 digits; as a float, adjacent order ids
  collide. There is a test using two ids that are `===` as numbers.
- **The order date comes from the `YYMMDD` prefix of `訂單編號`**, not `付款時間`,
  which is empty for 貨到付款 (57 of 80 lines in the week sample). `付款時間` is the
  fallback; an order with no derivable date is excluded with a reason, never guessed.
- **`總額` already includes `運費`** and is net of `折扣紀錄`. It is the revenue
  figure. Adding shipping on top overstates by ~5%.
- **`已棄單` / `棄單審核中` are excluded.** `已退貨` is **not** — a return counts in
  orders and gross on its order date *and* its value goes to `refunds`, so
  `net_revenue` (generated) and the return rate are both correct.
- Rows with no `訂單編號` are a trailing product-list block and are skipped.
- `銷售渠道` arrives padded (`" DAYSTAR "`) → trim before mapping to `website`.
- `成本` is 0 for most rows and means *unknown*, not free. Cost comes from `products`.

**Showmore's product CSV is malformed.** Product names contain unescaped `"`
(`"Daystar "0" Football Jersey "`, `"''DS" TRUCKER HAT"`). RFC4180 requires `""`. A
conformant parser recovers 53 of 320 rows; SheetJS gets 296; Excel mangles it
differently again. A **tolerant** parser is required — inside a quoted field, a `"`
not followed by a delimiter, newline or EOF is a literal character. With that, the
file parses to exactly 320 rows / 102 products. This parser still needs writing into
`src/lib/import/` (a working version lives in the session scratchpad as `csv.mjs`).

### Open decisions — blocking the next step

1. **Product matching.** Agreed approach is: import the product master first, then
   match order lines on **商品名稱 + 款式** (product + variant), listing anything
   unmatched rather than inventing products. `商品編號(sku)` is empty on 314 of 320
   rows, so it cannot be the join key; Showmore's `product_id` / `variant_id` are
   stable and should be stored for future imports.
2. **Variant level names need folding** to colour / size / width / length / quantity.
   Raw values are inconsistent (顏色, 尺寸, 款式, Color, COLOR, SIZE, Size, 寬度,
   `Colore`) and four are not attribute names at all (`Mystery Box 2.0`,
   `TURCKER HAT`, `款式尺寸`, `項鍊`). Anything unrecognised stays a free-text label.
3. **A product's cost when its variants disagree.** `products.cost` is set only when
   every known variant cost matches — 22 of 102 products qualify; the other 80 hold
   cost per variant only. If Hero Products or margin need one number per product, the
   rule (cheapest? weighted by stock?) is a decision, not a default.
4. **Seeded Shopee rows for Aug 1–30** (201 orders, NT$187,930) — still fabricated
   alongside real website data. Awaiting a decision to clear them.
4. **`product_sales_daily` seed rows** (206) — still fabricated; Hero Products
   therefore still shows demo data.
5. **Hero products are unchosen.** The seeded five are wrong. Top 10 real products are
   only **33.6%** of revenue and nothing exceeds 7.4%, so "5–10 heroes carry the
   brand" is currently *not true* — a real finding for the hero programme.
   Two caveats in the ranking: `Mystery Box 2.0` is #1 at NT$274K but sold on only
   4 days (a campaign drop, not a hero), and `DIAMOND EARRINGS 8MM E04` appears under
   two names that are probably one product (NT$245K combined, which would make it #1).

### What is next, in order

1. ~~Run migrations `0005`, `0006` and `0007`~~ — done, verified 2026-09-11 (above).
2. ~~Write the tolerant CSV parser~~ — done. `csv.ts` (tolerant reader),
   `showmoreProducts.ts` (product master) and `productImportPlan.ts` (the write plan),
   all pure and tested. Verified against the real 2026-09-07 export: 102 products,
   320 variants, 3,538 units, 115 costed — all four exact.
3. **Import the product master** — built at `/settings/import` (founder + manager):
   choose file → preview counts, attribute folding and warnings → confirm; nothing is
   written before Confirm. Stock lands as `inventory_movements` type `count` carrying
   the **difference**, so re-importing the same file writes no movements and cannot
   double stock. SKUs are generated `DS-0001`…`DS-0102`; Showmore's ids are stored so
   a re-import updates instead of duplicating.
   The write path has been reviewed line-by-line against the (now applied) schema and
   looks correct, but is still **unrun against the database**.
   **Unblocked 2026-09-13** — Lucas provided a real, current product-export CSV
   (商品管理 → 匯出, dated 2026-09-13). Ran it through the already-tested parser for
   real (`parseCsv` + `parseShowmoreProducts`, no database involved): **102 products,
   321 variants, 3,512 units on hand, 115 costed / 206 uncosted, 0 orphan rows, 0
   duplicate names** — a clean parse, matching the shape of the 2026-09-07 reference
   file almost exactly (one variant added since). Only remaining step: run the actual
   import at `/settings/import` against the live database — that's the first time
   this write path touches Postgres for real, so watch it closely. It will add these
   102 products alongside the 8 fake seeded ones; nothing removes the seed data
   automatically.
4. Re-run the order import to fill `product_sales_daily` at product+variant grain,
   and produce the unmatched-name list.
5. ~~Build the Revenue screen~~ — **written 2026-09-11, not yet verified.**
   `/revenue`: KPI cards (revenue, net revenue, orders, AOV) for the selected period
   vs the immediately preceding period of equal length; a period switcher (today / 7d /
   30d / this month / quarter / year, all URL state); a table of every `sales_daily`
   row in the period with a totals row; an add/edit/delete drawer for one channel/day
   at a time. Saving **replaces** that channel's row for the date (upsert on
   `sales_daily`'s own `unique(organization_id, date, channel_id)`) — it never adds to
   an existing figure, so a manual correction and a future import behave identically.
   See the verification note under "Built and verified" above before trusting this
   screen with real data.

   **The order-export import wizard is also built now** (`/revenue/import`, "Import
   orders" from `/revenue`): choose the Showmore `訂單管理 → 匯出` CSV → preview the
   date range, total orders/gross/refunds and a day×channel breakdown, using the same
   `parseShowmore()` the 8-month website history was already verified against →
   confirm. `src/lib/import/revenueImportPlan.ts` diffs the parsed days against what's
   already in `sales_daily` (new / changed / unchanged) so a re-import visibly does
   nothing rather than silently re-writing — **this plan file is pure and its 5 tests
   ran for real** via `tsx --test` (`npm run test:calc` = 59). The write itself
   (`app/(app)/revenue/import/actions.ts`) deliberately omits `platform_fees`,
   `sessions` and `notes` from the upsert payload, so importing never clobbers a
   platform-fee reconciliation, a GA session count, or a hand-typed note for that day.
   Like the rest of the screen, the action/page/wizard component are unverified
   against Next/Supabase — **only the CSV file input still needs to be CSV, not
   Showmore's Excel export** (see below).

   **A genuinely real preview, computed in this session:** Lucas's own Downloads
   folder had `匯出訂單20260830_20260909.xlsx` (Aug 30 – Sep 9, an `.xlsx`, converted
   to CSV locally with Python/openpyxl — no network involved — purely to run the
   already-tested parser against real current data, nothing was written to the
   database). Result: **124 orders, NT$133,740 gross, 0 refunds**, all on `website`,
   day by day from Aug 30 (13 orders / NT$14,617) through Sep 9 (6 orders /
   NT$6,256) — see the commit for the full table. `sales_daily` currently has
   **nothing** for September, so this file is real, waiting revenue the import
   wizard can write in one click once you're at the keyboard. One structural note the
   parser handled correctly without changes: on this real export, a multi-item
   order's later line items have a **blank** `訂單編號` rather than a repeated one
   (the test fixtures assumed repeated ids) — but the first line's `總額` already is
   the whole order's total net of discounts, so day/channel gross totals come out
   right regardless; only per-product attribution (not used by this screen) would
   undercount on multi-item orders.

   **Showmore exported `.xlsx`, not `.csv`, for this file** — the wizard's file input
   only accepts `.csv` (same as the product-import wizard, and there's no xlsx-parsing
   library in `package.json` — adding one wasn't done here since it can't be installed
   or verified in this sandbox). Check Showmore's export screen for a CSV option; if
   it only offers Excel, open the file and "Save As" CSV UTF-8 before uploading, or
   ask and this can be revisited (e.g. add the `xlsx` package once you can `npm
   install` locally).
6. ~~Populate `customers` and `crm_metrics_monthly` from the order history — **hash
   the phone number, never store it**.~~ **Done 2026-09-14** for `customers` —
   Lucas approved the approach directly ("just do it, standard salted hash is
   fine"); see the CRM verification note above for the full design
   (HMAC-SHA256, server-only salt, wired into `/revenue/import`). Two things
   still need Lucas before it works live: run migration
   `0008_customer_phone_hash.sql`, and set `CUSTOMER_PHONE_HASH_SALT` (local
   `.env` + Vercel). `crm_metrics_monthly` (the monthly repeat-rate/retention
   rollup) is still hand-typed — computing it automatically from `customers` is
   a reasonable near-term follow-up, not done here.
7. ~~Then Projects, then Goals, then Products, then Inventory, then Content, then
   Company Health, then SOPs, then Reviews, then Marketing, then CRM, then
   Finance, then Team~~ — **all twelve done, every screen in the sidebar now
   resolves.** Projects and Goals written 2026-09-12 and typecheck clean as of
   2026-09-13 (see "Built and verified" above); Products, Inventory, Content,
   Company Health, SOPs, Reviews, Marketing, CRM, Finance and Team written
   2026-09-13, not yet typechecked. None have been click-tested against a live
   database yet. **Nothing autonomous is left to build** — what remains needs
   Lucas: run `npm run typecheck`, click-test each screen against a live database,
   run the product import (step 3, now unblocked, needs someone at the keyboard
   since it writes to the live database), and decide the phone-hashing approach
   for customer import (step 6) so `customers` can finally be populated. Content's
   calendar/kanban views (spec §07) are a reasonable follow-up once the current
   flat-list version has been click-tested — see the scope note under "Built and
   verified" above. Reviews' automatic metric pre-fill and CRM's
   `customers`/monthly-metrics automation (see both verification notes above, plus
   Finance's and Team's) are reasonable follow-ups once Lucas has decided which
   numbers belong in the review and the phone-hashing approach for customer
   import — likely worth doing together as one pass, once Lucas has clicked
   through the new screens and confirmed they behave as expected against a live
   database. Marketing's MER figure (previously listed here as blocked on Finance
   existing to cross-reference against) was built 2026-09-16 — see the dedicated
   note below the "Traps" list.

### Traps that cost time in earlier sessions

- A `'use server'` file may export **only async functions**. Exporting a const array
  or a sync helper breaks the route at runtime, not at typecheck.
- postgrest-js types the result from the **select string literal**. Building it with
  `+` widens it to `string` and every column silently becomes `never`.
- Passing a **function** as a prop from a Server Component to a Client Component
  throws at runtime. Pass resolved strings, or a template the client interpolates.
- Grid items default to `min-width: auto`; combined with `truncate`
  (`white-space: nowrap`) this makes a track as wide as the untruncated text and
  pushes the whole page into horizontal scroll. `min-w-0` on the grid item.
- A missing denominator is not a zero. CVR before GA, cost before a cost import, and
  inventory value with uncosted products must all render as "no data" with a reason.
  `conversionRateOverDays()` additionally counts orders **only on days that also have
  sessions**, so the changeover month cannot report a diluted rate.
- Vercel on a Hobby plan **refuses to build commits authored by another email**.
  Commits must be authored `325529981+daystaracc@users.noreply.github.com`; it is set
  repo-locally. Symptom is a deployment stuck at `UNKNOWN` with a 0 ms build.
- Node, `gh` and `vercel` are on the machine PATH but a shell started before they were
  installed will not see them. Prefix with
  `C:\Program Files\nodejs`, `C:\Program Files\GitHub CLI`, `%APPDATA%\npm`.
- Next.js server actions have a request body size cap (`serverActions.bodySizeLimit`
  in `next.config.ts`, default 1mb) that a large CSV/text payload can hit outright —
  the error is a clean, named one ("Body exceeded Xmb limit"), not a mystery.
- A Postgres **partial** unique index (`create unique index ... where ...`) will not
  satisfy a plain `ON CONFLICT (columns) DO UPDATE` with no matching `WHERE` — which
  is exactly what Supabase's `.upsert(rows, { onConflict: 'a,b' })` generates. If the
  partial predicate isn't actually needed (e.g. NULLs already don't collide in a
  plain unique index), just don't make it partial.
- A `.limit(N)` written when a table is empty can silently become a "hide almost
  everything" bug the moment real data lands — cross-check every list screen's cap
  against what real data volume will actually be, not what the seed/empty state was.
- Every `lib/nav.ts` entry needs an actual `page.tsx` at its `href` — a nav item with
  no matching page 404s silently until someone clicks it; nothing typechecks or lints
  this, so check it by hand when adding a nav item (or auditing an existing list).
- 2026-09-15 audit, both clean: every other `.upsert(..., { onConflict })` call in the
  app was cross-checked against its table's actual unique constraint — all plain, none
  partial, so the `customers` bug above was a one-off, not a pattern (the product
  import's `products_external_key`/`product_variants_external_key`, which *are*
  partial, are never reached via upsert — that path looks up existing rows first and
  branches into insert/update by hand, sidestepping `ON CONFLICT` entirely). Also
  checked every other `.or()` filter for the same raw-user-input risk `crm.ts`'s search
  box needed sanitizing against — the only other two (`tasks.ts`) are built from
  server-computed dates, not free text, so they're not exposed the same way.
- 2026-09-17 audit, one real gap found and fixed: every `z.string()`/`z.array()` in
  every `actions.ts` in the app was checked for a `.max()` bound (the discipline the
  body-size-limit trap above exists to protect). Every `z.array()` already had one
  (`tasks.ts`'s `labels`/`checklist`/`dependsOn`). Exactly one unbounded field existed:
  `product_variants.attributes`, a `z.record(z.string(), z.string())` with no key
  length, value length, or entry-count limit — the one exception in an otherwise
  consistently-bounded codebase. Fixed same day, see the dedicated note below.
- 2026-10-02: a `next dev` server already running when new files land on disk (e.g.
  files written by Claude through the device bridge rather than through a normal
  editor save) can cache a "module not found" for one of those files and keep
  reproducing it across every subsequent recompile — the file is genuinely on disk,
  correct bytes, correct path, but webpack's resolver never retries it. Symptom:
  `Module not found: Can't resolve '@/...'` repeating in the browser console even as
  "Compiled in Xms" keeps succeeding for everything else. Fix is a plain restart
  (Ctrl+C, `npm run dev` again) — no code change needed, don't go looking for one.
- A delete button that calls `window.confirm()` (e.g. `PillarManager.tsx`'s `remove()`)
  cannot be click-tested through Claude's browser automation — triggering or dismissing
  a native browser dialog is off-limits by design, so the click silently does nothing
  from that side. These need a human click to verify, same as any destructive action
  gated by a real confirm dialog.

**Marketing → Revenue MER connection (built 2026-09-16).** `adMetrics()` in
`lib/calculations/finance.ts` already accepted an optional `totalRevenue` param and
computed `mer` from it — only the data layer was never wired to supply it, so `mer`
was always `null` and the Ad spend tab showed a permanent "not shown yet" note
instead. `getAdSpendPage()` (`lib/data/marketing.ts`) now fetches `v_sales_daily_total`
(gross revenue, grouped by date) in parallel with `ad_spend_daily`, over the same
rolling window and same `asOf` cutoff the page already uses for ad spend, sums it with
the same `sumRevenue()` helper Revenue/Command Center use (so "total revenue" means
exactly the same thing here as on the Revenue screen — gross, not net), and passes it
into `adMetrics()`. `sales_daily_select` RLS is manager-or-above, the same gate as
`ad_spend_daily` and the whole Marketing screen (`can.viewMarketing`), so nothing new
is reachable by a role that couldn't already see both tables. If the revenue query
fails, `mer` degrades to `null` rather than failing the whole ad-spend page or showing
a number computed from partial data — same "missing is not zero" discipline as every
other calculation in this app. UI: added an `MER` KPI tile to the Ad spend tab
(`app/(app)/marketing/page.tsx`); the `merNote` string is now shown only when `mer` is
still `null` (i.e. the revenue query failed), not unconditionally — its copy changed
from "isn't shown yet" to reflect that it's a fallback, not the default state. Updated
both `en.ts` and `zh-Hant.ts`. Verified by this sandbox's standard parse-check
convention (fails only at the first unresolvable external import) on all four changed
files; **not yet click-tested against live data** — same caveat as the rest of
Marketing.

**Content → Campaign link (built 2026-09-16).** `content.campaign_id` has existed in
the schema since the original migration (creator/content tied to a specific paid
push), but nothing in the app ever read or wrote it — Content and Marketing existed as
two disconnected screens despite the schema already linking them. Wired up the same
way `product_id` already works on this screen: `getContentOptions()`
(`lib/data/content.ts`) now also fetches the org's campaigns (`id, name`) for a
dropdown; `getContentPage()`'s `SELECT` and row mapping carry `campaign` the same way
they carry `product`; `createContent`/`updateContent`
(`app/(app)/content/actions.ts`) accept an optional `campaign_id`; `ContentDrawer.tsx`
gets a Campaign select in the Advanced section (next to Talent/Hook). `campaigns` RLS
is the generic per-table shape (select = any active member, same as `content_select`),
so nothing new is reachable by a role that couldn't already see both screens
individually. Optional in both create and edit, same as `product_id` — most content
has no paid campaign behind it. Added `content.campaign`/`content.noCampaign` to both
`en.ts` and `zh-Hant.ts`. The reverse direction (showing linked content on a
campaign's own detail page) was scoped out of this first pass to keep the change
small — then built later the same day (see the note directly below). CRM's
monthly-metrics automation looked like a similar "wire up an existing column" job but
turned out not to be — see the corrected doc comment in `lib/data/crm.ts`
(2026-09-16): `customers` only stores per-customer totals, not per-order rows, so the
actual blocker is a schema decision, not a wiring gap, and needs Lucas's input before
touching production data. Verified by the sandbox's parse-check convention on all six
changed files, plus a full re-run of the automated test suite (still 74/74, unrelated
to these files but confirms no collateral breakage); **not yet click-tested against
live data.**

**Campaign detail → linked content (built 2026-09-16, later the same day).** The
other half of the Content ↔ Campaign link above: `getCampaignDetail()`
(`lib/data/marketing.ts`) now also fetches every `content` row with a matching
`campaign_id`, and the campaign detail page
(`app/(app)/marketing/campaigns/[id]/page.tsx`) lists them (title, status, publish
date) below the daily-metrics card, each linking to `/content?edit=<id>` to open that
piece directly in its edit drawer. Pure rollup, not a new permission surface:
`content_select` RLS is any active org member, a strict superset of who can even
reach this founder/manager-gated page (`can.viewMarketing`), and a `campaign_id` only
ever matches content already in the same org (it references `campaigns(id)`, itself
org-scoped) — so no extra `organization_id` filter was needed on the content query.
The edit-drawer link relies on `canEditContent` always returning true for
founder/manager, which it does, so nobody who can reach this page ever hits a link
that fails to open the drawer. Added `marketing.linkedContent`/`linkedContentEmpty`
to both locales. Verified the same way as everything else this session: parse-check
clean on all four changed files, full test suite re-run clean (74/74).

**Product variant `attributes` bounded (built 2026-09-17).** Found via a systematic
sweep of every `z.string()`/`z.array()`/`z.record()` across every `actions.ts` in the
app, checking each against the body-size-limit trap noted above: `product_variants
.attributes` (`app/(app)/products/actions.ts`) was `z.record(z.string(), z.string())`
with no bound on key length, value length, or entry count — the only such gap found;
every `z.array()` elsewhere already had a `.max()` (e.g. `tasks.ts`'s
`labels`/`checklist`/`dependsOn`). Real-world risk was low — manager-or-above only,
fed from one plain-text input in `VariantDrawer.tsx` that parses `"key: value, key:
value"` pairs — but it was the one unbounded free-text field in an otherwise
consistently-bounded codebase, so worth closing. New `attributesSchema`: keys ≤50
chars, values ≤200 chars, ≤20 entries — comfortably covers real variant dimensions
(size, color, material) with room to spare. Also added `maxLength={500}` to the
underlying `<input>` as a client-side safety net. Verified two ways: the usual
parse-check, plus — new this session — actually *running* the schema against six
cases (valid, empty, too-many-entries, key-too-long, value-too-long, empty-value) via
a real `zod` install borrowed from another tool already present in this sandbox
(`@mermaid-js/mermaid-cli`'s bundled copy, v3.25.76 vs. the app's `^3.24.0` — close
enough to trust the behavior), all six behaving as intended. Full test suite re-run
clean (74/74) after the change.

**Follow-up: client-side length bounds on free-text inputs (built 2026-09-17).**
Same day, broadened the sweep above from "does the server-side schema have a
`.max()`" to "does the `<input>`/`<textarea>` itself have a matching `maxLength`" —
every `*Drawer.tsx` already did except two spots in `TaskDrawer.tsx`
(labels/checklist), plus two search boxes that had no length bound at either layer:
CRM's customer search (`app/(app)/crm/page.tsx` + `lib/data/crm.ts`) and the ⌘K
command palette (`components/layout/CommandPalette.tsx` +
`lib/search/actions.ts`). Both search functions now cap the query at 200 chars
server-side before use (`MAX_SEARCH_LEN` in `crm.ts`; inline in `search/actions.ts`)
in addition to the new `maxLength={200}` on their inputs — no real search term is
anywhere near that long, so this only ever trims a pathological input. CRM's is the
higher-stakes one (the term is spliced into an `.or()` filter string, same file
that already had comma/paren sanitizing); the command palette's `.ilike()` calls are
parameterized by postgrest-js regardless, so it's a bandwidth/consistency guard, not
a correctness fix. Also added `maxLength` to `TaskDrawer.tsx`'s label list (1000 —
sized for up to 20 comma-separated 40-char labels, the server's own cap) and
checklist-item drafts (200, matching `addChecklistItem`'s schema), and to
`TaskPanel.tsx`'s shared `AddLine` component (now takes an optional `maxLength`
prop; 200 for checklist items, 4000 for comments, matching `addComment`'s schema —
both already server-bounded, this closes the client-side gap only). Verified: parse-
check clean on all six files, full test suite re-run clean (74/74).

**Operations screen built (2026-09-21).** Lucas reported item #12 in the sidebar
(`Operations`, `/operations`) as a 404. Investigation: the nav entry, i18n label,
and both backing tables (`operations_daily`, `customer_service_cases`) have existed
since migration `0001` — RLS for both was already live too (generic loop, migration
`0002`: select = any active member, insert/update = manager-or-above, delete =
founder-only) — but no route, data layer, or actions were ever built. The Command
Center's attention rules (`lib/calculations/rules.ts`) already linked here for
stale CS cases and orders-waiting, so this was a real, long-standing gap, not a
new feature invented from scratch.

Built: `lib/operations/constants.ts` (enums, `ActionResult`), `lib/data/operations.ts`
(`getOperationsDailyPage` — 30-day rolling window + today's snapshot + window
averages, "missing is not zero" for `avgFulfillmentMinutes`; `getCsCasesPage` —
open/waiting cases sorted first), `app/(app)/operations/actions.ts` (`upsertOperationsDaily`
— upsert by day, same idiom as Finance's monthly P&L; `createCsCase`/`updateCsCase`
— status changes stamp `resolved_at` server-side, never trusting a client
timestamp; `deleteOperationsDaily`/`deleteCsCase` — founder-only), two drawers, and
`app/(app)/operations/page.tsx` — two tabs, `?tab=daily` (default) and `?tab=cs`.
**The `cs` tab key is load-bearing**, not arbitrary: `rules.ts`'s `cs_stale` rule
already hardcodes `href: '/operations?tab=cs'` — got this right by checking that
file before naming the tabs, not after.

Permission shape: open to any active member (matches the nav item having no
`roles` restriction, and matches `*_select` RLS); creating/editing is gated to
manager-or-above in the UI (`canManage`, mirroring `*_insert`/`*_update` RLS) —
members can view both tabs' KPIs and lists but rows render as plain non-interactive
divs instead of edit links, rather than linking to a drawer that would just reject
them. i18n added for both languages (`operations` block in `en.ts`/`zh-Hant.ts`).
Verified via this sandbox's standard `tsx --eval` parse-check (all six new/changed
files resolve cleanly up to the expected external-package boundary) — full `tsc`
isn't runnable here (`node_modules` isn't installed in this sandbox), so this is
the same verification ceiling every other screen in this table has been built
under, not a lower bar applied only to this one.

**That verification ceiling missed a real bug, found the hard way (2026-09-21,
same day).** The Vercel build for this commit failed. Without a runnable `tsc`
against the real `Database` type in this sandbox, the fix came from spotting a
structural deviation instead: `updateCsCase` built its patch object as
`Record<string, unknown>`, but every other partial-update action in this codebase
(`updateGoal`, `updateTask`, `updateContentStatus`) passes either the zod-parsed
object directly or a precisely-typed local interface — never a widened
`Record<string, unknown>` — because Supabase's generated client types `.update()`'s
argument against the exact `Tables[T]['Update']` shape, and a widened `Record`
isn't assignable to it. Fixed by typing `patch` explicitly. Auditing the fix
surfaced a second, more important bug in the same two functions: `issueType`
(camelCase, from the form) was never renamed to `issue_type` (the actual column)
before being spread into the `.insert()`/`.update()` calls — it would have
compiled under the old loose typing and then either silently dropped the field or
thrown a Postgres "column does not exist" error the first time someone changed a
case's issue type. Both `createCsCase` and `updateCsCase` fixed. Lesson for next
time: when a partial update needs camelCase→snake_case renaming, reach for the
`updateContentStatus`-style precisely-typed local patch interface from the start,
never a `Record<string, unknown>` — it's not just a build-breaker, it's exactly
the shape of typo that a real type would have caught immediately instead of
compiling wrong.

Lucas separately asked for automatic order ingestion from Showmore, 蝦皮 (Shopee),
and future platforms. Flagged to him directly rather than silently built: this is
a webhook-integration project (each platform pushing order events to an endpoint
this app would need to expose and authenticate), not a data-model gap like
Operations was — `sales_channels`/`sales_daily`/`product_sales_daily` already
model multi-channel data, but nothing today writes to them except the manual
Revenue entry form and the one-time Showmore CSV import wizard. Needs platform API
credentials/webhook setup from Lucas before real work can start; not something to
build speculatively without that.

**Showmore order sync built (2026-09-21, same day).** Lucas got Showmore's real
API docs (their Swagger spec, read live via the browser pane — not guessed at)
and an API key, added `SHOWMORE_API_KEY` to Vercel himself, and said to build.
Shopee is a separate, not-yet-started project (needs its own registration/API —
nothing here touches it; see the flag above).

*What Showmore's API actually gives:* a webhook (`/your_shipping_webhook` in
their spec — registered on THEIR side, doesn't need to match this app's route
name) that fires on order created/canceled/edited/returned/reviewing/
reviewing_reject, HMAC-SHA256-signed with the API key; `GET /api/v1/order` for
one order's full detail by `order_number`; `GET /api/v1/order/allorders` for
every order in a date range, already with full item detail (no per-order
follow-up call needed for a range fetch).

*Architecture decision: feed the existing daily-aggregate tables, not a new
orders ledger.* Checked the schema first — this app has no per-order table
anywhere; Revenue and Operations are both daily aggregates
(`sales_daily`/`product_sales_daily`/`operations_daily`), and
`customer_service_cases.order_ref` is already free text, not a foreign key —
confirming no per-order table was ever assumed. `sales_channels` already has a
`website` key sitting unused; Showmore **is** the storefront (all its orders are
channel `website` by construction — Shopee, whenever built, is a wholly separate
API, never reachable through Showmore), so this was the obvious fit. A full
per-order ledger would have been a much bigger, riskier lift for a want
("orders show up automatically") that daily aggregates already satisfy.

*Reused business logic instead of reinventing it.* `lib/import/showmore.ts`
already parses Showmore's order-export CSV for the manual revenue-import
wizard, and had already worked out what counts as revenue (excluded statuses,
a returned order counting in both gross AND refunds, channel mapping) through
real production use. The new live-API path
(`lib/integrations/showmoreOrders.ts`) mirrors those exact rules — excluded =
棄單審核中(3)/已棄單(4), returned = 已退貨(6) — just against the API's integer
`order_status` instead of the CSV's Chinese status text, so a day looks the
same in Revenue whether a manual CSV import or the live sync touched it. One
deliberate v1 gap carried over unchanged from the CSV path: 已部分退貨(7) (partial
return) and 退貨中(10) are left as ordinary revenue, not prorated — Showmore's
`items[].quantity_returned` would let a later version do that properly.

*A real gap found and fixed along the way: Showmore's SKU was silently
discarded.* Went looking at how the product catalogue import
(`lib/import/productImportPlan.ts`) works before promising Lucas that adding
SKUs on Showmore's side would improve order-item matching — and found it
wouldn't have: the importer reads Showmore's own SKU (`商品編號(sku)` column)
into `ParsedVariant.sku` but never writes it anywhere; `products.sku`/
`product_variants.sku` hold only this app's own generated `DS-####` codes.
Fixed by adding `product_variants.showmore_sku` (migration 0010) and having the
importer actually save what it already parses — 2 new tests
(`productImportPlan.test.ts`) confirm it's carried through on both first import
and re-import, and that it's kept separate from the generated `sku`.

*Matching an order line item to a catalogue row is inherently best-effort* —
order data carries Showmore's SKU (nullable) and product/variant NAME text,
never a stable id. `matchCatalogueItem` (`showmoreOrders.ts`) tries SKU first,
then exact product+variant name, then (only when the order line has no variant
name and the product has exactly one variant) that variant — never a fuzzier
guess. A miss doesn't lose the sale: the day's `orders`/`gross`/`refunds` come
from the order itself, not from summing matched lines, so only the per-product
breakdown (and anything computed from it, like Overview's Hero Products
sell-through/reorder-urgency numbers) is affected by an unmatched item. Misses
are logged to `activity_logs` (visible in Overview's existing "Recent Activity"
feed — reused rather than building new UI) instead of silently dropped.

*Found and fixed a second real gap while wiring that log write:* `activity_logs`
had a select policy but no insert policy at all — every row in it came from a
trigger (`log_activity()`, migration 0001) writing with elevated privileges,
never from application code directly. That's invisible from the webhook route
(service-role client bypasses RLS) but would have silently failed from the
manual backfill action's ordinary user-session client. Fixed with a real
insert policy, manager-or-above (migration 0011) — same bar the trigger's own
writes represent.

*What got built:* `lib/integrations/showmoreOrders.ts` (pure aggregation/
matching logic, 10 tests), `showmoreClient.ts` (API client + HMAC signature
verification via `node:crypto`, `timingSafeEqual` — no timing side-channel),
`showmoreSyncWrite.ts` (the shared DB-write half, used by both callers below).
Two entry points, one core: `src/app/api/webhooks/showmore/route.ts` (the
service-role-client real-time path — on any event, refetches and resyncs the
*whole day* the order belongs to, not just that one order, so other orders that
day stay correctly summed; responding anything but plain-text "OK" makes
Showmore retry automatically, so a thrown error is a free retry rather than a
dropped event) and `syncShowmoreOrders` (`app/(app)/revenue/import/
showmoreOrderSyncActions.ts`, manager/founder-gated, backing a small "Sync now"
date-range panel on `/revenue/import` — for the first historical backfill and
for spot-checking a range, since the webhook only covers what happens after
it's registered).

*Deliberately left alone:* `operations_daily`. Its upsert **replaces** the
whole day's row (same "save replaces the day" idiom this sync itself uses for
`sales_daily`), and that table also carries fields no order feed could ever
know — errors, returns-as-logged-by-a-human, CS pending, fulfillment timing —
that the team enters by hand on the Operations screen. Auto-writing order
counts into it risked silently clobbering real hand-entered operational data.
Left for the team's existing manual daily-log workflow; revisit only if Lucas
asks for it explicitly.

*Verification ceiling, same as always in this sandbox:* no live Supabase, no
`node_modules` (`react`/`lucide-react`/`next/*` all fail to resolve here by
design — see `npm run test:calc`'s own limits below), so nothing here has run
against a real database or been click-tested. What **was** run: `npm run
test:calc` — 86/86 passing (76 pre-existing + 10 new in
`showmoreOrders.test.ts`, plus 2 new in `productImportPlan.test.ts` for the
`showmore_sku` fix), and every new/changed `.ts`/`.tsx` file resolves cleanly
via `npx tsx --eval "require(...)"` up to the first genuinely-external import
(`next/server`, `next/cache`, `lucide-react`, `@supabase/supabase-js` — the
same expected ceiling documented in §0). **Before this goes live**, Lucas needs
to: apply migrations 0010 and 0011 to the real Supabase project; add
`SUPABASE_SERVICE_ROLE_KEY` to Vercel (Supabase project settings → API →
`service_role` key — the webhook route has no user session to authenticate
with, so it needs this to write at all, and it wasn't already set); and, once
deployed, register `https://daystar-os.vercel.app/api/webhooks/showmore` on
Showmore's 串接文件 settings page.

---

## 1. Requirements extracted from the 100M Playbook

| Playbook system | What the OS must do | Where it lives |
|---|---|---|
| **100M math** — NT$100M/yr = 137 orders/day at AOV 2,000; Revenue = Traffic × CVR × AOV × Repeat | Editable targets per metric per period; a pacing engine that turns any target into *ahead / on pace / behind*; the revenue ladder as the 100M Journey | `targets`, `computePacing()`, `/overview`, `/goals/journey` |
| **Stages** — 1M → 2.5M → 5M → 8.33M/month; checkpoint: stable NT$2.5M/month for 3 months by 2027 Q4; 100M annualized by 2028 Q4 | Journey milestones with target dates, requirements, bottlenecks; each stage shows a different company (focus list) | `targets` (`monthly_revenue`, `annual_revenue`), Journey page |
| **Hero Products** — 5–10 products that carry the brand: stable stock, KV, 20+ videos each, reviews, bundle/upsell | Product master with `is_hero`, tier (Entry/Core/Premium/High Ticket); Hero view with revenue share, weeks of supply, content count, margin; alerts on low stock / decline | `products`, `product_sales_daily`, `content.product_id`, `/products/hero` |
| **Content engine** — 20–40 pieces/week, launch engine T‑14 … D+7, top content visible | Content OS: calendar, pillars (categorization) × status (Idea → Planned → Shot → Posted, collapsed to 4 stages 2026-10-02), metrics; weekly target with pacing; publishing consistency | `content`, `pillars`, `content_metrics`, `targets.weekly_content`, `/content` |
| **AOV stack** — near‑term NT$1,300–1,500, long‑term 1,800–2,300+ via bundles, threshold, upsell, tiers | AOV KPI vs target and MoM; AOV KR; rule when AOV < 90% of target or declines ≥5% | `sales_daily`, `key_results`, rules `aov_*` |
| **CRO / PDP 12** — CVR 2–3%+ | CVR from sessions and orders; rule when CVR < 80% of target; CRO project | `sales_daily.sessions`, rule `cvr_below_target` |
| **Retention** — repeat revenue 25–35%+, 12 CRM flows, membership | CRM module with the 12 flows (status, channel, revenue); monthly repeat metrics; repeat‑revenue KR | `crm_flows` (12 fixed keys), `crm_metrics_monthly` |
| **Traffic** — paid funnel, ROAS/MER/CAC; 100–300 creators, 30–100 micro creators per market | Paid ads daily rows with derived ROAS/MER/CAC/CPM/CTR/CPC; creator pipeline with 8 statuses | `ad_spend_daily`, `creators`, `creator_content`, `adMetrics()` |
| **Inventory** — ABC, sell‑through, weeks of supply, QC, no stockouts on Hero SKUs | Inventory with safety stock / reorder point / MOQ / lead time; every change is a movement (append‑only audit trail); ABC by revenue share; alerts critical/low/overstock/dead/incoming late | `inventory`, `inventory_movements` (+ trigger), `inventory.ts`, rules `*_stock_*`, `incoming_late` |
| **Finance** — GM 55–65%+, contribution margin formula, monthly management P&L, cash | Monthly management finance with the Playbook formula; cash and inventory value on the dashboard; founder‑only | `financial_monthly`, `contributionMargin()` |
| **Operations** — SLA DM < 2h / Email < 24h, fulfillment log, returns | Operations daily log, CS cases with issue types; rule when a case waits > 24h | `operations_daily`, `customer_service_cases`, rule `cs_stale` |
| **11 systems scorecard** (Brand … Finance, 1–5 each; draft 21/55) and **ownership matrix** | Business systems with score, owner, future owner, bottleneck, next action, transfer date; score history; DAYSTAR health score | `business_systems`, `system_scores`, `/company/health` |
| **WBR / MBR** — weekly 13‑metric review, monthly questions | Reviews as a workflow with sections, wins/problems/decisions/priorities, automatic previous‑week comparison, stored history | `reviews`, `review_metrics` |
| **Team 10–20, 11 functions, SOPs** — founders out of fulfillment | Team directory, member workload, SOP library (11 categories, versioned) | `memberships`, `sops` |
| **Baseline (Sept 2026)** — ≈NT$700K/month, 20–25 orders/day, AOV ≈NT$1,000, IG 34K, TikTok 11K | Seed data reproduces this baseline so the first login already shows the real situation | `supabase/seed.sql` |

Long‑term KPI targets from the Playbook are seeded as **editable rows**, never constants: annual NT$100M, monthly NT$8.3M, 120–150 orders/day, AOV 1,800–2,300+, GM 55–65%, CVR 2–3%, repeat 25–35%, Hero Products 5–10.

---

## 2. Information architecture

Grouped left navigation (collapsible), Lucide icons, monochrome.

| Group | Screen | Primary question it answers | Founder | Manager | Member |
|---|---|---|---|---|---|
| Command Center | **01 Overview** | What is happening at DAYSTAR today? | ● | ● | → My Work |
| | Founder View | Can I understand the company in 60 seconds? | ● | | |
| | My Work | What do *I* need to do today? | ● | ● | ● |
| Plan | **02 Goals** | Where are we going, are we on track? | ● | ● | read |
| | **03 Projects** | What are we executing, is it healthy? | ● | ● | own |
| | **04 Tasks** | What needs to be done, by whom, when? | ● | ● | ● |
| Grow | **05 Revenue** | How much are we selling, vs target? | ● | ● | |
| | **06 Products** (+ Hero) | Which products carry the business? | ● | ● | read |
| | **07 Content** | Are we producing, what works? | ● | ● | ● |
| | **08 Marketing** | Is paid / creator spend working? | ● | ● | |
| | **09 CRM** | Are customers coming back? | ● | | |
| Operate | **10 Inventory** | Will we run out? | ● | ● | movements |
| | **11 Operations** | Are orders shipping, is CS handled? | ● | ● | ● |
| | **12 Finance** | Are we making money, where is cash? | ● | | |
| Company | **13 Team** | Who owns what, who is loaded? | ● | ● | read |
| | **14 Reviews** | What did we learn, what do we decide? | ● | ● | |
| | **15 SOPs** | How do we do things? | ● | ● | read |
| System | **16 Settings** | Targets, users, channels, language | ● | | |

**Top bar:** global search (⌘/Ctrl K: tasks, projects, products/SKU, SOPs, campaigns, people, goals), Quick Create (task, project, revenue, product, inventory adjustment, content, campaign, meeting note), notifications, date, language switch (EN / 繁), profile.

**Smart defaults:** Tasks opens to *My Tasks*; Revenue opens to *This Month*; Content opens to *Calendar → Week*; Inventory sorts by *weeks of supply ascending*; Overview highlights problems before numbers.

**Mobile:** bottom navigation with Home · Tasks · Revenue · Alerts · Quick Add; inventory search; task completion; alerts. Not a shrunk desktop.

---

## 3. Command Center (spec §12–18, §59)

Order, top to bottom; only the first three are above the fold:

1. **Greeting + company status** — `Good afternoon, KAi.` / `Here's what matters at DAYSTAR today.` Status pill ON TRACK / AT RISK / OFF TRACK from `companyStatus()`; 3–5 executive lines from `executiveSummary()`.
2. **Monthly revenue target** — actual, target, %, progress bar with the *expected* marker; current pace, required pace, projected finish, days remaining, difference. All from `computePacing()`.
3. **What needs attention** — ranked Critical → Low from `evaluateRules()`; View / Resolve / Dismiss (optimistic; stored in `attention_dismissals`).
4. **Core KPIs** — Revenue, Orders, AOV, Website CVR, Gross margin, Repeat revenue, Cash, Inventory value. Each: value, target, MoM, status line.
5. **Today at DAYSTAR** — revenue, orders, waiting to ship, CS pending, low‑stock SKUs, tasks due, overdue, publishing today.
6. **100M journey** — Current → 1M → 2.5M → 5M → 8.33M → 100M/yr strip; run‑rate and gap; full interactive stages at `/goals/journey`.
7. **Today's tasks** (checkbox completes; recurrence spawns next) · **Project health**.
8. **Hero products + inventory alerts** · **Content this week**.
9. **Business health** (11 × dots, score / 55).
10. **Recent activity** (audit log).

Date controls (Today / 7D / 30D / This month / Quarter / Year) scope the KPI cards and charts; the revenue target block is always the current month.

---

## 4. Data model

PostgreSQL on Supabase. UUID keys, `organization_id` on all business tables (multi‑tenant ready), `created_at / updated_at / created_by`, text status columns with CHECK constraints, indexes on the columns screens filter on. Full DDL: `supabase/migrations/0001_schema.sql`.

```
organizations ─┬─ departments
               ├─ memberships (profile, role: founder | manager | member) ── profiles (auth.users)
               ├─ targets (metric, period, value)  ← every editable number
               ├─ goals ─ objectives ─ key_results ─┐
               ├─ projects ─ project_members         ├─ tasks ─ task_assignees / checklists / comments / dependencies / labels
               ├─ suppliers ─ products ─ product_variants
               │              ├─ inventory  ←(trigger)─ inventory_movements (append‑only)   inventory_counts
               │              └─ product_sales_daily
               ├─ sales_channels ─ sales_daily (net_revenue generated)
               ├─ financial_monthly, expenses
               ├─ campaigns ─ campaign_metrics ; ad_spend_daily
               ├─ content ─ content_metrics ; pillars (2026-10-02) ; creators ─ creator_content
               ├─ customers, crm_flows (12 keys), crm_metrics_monthly
               ├─ operations_daily, customer_service_cases
               ├─ business_systems ─ system_scores (history)
               ├─ reviews ─ review_metrics ; sops
               └─ notifications, activity_logs, attachments, attention_dismissals
```

**Invariants enforced in the database**

- `inventory.on_hand` only changes through `inventory_movements` (trigger `apply_inventory_movement`); movements cannot be updated or deleted → complete audit trail. Product status (`low_stock` / `out_of_stock`) follows stock.
- `tasks.completed_at` follows `status = done` (trigger). Completing a recurring task creates the next occurrence (server action `completeTask`).
- `business_systems.status` follows the score; every score change is written to `system_scores`.
- Financial, target, inventory, revenue, key‑result and task changes are written to `activity_logs` by security‑definer triggers.
- Views (`v_project_progress`, `v_sales_daily_total`, `v_product_sales_30d`) run with `security_invoker` so RLS applies.

**Role‑based access (RLS, `0002_rls.sql`)**

| Data | Founder | Manager | Member |
|---|---|---|---|
| Organization, memberships, targets, departments | read/write | read | read |
| Goals, objectives, key results, projects | read/write | read/write | read |
| Tasks | all | all | create; edit own / assigned |
| Content | all | all | create; edit own |
| Pillars (2026-10-02) | all | create/rename/recolor | read |
| Products, suppliers, inventory config | all | all | read |
| Inventory movements | insert | insert | insert (append‑only for everyone) |
| Sales daily, ad spend | all | all | — |
| Financial monthly, expenses, customers | all | — | — |
| Business systems, reviews, SOPs | all | read/write | read |
| Notifications | own | own | own |
| Activity log | read | read | — |

The UI mirrors these in `src/lib/permissions.ts` for convenience; the database is the authority. The service‑role key is server‑only (`src/lib/supabase/admin.ts`, `server-only`).

---

## 5. Calculation layer (`src/lib/calculations`, tested)

| Function | Used by |
|---|---|
| `computePacing({target, actual, periodStart, periodEnd, asOf})` → progress, expected, required pace, actual pace, projected finish, variance %, `ahead / on_pace / behind` (±5% of expected) | revenue target, content target, project targets, KRs |
| `aov`, `conversionRate`, `grossMarginPct`, `contributionMargin` (Revenue − COGS − fees − shipping − packaging − ads − returns), `adMetrics` (ROAS, MER, CAC, CPM, CTR, CPC, CVR) | KPIs, finance, marketing |
| `weeksOfSupply`, `stockCoverDays`, `sellThroughPct`, `inventoryTurnover`, `stockStatus` (critical / low / ok / overstock / dead), `reorderSuggestion`, `abcClassify` (80 / 95), `inventoryValue` | inventory, hero products, rules |
| `keyResultProgress`, `keyResultStatus` (progress vs elapsed time), `projectProgress`, `projectHealth` | goals, projects |
| `healthScore`, `systemStatus`, `companyStatus` | business health, status pill |
| `evaluateRules(snapshot)` → ranked `AttentionItem[]`; `executiveSummary()` | What needs attention, summary |
| `formatTWD`, `formatTWDCompact` (NT$742.4K / NT$74.2 萬), `formatPercent`, `formatDelta`, `pctChange` | everywhere a number is shown |

Run: `npm run test:calc` (12 tests). No UI component contains business math.

**Smart insight rules (deterministic, not AI)**

| Code | Condition | Severity |
|---|---|---|
| `revenue_behind` | actual < expected pace by ≥10% (≥20% → critical) | high / critical |
| `hero_stock_critical` / `stock_critical` | stock status critical (≤ safety stock or < 1.5 weeks of supply) | high (hero) / medium |
| `hero_stock_low` | hero product ≤ reorder point or < 4 weeks | medium |
| `incoming_late` | incoming > 0 and ETA passed | medium |
| `project_at_risk` | deadline < 7 days and completion < 70% | high |
| `project_overdue` | deadline passed, not complete | high |
| `tasks_overdue_urgent` / `tasks_overdue_high` / `tasks_blocked` | counts > 0 | high / medium / medium |
| `content_behind` | published this week < 85% of the elapsed share of the weekly target | medium |
| `aov_declined` / `aov_below_target` | MoM ≤ −5% / < 90% of target | medium |
| `cvr_below_target` | < 80% of target | medium |
| `kr_off_track` | KR progress more than 25 points behind elapsed time | medium |
| `review_due` / `review_overdue` | weekly review due within 1 day / past | low / medium |
| `cs_stale` | CS case without response > 24h | medium |
| `orders_waiting` | orders waiting to ship | low |
| `system_critical` | business system scored 1/5 (max 2 shown) | low |

Messages are i18n keys (`attention.<code>`) with parameters, so the same rule reads correctly in both languages. Resolve hides an item for 30 days, Dismiss for 7 (`attention_dismissals`); the condition is re‑evaluated on every load.

---

## 6. Design system

**Identity:** premium business software from a fashion‑forward technology company. Editorial, minimal, sharp, quiet luxury. Neutral surfaces; color only carries meaning.

**Tokens** (`src/styles/globals.css`, `tailwind.config.ts`)

| Token | Value | Use |
|---|---|---|
| `--bg` | #F7F4EF cream | app background |
| `--surface` | #FFFFFF | cards, tables, drawers |
| `--muted` | #EDE9E2 stone | fills, hover rows, kbd |
| `--border` / `--border-strong` | warm gray hairlines | dividers, inputs |
| `--ink` / `--ink-2` / `--ink-3` | #111 / #595959 / #737373 | text hierarchy |
| `--brand-brown` (#4B3A2C) | primary action, avatar | `--brand-gold` (#C8A566): progress and hero accents, sparingly |
| `--ok` / `--warn` / `--bad` (+ soft) | green / amber / red | healthy‑completed / at risk / critical‑behind‑overdue |
| radius 6 / 10 / 14 / 20 · shadows: hairline card, soft pop, drawer · durations 120 / 180 / 260 ms |

No blue as an interface color. No gradients, no glassmorphism, no illustration, no emoji.

**Typography:** Geist (Latin, tabular numerals) + Noto Sans TC (Chinese), Geist Mono for codes/SKUs. Scale: `label` 11px uppercase tracking .06em muted · body 14px · section title 14px semibold uppercase · `kpi` 32px/600 · `kpi-lg` 44px/600. Headings are not all huge.

**Components:** card (hairline, radius 14) · pill (status) · button primary (brown) / outline / ghost · input · table (row hover, no heavy borders, 40px rows) · drawer (right, 480px, for create/edit) · side panel (detail from tables) · command palette · toast · skeleton · empty state (what it is, why it matters, one CTA).

**Rules of the interface**
- Context before data: a KPI shows value → target → trend → status; never a bare number.
- One primary purpose per screen; progressive disclosure (Advanced options ▾).
- Forms: ≤ 5 fields visible; drawers for simple creation; inline validation.
- Tables: search, sort, filter button (Status · Owner · Project · Date · Priority) with removable chips and *Clear all*; column visibility; pagination; row click → side panel or detail page.
- Microinteractions: optimistic updates, 180 ms fades, checkbox completion, drag feedback; count‑up numbers only on the revenue target.
- Accessibility: contrast ≥ 4.5:1 for text, visible focus rings, keyboard navigation (⌘K, Esc closes drawers), semantic HTML, `aria-current`, labelled icon buttons.

---

## 7. Core user journeys

1. **Founder morning check (≤ 60 s):** login → Overview → status pill + summary → revenue target → attention list → act (View opens the entity, Resolve/Dismiss) → today's tasks → done. Founder View is the same in six blocks: Today · This month · Business · Execution · Cash · Next 3 actions.
2. **Employee daily work:** login → My Work → `Good afternoon, Alexander. 3 tasks remaining.` → Today / Upcoming / Overdue / My projects → check off → recurring task reappears tomorrow.
3. **Create task:** ⌘K or Quick Create → drawer (Title, Assignee, Due, Priority, Project; Advanced ▾ for description, labels, checklist, recurrence, dependencies) → optimistic insert → activity log.
4. **Manage project:** Projects → project page (Overview · Tasks · Timeline · Files · Notes · Activity) → health from `projectHealth()` → add tasks inline → status change → Overview reflects it.
5. **Update revenue:** Revenue → *Add revenue* drawer (date, channel, orders, gross, refunds, fees; sessions optional) → net generated → pacing and KPIs recalc → activity log.
6. **Check inventory:** Inventory (sorted by weeks of supply) → product → *Adjust* drawer (type, quantity, reference, note) → movement inserted → on_hand updated by trigger → status and alerts recalc.
7. **Review hero products:** Products → Hero → table (revenue share, units, stock, WoS, margin, content pieces, views, status) → alerts → open product → create task "Reorder".
8. **Schedule content:** Content → Calendar (Month/Week/List) → drag to date → side panel → change status through the pipeline → published → add metrics → weekly target pacing.
9. **Weekly Business Review:** Reviews → *New weekly review* (pre‑filled from data with previous‑week comparison for Growth · Product · Content · CRM · Operations · Finance · Team) → Wins · Problems · Decisions · Next‑week priorities → complete → stored; next review compares automatically.

---

## 8. Internationalisation

`src/lib/i18n`: typed dictionaries (`en.ts`, `zh-Hant.ts`, key parity enforced by types and a test), `t(key, params)` with `{param}` and minimal plural syntax, locale from cookie → profile → default **zh‑Hant**. The switch in the top bar sets both cookie and `profiles.locale`. Data fields have `name_zh` / `title_zh` where the team writes bilingual names; numbers format as NT$742.4K (EN) / NT$74.2 萬 (繁). Dates follow the locale; the company timezone is Asia/Taipei.

---

## 9. Implementation plan

Map to the spec's phases. Definition of done for every module: works end‑to‑end against Supabase, permissions verified with all three seed accounts, empty / loading / error states, both languages, desktop 1440 + iPad + mobile.

| Phase | Scope | Status (2026-09-08) |
|---|---|---|
| **1 Foundation** | design tokens, auth (email/password, reset, persistent sessions, logout), schema, RLS, seed, app shell (sidebar, top bar, language switch), command palette | **done and deployed** — tokens ✔ schema ✔ RLS ✔ seed ✔ calc layer ✔ i18n ✔ auth ✔ shell ✔ middleware ✔ · ⌘K palette: **done 2026-09-14**, see §0 |
| **2 Core OS** | Command Center, Goals/OKR, Projects, Tasks (My Tasks, list, kanban, calendar, recurring), 100M Journey | Command Center **done** · My Work **done** · Tasks **done** (list/kanban/calendar, CRUD, recurrence, filters, detail panel) · Goals, Projects, 100M Journey page: not built |
| **3 Commerce** | Revenue (entry, charts), Products, Hero Products, Inventory (movements, counts, ABC, alerts) | **in progress** — order history imported to `sales_daily` (Jan–Aug 2026, real); parser tested; product import blocked on migrations 0005/0006. Screens not built. |
| **4 Growth** | Content OS (calendar, pipeline, library, metrics), Marketing (campaigns, paid, creators), CRM | schema + calculations ready · screens: next |
| **5 Operations** | Operations, Finance (management P&L), Team, Reviews (WBR/MBR), SOPs | schema ready · screens: next |
| **6 Intelligence** | Attention rules, business health, notifications fan‑out (cron), global search, audit log screen | rules engine ✔ (incl. the three stall rules below) · dismissals ✔ · triggers ✔ · global search ✔ and notifications *read/mark-read* UI ✔ (both 2026-09-14, see §0) · notifications fan-out ✔ (2026-10-01) · **audit log screen ✔ (2026-10-02, see §0)** — this was the last item in Phase 6, now all built |
| **7 Polish** | mobile bottom nav, animations, performance, accessibility pass, empty/error states, CSV import wizard | mobile layout verified at 360/390px ✔ · empty/loading/error states on Tasks ✔ · ⌘K done (§0) · bottom nav, import wizard: next |

Three rules were added beyond the table in §5 after the July→August 2026 drop
(NT$924K/928 orders → NT$495K/443; posting stopped, ads stopped, a campaign ended,
AOV actually rose, so the entire loss was order volume):

| Code | Condition | Severity |
|---|---|---|
| `content_output_stopped` | nothing published in 3 days, or last 7 days under 50% of the weekly target | high |
| `ad_spend_stopped` | 3+ consecutive zero/missing ad-spend days **when the prior 14 averaged > 0** | high |
| `orders_per_day_declining` | 7-day average orders/day ≥20% below the prior 28-day average | high, **critical at ≥30%** |

`orders_per_day_declining` is the leading indicator — revenue pacing lags it by days.
A missing `ad_spend_daily` row counts as zero (not spending and not recording look the
same from outside). Order averages report no baseline until there is history behind
the recent week, so a fresh install does not accuse itself of collapsing.

**First usable version** (spec §67) = Phase 1 + 2 + Products/Hero/Inventory + Content calendar + Business health + Weekly review + basic Finance + Team. Build order inside Claude Code: `npm run typecheck` green → login → Overview renders seed → Tasks → Projects → Goals/Journey → Products/Inventory → Content calendar → Health → Reviews → Finance → Team.

**Verification checklist before calling a screen done** (spec §64): auth · persistence · CRUD · task completion · assignment · project progress · goal calculations · revenue pacing · inventory movements · content calendar · charts from database data · filters · search · permissions (test as Alexander) · responsive · loading · empty · error.

---

## 10. Integrations and the future copilot

All external data enters through the same tables manual entry uses (`sales_daily`, `product_sales_daily`, `ad_spend_daily`, `content_metrics`, `customers`). Adapters live in `src/lib/integrations/<source>/` (planned: DAYSTAR website / Shopline, Shopee, Meta, TikTok, LINE, email, accounting; **GA4 `G-Z4D3DGFW5J` is installed on the site as of 2026-09-08 but nothing reads it yet — `sales_daily.sessions` is still filled by hand**) and never touch UI code; a nightly job upserts rows, and the dashboard does not know or care where a row came from. CSV import follows the same path (upload → preview → map → validate → import → results; invalid rows are never written silently).

**Showmore API — confirmed available, planned replacement for the CSV path.** Showmore
support have confirmed the shop backend offers both a pull and a push route:

| | |
|---|---|
| Orders API | `GET /api/v1/orders`, authenticated with an API Key |
| Webhook | fires on a new order |
| Where to configure | shop backend → 設定 → API Key, and the Webhook field |
| Docs | https://gateway-showmore.showmore.cc/api-integration-documentation/ |

It writes to the **same tables** the CSV import and manual entry use — `sales_daily`,
`product_sales_daily`, `inventory_movements` — through an adapter at
`src/lib/integrations/showmore/`, so nothing downstream changes when it replaces the
export files. The parser’s rules stay relevant either way: they are facts about
Showmore’s data (總額 includes shipping, 已退貨 is a real order, 成本 0 means unknown),
not about CSV. **Not built — recorded here so the CSV path is understood as interim.**

Because every fact is structured (targets, pacing, rules, activity, reviews), the future **DAYSTAR AI** can answer "why are we behind target?" from the same snapshot the Command Center renders — no chatbot is built now.

---

## 11. Open decisions (confirm before Phase 2 continues)

1. Accounts: KAi and Lucas as founders, Alexander as member — correct? Real emails to replace the demo ones.
2. September target: seeded NT$1,000,000 (Stage 1 door). Keep, or start from a nearer number (e.g. NT$850,000)?
3. Revenue channels: Website + Shopee confirmed; "Other" = markets/pop‑ups?
4. Which five products are the Hero candidates today (seed marks Tennis Bracelet, Tennis Chain, Cuban Ring, Cross)?
5. Default language zh‑Hant for everyone, with KAi on English — confirm.
6. Weekly review day (seed assumes Monday) and the 20:00 publishing routine owner.
