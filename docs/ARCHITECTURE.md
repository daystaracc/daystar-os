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

| Phase | Scope | Status in this package |
|---|---|---|
| **1 Foundation** | design tokens, auth (email/password, reset, persistent sessions, logout), schema, RLS, seed, app shell (sidebar, top bar, language switch), command palette | Tokens ✔ · schema ✔ · RLS ✔ · seed ✔ · calc layer ✔ (tested) · i18n ✔ (tested) · auth + shell + middleware written (not yet run) · ⌘K palette: next |
| **2 Core OS** | Command Center, Goals/OKR, Projects, Tasks (My Tasks, list, kanban, calendar, recurring), 100M Journey | Command Center page + data layer + components written; task actions (create / status / complete‑with‑recurrence) written · rest: next |
| **3 Commerce** | Revenue (entry, charts), Products, Hero Products, Inventory (movements, counts, ABC, alerts) | schema + calculations ready · screens: next |
| **4 Growth** | Content OS (calendar, pipeline, library, metrics), Marketing (campaigns, paid, creators), CRM | schema + calculations ready · screens: next |
| **5 Operations** | Operations, Finance (management P&L), Team, Reviews (WBR/MBR), SOPs | schema ready · screens: next |
| **6 Intelligence** | Attention rules ✔, business health, notifications fan‑out (cron), global search, audit log screen | rules engine + dismissals ✔ · triggers ✔ · UI: next |
| **7 Polish** | mobile bottom nav, animations, performance, accessibility pass, empty/error states, CSV import wizard | next |

**First usable version** (spec §67) = Phase 1 + 2 + Products/Hero/Inventory + Content calendar + Business health + Weekly review + basic Finance + Team. Build order inside Claude Code: `npm run typecheck` green → login → Overview renders seed → Tasks → Projects → Goals/Journey → Products/Inventory → Content calendar → Health → Reviews → Finance → Team.

**Verification checklist before calling a screen done** (spec §64): auth · persistence · CRUD · task completion · assignment · project progress · goal calculations · revenue pacing · inventory movements · content calendar · charts from database data · filters · search · permissions (test as Alexander) · responsive · loading · empty · error.

---

## 10. Integrations and the future copilot

All external data enters through the same tables manual entry uses (`sales_daily`, `product_sales_daily`, `ad_spend_daily`, `content_metrics`, `customers`). Adapters live in `src/lib/integrations/<source>/` (planned: DAYSTAR website / Shopline, Shopee, Meta, TikTok, GA4, LINE, email, accounting) and never touch UI code; a nightly job upserts rows, and the dashboard does not know or care where a row came from. CSV import follows the same path (upload → preview → map → validate → import → results; invalid rows are never written silently).

Because every fact is structured (targets, pacing, rules, activity, reviews), the future **DAYSTAR AI** can answer "why are we behind target?" from the same snapshot the Command Center renders — no chatbot is built now.

---

## 11. Open decisions (confirm before Phase 2 continues)

1. Accounts: KAi and Lucas as founders, Alexander as member — correct? Real emails to replace the demo ones.
2. September target: seeded NT$1,000,000 (Stage 1 door). Keep, or start from a nearer number (e.g. NT$850,000)?
3. Revenue channels: Website + Shopee confirmed; "Other" = markets/pop‑ups?
4. Which five products are the Hero candidates today (seed marks Tennis Bracelet, Tennis Chain, Cuban Ring, Cross)?
5. Default language zh‑Hant for everyone, with KAi on English — confirm.
6. Weekly review day (seed assumes Monday) and the 20:00 publishing routine owner.
