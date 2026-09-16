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

## 0. Current state — read this first (updated 2026-09-15)

Sections 1–10 are the product spec and remain the target. This section is where the
build actually is. It is written for someone picking this up cold.

**Live:** https://daystar-os.vercel.app · repo `daystaracc/daystar-os` (private) ·
Vercel project `daystar-os`, scope `daystar3`.
Accounts: `kaistarkai77@gmail.com` (KAi, founder) · `lucasmccollister@gmail.com`
(Lucas, founder) · `dtyangtony@gmail.com` (Alexander, member) — password `daystar2026`.

### Built and verified

| Area | State |
|---|---|
| Auth, middleware route protection, app shell, role-based nav | done |
| i18n EN ↔ 繁中, key parity enforced by test, `localizedField()` for `*_zh` columns | done |
| Command Center `/overview` | done |
| My Work `/my-work` (member home) | done |
| Tasks `/tasks` — list · kanban (drag-drop) · calendar, full CRUD, recurrence, filters, detail panel | done |
| Revenue `/revenue` — KPI cards, period switcher (today/7d/30d/month/quarter/year), table of `sales_daily` entries, add/edit/delete drawer | **live-verified 2026-09-15** — real order history imported (6,772 orders), numbers match the pre-verified parse |
| Revenue order-import wizard `/revenue/import` — Showmore order CSV → preview (diffed new/changed/unchanged) → confirm | **live-verified 2026-09-15** — see above; hit and fixed a real body-size-limit bug along the way (§ below) |
| Projects `/projects` — list (health/status/progress/owner/deadline), detail page (progress, stats, notes, linked tasks, members), create/edit drawer, member add/remove | typechecks clean (2026-09-14 full run) — not yet click-tested |
| Goals `/goals` — goals → objectives → key results (OKR hierarchy), grouped list by level, detail page with inline key-result progress updates, create/edit/delete at all three levels | typechecks clean (2026-09-14 full run) — not yet click-tested |
| Products `/products` — catalogue list (tier/status/stock/margin), detail page with variants, per-variant stock counting, create/edit/delete | **live-verified 2026-09-14** — real catalogue imported (102 products, 321 variants); code-reviewed 2026-09-15 to confirm no stale-seed assumptions |
| Inventory `/inventory` — read-only dashboard: valuation, stock-status breakdown, reorder-needed list linking into Products | **live-verified 2026-09-14** (see Products above) — reads the same real `inventory` rows, no caps |
| Content `/content` — flat pipeline list (idea → … → published), weekly publishing-pace card, create/edit/delete | typechecks clean (2026-09-14 full run) — not yet click-tested |
| Company health `/company/health` — 11 fixed systems scorecard (score, owner, bottleneck, next action, score history), edit-only | typechecks clean (2026-09-14 full run) — not yet click-tested |
| SOPs `/sops` — document library across 11 fixed categories, list + detail page, hand-versioned | typechecks clean (2026-09-14 full run) — not yet click-tested |
| Reviews `/reviews` — weekly/monthly WBR/MBR: create by period, wins/problems/decisions/priorities, manual metrics log grouped by section, mark complete/reopen, list + detail page | typechecks clean (2026-09-14 full run) — not yet click-tested |
| Marketing `/marketing` — Campaigns / Ad spend / Creators in one tabbed screen (`?tab=`); campaign daily metrics, ad spend log with real ROAS/CAC/CPM/CTR/CVR, creator roster with a manual content/sales log | typechecks clean (2026-09-14 full run) — not yet click-tested |
| CRM `/crm` — Flows (12 fixed automations) / Monthly metrics / Customers in one tabbed screen; founder-only | **live-verified 2026-09-15** — 5,404 real customers imported; Customers tab rebuilt with pagination + search (was hard-capped at top 200, see below) |
| Finance `/finance` — Monthly management P&L / Expenses in one tabbed screen; founder-only, contribution-margin math | typechecks clean (2026-09-14 full run) — not yet click-tested |
| Team `/team` — directory + live workload (open/overdue task counts) for every active member; edit-only, founder-only writes, open to all for read | typechecks clean (2026-09-14 full run) — not yet click-tested |
| Settings `/settings` — organization info + data/import hub | **new 2026-09-15** — this page didn't exist; the sidebar link 404'd for every founder until now. See below |
| Customer import — `/revenue/import` now also populates `customers` from the same file, phone numbers hashed and never stored | **live-verified 2026-09-15** — see Revenue above; hit and fixed a real `ON CONFLICT` bug in migration `0008` (§ below, fixed by `0009`) |
| Global search `⌘K` — searches nav + tasks/projects/goals/products/content/SOPs | typechecks clean (2026-09-14 full run) — not yet click-tested |
| Notifications `/notifications` — read + mark-read UI, unread badge on the bell icon | typechecks clean (2026-09-14 full run) — not yet click-tested. Table has no populate path yet (no fan-out/cron) |

