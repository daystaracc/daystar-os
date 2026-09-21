# DAYSTAR OS

Business Operating System for DAYSTAR. Next.js 15 · React 19 · TypeScript · Tailwind 3 · shadcn/ui · Supabase (Postgres, Auth, RLS). Bilingual English ↔ 繁體中文.

**Live:** https://daystar-os.vercel.app — Vercel project `daystar-os`, scope `daystar3`.

> **Picking this up cold?** Read **[`docs/ARCHITECTURE.md` §0 "Current state"](docs/ARCHITECTURE.md)**
> first. It says what is built, which data is real and which is still seed, which
> migrations have not been run, and what to do next. Sections 1–10 are the product
> spec; §0 is where the build actually is.

## Running locally

```bash
npm install
cp .env.example .env.local   # then fill in the values below
npm run dev                  # http://localhost:3000
```

| Variable | Needed for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | every request — ships to the browser |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | every request — ships to the browser |
| `NEXT_PUBLIC_SITE_URL` | password-reset email links (set to the deployed origin) |
| `SUPABASE_PROJECT_ID` | `npm run db:types` only |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only admin client — **not used by any screen yet** |

Demo logins — `kaistarkai77@gmail.com` (founder) · `dtyangtony@gmail.com` (member) ·
password `daystar2026`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | dev server |
| `npm run build` | production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run test:calc` | calculations + i18n + import parser (**74 tests**) |
| `npm run db:types` | regenerate `src/types/database.ts` from the live schema |

`test:calc` is the only automated gate. Keep it green.

## Database

Run in the Supabase SQL editor, in order:

```
supabase/migrations/0001_schema.sql
supabase/migrations/0002_rls.sql
supabase/migrations/0003_fix_system_score_trigger.sql
supabase/migrations/0004_fix_tasks_update_recursion.sql
supabase/migrations/0005_products_cost_nullable.sql
supabase/migrations/0006_variant_level_stock.sql
supabase/migrations/0007_external_ids.sql
supabase/seed.sql
```

**0005, 0006 and 0007 are applied to the live project (verified 2026-09-11).** The
product import is unblocked at the schema level; it's still waiting on the real
Showmore product-export CSV file. See ARCHITECTURE §0.

`0001` already contains everything `0005`–`0007` add, so a **fresh** database gets
variant-grain stock and a nullable `products.cost` from `0001` alone. Both migrations
are guarded (`if exists` / `if not exists`) and safe to run twice — the live project was
created before them, so there they are still required.

Roles are enforced by row-level security, not by the UI: founder · manager · member.
`src/lib/permissions.ts` mirrors the policies so the interface can disable what the
database would refuse anyway.

## What is built

| Module | State |
|---|---|
| Auth, app shell, i18n, design tokens | done |
| Command Center `/overview` | done |
| My Work `/my-work` | done |
| Tasks `/tasks` — list · kanban · calendar | done |
| Revenue `/revenue` + `/revenue/import` | **live-verified 2026-09-15** — KPI cards, period switcher, table, add/edit/delete drawer for manual `sales_daily` entries, plus a Showmore order-export import wizard. The real order history (6,772 orders, April 2025–September 2026) has been imported against Lucas's live database; numbers matched the pre-approved preview exactly. Two real bugs surfaced and were fixed along the way — see ARCHITECTURE §0. |
| Projects `/projects` | **typechecks clean** (zero errors) — list with health/status/progress, detail page with linked tasks and member management, create/edit drawer. Built to match the RLS actually deployed (full-org read, manager+ write, founder-only delete) rather than the spec's narrower "member: own" — see ARCHITECTURE §0. |
| Goals `/goals` | **typechecks clean** (zero errors) — the OKR hierarchy (goals → objectives → key results), grouped by level, with an inline control to log a key result's current value without opening the full edit drawer. Same RLS pattern as Projects. See ARCHITECTURE §0. |
| Products `/products` | **live-verified 2026-09-14** — catalogue list with stock status and margin, detail page with variants and per-variant stock counting (open to any team member, not just managers — see ARCHITECTURE §0). The real product export has been imported against the live database (102 products, 321 variants, 3,512 units on hand), and Inventory reflects the same real rows. |
| Inventory `/inventory` | **typechecks clean (2026-09-14 full run)** — not yet click-tested — read-only dashboard: total stock valuation, a stock-status breakdown (critical/low/ok/overstock/dead, plus a separate "no sales data yet" bucket so unknown velocity is never shown as dead stock), and a reorder-needed list linking into Products. No writes — stock is still only counted from the Products detail page. See ARCHITECTURE §0. |
| Operations `/operations` | **new 2026-09-21** — closes a real gap Lucas found by clicking it: the nav entry and both backing tables have existed since the app's first migration, but no route was ever built, so it 404'd for the whole session until now. Daily log (`operations_daily`, one row per day, upsert-by-date) and CS cases (`customer_service_cases`, full create/edit/delete with a status workflow) in one tabbed screen — the `?tab=cs` link the Command Center's attention rules already pointed at now resolves. Open to any active member for read; creating/editing is manager-or-above, deleting is founder-only, matching RLS. See ARCHITECTURE §0. |
| Content `/content` | **typechecks clean (2026-09-14 full run)** — not yet click-tested — a flat list of content pieces sorted by pipeline stage (idea → … → published), a weekly publishing-pace card, and create/edit/delete. Deliberately not the full calendar/drag-drop kanban the spec describes (see ARCHITECTURE §0); RLS lets any member create content but only managers, or a piece's own owner/creator, edit it. |
| Company health `/company/health` | **typechecks clean (2026-09-14 full run)** — not yet click-tested — closes a real gap: the Command Center has linked to this page all session, but it 404'd until now. Scorecard for the 11 fixed business systems (score, owner, bottleneck, next action, score history); edit-only, no create/delete since the systems are fixed seeded rows. All the score-tracking logic is a database trigger, not app code — see ARCHITECTURE §0. |
| SOPs `/sops` | **typechecks clean (2026-09-14 full run)** — not yet click-tested — a document library across 11 fixed categories, with a list, a real detail page per SOP, and an edit drawer. `version` has no database trigger behind it (unlike Company Health) — the app bumps it by hand only when the procedure text itself changes. No markdown renderer exists in this project, so procedures show as plain preformatted text, not rendered markdown. |
| Reviews `/reviews` | **typechecks clean (2026-09-14 full run)** — not yet click-tested — weekly/monthly business reviews (WBR/MBR): create one for a period (the drawer suggests the most recently completed week or month), write wins/problems/decisions/priorities, mark complete or reopen, and log metrics by hand grouped into the spec's seven sections. Gated to founder/manager in-app even though the underlying `reviews` table's RLS is more permissive — see `docs/ARCHITECTURE.md` for why. Automatic metric pre-fill from other domains was deliberately not built — deciding which numbers belong is a real product decision, not one to invent unattended. |
| Marketing `/marketing` | **typechecks clean (2026-09-14 full run)** — not yet click-tested — Campaigns, Ad spend, and Creators in one tabbed screen. Campaign daily metrics roll up to a revenue/spend/ROAS total; ad spend gets real ROAS/CAC/CPM/CTR/CPC/CVR over a rolling 90-day window (MER is deliberately left blank — it needs Revenue's total-store-revenue figure, a reasonable follow-up); creators get a roster plus a manual content/sales log. Gated to founder/manager in-app since `ad_spend_daily` and the campaign/creator metrics tables need manager-or-above even to read — see `docs/ARCHITECTURE.md` for the full RLS breakdown. |
| CRM `/crm` | **live-verified 2026-09-15** — Flows, Monthly metrics, and Customers in one tabbed screen. Flows cover the 12 fixed automation keys (welcome, abandoned cart, winback, etc.) with create-for-any-unused-key rather than edit-only; monthly metrics are a fully manual upsert-by-month log; Customers is populated automatically by the `/revenue/import` wizard — phone numbers are hashed (HMAC-SHA256, server-only salt) and never stored — and now holds **5,404 real customers** from Lucas's full order history, with pagination and a name/email/phone search box (the earlier flat top-200-by-spend view silently hid everyone past #200 once real data landed). Gated founder-only in-app, matching `customers_all` RLS being founder-only for every operation. See `docs/ARCHITECTURE.md` for the full breakdown, including the phone/email PII decision still open for Lucas. |
| Settings `/settings` | **new 2026-09-15** — a minimal, read-only hub: organization name/slug/created-at, and a card linking to the product/order import. Didn't exist before today — the sidebar has linked here since the nav was built, but nothing rendered at `/settings` itself, only `/settings/import`, so it 404'd for every founder until this was found and fixed. See `docs/ARCHITECTURE.md`. |
| Finance `/finance` | **typechecks clean (2026-09-14 full run)** — not yet click-tested — Monthly P&L and Expenses in one tabbed screen. Monthly P&L is a manual upsert-by-month log (revenue, COGS, cash, inventory value up front; the full contribution-margin waterfall — payment fees/shipping/packaging/ads/returns/opex — under Advanced) run through the already-tested `contributionMargin()`; Expenses is a real create/edit/delete log over a rolling 90-day window with a free-text category (the database puts no fixed list on it). Gated founder-only in-app — the one screen this session where the gate needed no new code: `can.viewFinance` already existed from an earlier session and already matches `financial_monthly`/`expenses` RLS exactly. See `docs/ARCHITECTURE.md` for the full breakdown. |
| Team `/team` | **typechecks clean (2026-09-14 full run)** — not yet click-tested — a directory of every active member with role, title, department, manager and status, plus a live count of each person's open and overdue tasks ("who is loaded"). Edit-only (no create/delete — members come from real sign-ups, not typed rows), and the one screen this session open to **every** role for read, matching the spec's own permission matrix; only founders see the edit control, and a founder can't demote themselves out of the role through the form. Department management (create/edit/delete) was deliberately left unbuilt — this screen reads whatever departments already exist but doesn't manage them. See `docs/ARCHITECTURE.md` for the full breakdown. |
| Global search `⌘K` | **typechecks clean (2026-09-14 full run)** — not yet click-tested — built 2026-09-14. The top bar's search button and `⌘K` used to fire an event nothing listened to; `components/layout/CommandPalette.tsx` now listens for it and shows the full sidebar nav (filtered by role, `lib/nav.ts`) plus live results from `lib/search/actions.ts` across tasks/projects/goals/products/content/SOPs as you type. See `docs/ARCHITECTURE.md`. |
| Notifications `/notifications` | **typechecks clean (2026-09-14 full run)** — not yet click-tested — built 2026-09-14, closes the bell icon's dead link. Unread/All tabs, optimistic mark-as-read, and a real unread-count badge on the bell. The `notifications` table still has no way to populate itself (no fan-out/cron writing rows yet), so expect it to show empty until that's built — the read/write path itself is finished. See `docs/ARCHITECTURE.md`. |

**Every screen in the sidebar now resolves, and both top-bar controls (search, notifications) go somewhere real.** This was first believed true as of 2026-09-15 (when the dead `/settings` link was fixed), but that was wrong — Operations was still 404ing and wasn't caught until Lucas clicked it himself on 2026-09-21. It's fixed now (see above); no other screen has turned up 404ing since.

## Conventions

- Business math lives only in `src/lib/calculations` and is tested. Screens assemble
  data in `src/lib/data/*` (server) and render in `src/components/*`.
- Every changing business value is database data; **every target is a `targets` row**.
- Inventory changes only through `inventory_movements` (append-only audit trail).
- New user-facing text goes into **both** `src/lib/i18n/en.ts` and `zh-Hant.ts` —
  the i18n test fails on any key present in one and not the other.
- Bilingual data columns (`name_zh`, `title_zh`) are read through `localizedField()`.
  DAYSTAR's product names stay English on purpose; `products.name_zh` is deliberately
  NULL.
- A cost of `null` means **unknown**, never zero. `productMarginPct()` returns null
  and `inventoryValuation()` reports what it could not value, so nothing shows a
  fabricated 100% margin.
- Design tokens only — no new colours, radii or shadows in components.
- No fake buttons, filters, charts or search.

## Gotchas that have already cost time

- A `'use server'` module may export **only async functions** — a const array or a
  sync helper breaks the route at runtime, not at typecheck.
- postgrest-js types results from the **select string literal**; building it with `+`
  widens it to `string` and every column becomes `never`.
- A Server Component cannot pass a **function** as a prop to a Client Component.
- Grid items default to `min-width: auto`; with `truncate` that makes tracks as wide
  as the untruncated text and forces horizontal page scroll. Use `min-w-0`.
- **Vercel refuses to build commits authored by another email** on a Hobby plan.
  Commits must be authored `325529981+daystaracc@users.noreply.github.com` (set
  repo-locally). Symptom: deployment stuck at `UNKNOWN`, 0 ms build, no logs.
- Node, `gh` and `vercel` are on the machine PATH, but a shell started before they
  were installed will not see them. Prefix with `C:\Program Files\nodejs`,
  `C:\Program Files\GitHub CLI`, `%APPDATA%\npm`.
- **Showmore's product CSV is malformed** — unescaped `"` inside quoted product names.
  A conformant parser silently recovers only 53 of 320 rows. A tolerant parser is
  required; see ARCHITECTURE §0.