> **⚠ Decision needed from Lucas — do not build until he confirms (flagged 2026-09-15):**
> While walking through the first live customer import, Lucas asked for the CRM
> Customers screen to show "full info, emails phone number etc." for all 5,404
> customers. Nothing was built for raw phone/email capture — this is flagged, not
> silently implemented, because it's a direct reversal of a deliberate,
> already-built privacy decision, not just a UI gap:
>
> - `lib/import/showmore.ts`'s `CUSTOMER_COLUMNS` comment says plainly: *"Never
>   read into the application — DAYSTAR does not store customer personal data."*
> - The entire phone-hash system (migrations `0008`/`0009`, `customerHash.server.ts`,
>   HMAC-SHA256 keyed by a server-only secret) exists specifically so a repeat
>   customer can be detected **without ever storing the real phone number** —
>   Lucas approved that exact design on 2026-09-14 ("standard salted hash is
>   fine"). Reading `訂購人電話`/`收件人 Email` into `customers.phone`/`customers.email`
>   for real would undo that, for all 5,404 people in the file, not just new ones.
> - There's also a live-business angle, not just a code one: Taiwan's Personal
>   Data Protection Act (PDPA) puts real obligations on a business that collects
>   and stores customers' phone numbers and emails (purpose notice, security
>   measures, breach handling) — worth Lucas weighing that against what he
>   actually needs the info *for*, rather than defaulting to "store everything."
>
> **Options for Lucas to pick from, not yet built:**
> 1. **Keep hash-only.** `customers.phone`/`.email` stay reserved for manual entry
>    only (already the case — CRM now shows them when present). Nothing changes.
> 2. **Capture email only.** Lower-risk than phone — no hashing system exists for
>    it either way, and it's the more normal thing for a CRM to hold. Would mean
>    reading `收件人 Email` in `customerAggregation.ts` and writing it alongside
>    name.
> 3. **Capture real phone too**, reversing the 0008/0009 design outright — needs
>    Lucas to explicitly say so, since it's the opposite of what he approved a day
>    earlier, and it's the one with the actual PDPA exposure.
>
> Whatever he picks, the fix is small (a couple of new fields threaded through
> `customerAggregation.ts` → `importShowmoreCustomers` → the `customers` upsert)
> — the point of flagging it is the decision, not the difficulty.

**Every screen in the sidebar now resolves — nothing 404s any more** (2026-09-15:
this was actually false until today — `/settings` had linked from the sidebar
with no page behind it since the nav was built; see below), **and the two
dead top-bar controls (search, the bell) both go somewhere real.**
`npm run typecheck` is clean, the product import and the full order/customer
import have both run successfully against Lucas's real data (§ below). What's
left: click-testing the screens still marked "typechecks clean, not yet
click-tested" in the table above, and the phone/email PII decision flagged
just above — nothing else is currently blocked on Lucas.

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
as Marketing/CRM's totals), not a new calculation-layer function. Re-ran the full
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
   verified" above. Reviews' automatic metric pre-fill, Marketing's MER figure,
   and CRM's `customers`/monthly-metrics automation (see all three verification
   notes above, plus Finance's and Team's) are reasonable follow-ups once Lucas
   has decided which numbers belong in the review, the phone-hashing approach for
   customer import, and now that Finance actually exists to cross-reference
   against (MER needs `sales_daily`'s total revenue over the same window as
   `ad_spend_daily` — that cross-reference itself is still unbuilt, deliberately,
   same reasoning as before) — likely worth doing together as one pass, once
   Lucas has clicked through the new screens and confirmed they behave as
   expected against a live database.

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

---

## 1. Requirements extracted from the 100M Playbook

| Playbook system | What the OS must do | Where it lives |
|---|---|---|
| **100M math** — NT$100M/yr = 137 orders/day at AOV 2,000; Revenue = Traffic × CVR × AOV × Repeat | Editable targets per metric per period; a pacing engine that turns any target into *ahead / on pace / behind*; the revenue ladder as the 100M Journey | `targets`, `computePacing()`, `/overview`, `/goals/journey` |
| **Stages** — 1M → 2.5M → 5M → 8.33M/month; checkpoint: stable NT$2.5M/month for 3 months by 2027 Q4; 100M annualized by 2028 Q4 | Journey milestones with target dates, requirements, bottlenecks; each stage shows a different company (focus list) | `targets` (`monthly_revenue`, `annual_revenue`), Journey page |
| **Hero Products** — 5–10 products that carry the brand: stable stock, KV, 20+ videos each, reviews, bundle/upsell | Product master with `is_hero`, tier (Entry/Core/Premium/High Ticket); Hero view with revenue share, weeks of supply, content count, margin; alerts on low stock / decline | `products`, `product_sales_daily`, `content.product_id`, `/products/hero` |
| **Content engine** — 20–40 pieces/week, launch engine T‑14 … D+7, top content visible | Content OS: calendar, pipeline (Idea → … → Published), metrics; weekly target with pacing; publishing consistency | `content`, `content_metrics`, `targets.weekly_content`, `/content` |
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
               ├─ content ─ content_metrics ; creators ─ creator_content
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
| **6 Intelligence** | Attention rules, business health, notifications fan‑out (cron), global search, audit log screen | rules engine ✔ (incl. the three stall rules below) · dismissals ✔ · triggers ✔ · global search ✔ and notifications *read/mark-read* UI ✔ (both 2026-09-14, see §0) · notifications fan-out (the cron that would actually populate the table) and the audit log screen: still next |
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
