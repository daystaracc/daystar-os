# DAYSTAR OS — run & test guide (updated 2026-09-15)

**Update, 2026-09-15: this has now run for real.** `npm run typecheck` is clean,
the app has run against the live Next.js dev server and Lucas's real Supabase
database, and both the product import (102 products) and the full order-history
import (6,772 orders, 5,404 customers) have completed successfully against real
data — see §5 and the CRM section in §4. Two real bugs surfaced along the way and
are already fixed (§6). The rest of this guide (most screens below) is still an
unclicked, code-level review — this section's status applies specifically to
Revenue, Products, Inventory, CRM, and Settings; work through the remaining
screens the same way.

**Update, 2026-09-16:** the code-level review pass (permissions vs. actual RLS,
edge cases, dead links) is now complete for every screen in the app, including
the last two — Global search (⌘K) and Notifications — which came back clean
(one cosmetic nitpick in a search-escaping helper, not a real bug; see
`docs/ARCHITECTURE.md`). Nothing here has been click-tested yet except what's
listed above — that's what `TOMORROW_2HR_GUIDE.md` walks through.

**Update, 2026-09-16 (later):** big find — this whole build had never been
committed to git before today. Lucas committed everything (`c96460c`), but
the `git push` that should have deployed it to daystar-os.vercel.app didn't
finish before he had to step away — see the dated note in `docs/ARCHITECTURE.md`
§0 for the full story and what to try next. **Until that push actually
completes, the live site is not current** — anyone testing should use
`npm run dev` locally, not the Vercel URL, until this is confirmed resolved.
Also: the customer-email decision Lucas asked about is resolved and built
(email captured from imports going forward, phone stays hash-only) — see the
same section.

Work through it in order. Section 6 is the running list of everything already
known to be missing or deliberately deferred — check there before filing
something as a new bug.

---

## 0. Before you start

- **Accounts:** `kaistarkai77@gmail.com` (KAi, founder), `lucasmccollister@gmail.com`
  (Lucas, founder), `dtyangtony@gmail.com` (Alexander, member) — password
  `daystar2026` for all three.
- **There is no manager-role account.** Every screen this session has different
  behavior for founder / manager / member, and manager is completely untested.
  Once you've confirmed the new Team screen works (step 5 below), use it to
  temporarily set Alexander's role to `manager`, test with his login, then set him
  back to `member` — that's the only way to exercise the manager path today.
- **Live site:** https://daystar-os.vercel.app · repo `daystaracc/daystar-os`
  (private) · Vercel project `daystar-os`, scope `daystar3`.
- Node/`gh`/`vercel` are on your machine's PATH but a shell opened before they were
  installed won't see them — if a command isn't found, open a fresh terminal.
- Commits must be authored as `325529981+daystaracc@users.noreply.github.com` —
  Vercel's Hobby plan silently refuses to build commits from any other email
  (symptom: a deploy stuck at "UNKNOWN" with a 0ms build, no error shown).
- **Two things need to happen before customer import works** (new 2026-09-14,
  see CRM section below): run migration `supabase/migrations/0008_customer_phone_hash.sql`
  against the live database, and set `CUSTOMER_PHONE_HASH_SALT` (any long
  random secret string) in both your local `.env` and Vercel's project
  settings. Without the env var, the import fails with a clear message naming
  it rather than doing anything partial — so if you forget this step, you'll
  know immediately rather than getting silently wrong data.

## 1. Typecheck first — do not skip

```
npm run typecheck
```

Every screen built since 2026-09-13 (Products, Inventory, Content, Company
Health, SOPs, Reviews, Marketing, CRM, Finance, Team) has **never** been through
this. Expect real errors — the last time you ran it (on Revenue/Projects/Goals)
it found 2, both the same class of mistake (a helper's type said a field was
optional when the code required it). Likely failure modes to look for first:

- A Supabase join-shape mismatch — `postgrest-js` infers types from the exact
  select-string literal; if a query string was mistyped, a field silently types as
  `never` instead of erroring where you'd expect.
- A `'use server'` actions file exporting something that isn't an async function
  (a stray const or sync helper) — breaks at runtime, not typecheck, so this
  won't show here but will show as a crash when you click the action.
- Passing a function (rather than a plain value) as a prop from a server
  component into a client component — also a runtime crash, not a typecheck
  catch, watch for it in step 4 and 5's drawers.

Fix errors, re-run until clean, **then** move to step 2. Don't click-test on top
of a red typecheck — you won't be able to tell a real bug from a type mismatch.

## 2. Start the app

```
npm run dev
```

Log in as `kaistarkai77@gmail.com` / `daystar2026` (founder) first — founders see
every screen, so this is the fastest way to confirm nothing is globally broken
before testing role restrictions.

**First-look checks**, before touching individual screens:

- [ ] Login redirects to `/overview` for founder/manager, `/my-work` for member.
- [ ] Sidebar renders with every group (Command Center / Plan / Grow / Operate /
      Company / System) and **no link 404s** — this is the headline claim from
      the last session: every sidebar link now resolves. Click every single one
      once, logged in as founder, just to confirm the page loads (content
      correctness comes later).
- [ ] Language switch (EN ↔ 繁中) flips the whole UI live, no reload needed.
- [ ] No horizontal scroll at 390px or 360px width (resize the window or use
      device emulation) — this was verified for the original screens but never
      re-checked for anything built 2026-09-13.

## 3. Role-gating pass (do this before deep-testing any one screen)

Log out, log back in as each account, and confirm the sidebar itself hides what
it should — a role that can't see a screen shouldn't see its nav link at all,
and hitting the URL directly should redirect, not show a broken page.

| Screen | Founder | Manager | Member | Notes |
|---|---|---|---|---|
| Overview | ✓ | ✓ | → `/my-work` | |
| Revenue | ✓ | ✓ | redirect | |
| Reviews | ✓ | ✓ | redirect | app-level gate, DB itself is more permissive — see §0 note in ARCHITECTURE.md |
| Marketing | ✓ | ✓ | redirect | same reasoning as Reviews |
| CRM | ✓ | redirect | redirect | **founder-only**, strictest gate in the app |
| Finance | ✓ | redirect | redirect | **founder-only** |
| Team | ✓ | ✓ | ✓ (read only) | only screen open to everyone; only founder sees the edit pencil |
| Products/Inventory/Goals/Projects/SOPs | ✓ | ✓ | read-only | member sees it but can't create/edit |
| Content | ✓ | ✓ | ✓ (create + edit own) | member can create; can only edit pieces they own/created |
| Tasks | ✓ | ✓ | ✓ | member edits own/assigned/created only |

For every "redirect" cell: log in as that role, type the URL directly
(e.g. `/crm` as the member account) and confirm you land on `/my-work` (or
wherever) rather than seeing an error page or a half-loaded screen.

## 4. Screen-by-screen test script

Test as **founder** first for full coverage, then repeat the create/edit/delete
actions as **manager** (temporarily promote Alexander per §0) and **member**
where the table above says they have access, to confirm the UI actually disables
what RLS would refuse anyway.

### Revenue (`/revenue`, `/revenue/import`)
- [ ] KPI cards load for the current month; switch period presets (7d/30d/month/
      quarter/year) and confirm the table and KPIs update together.
- [ ] Add a manual revenue entry, edit it, delete it — confirm the table and
      totals recompute each time.
- [ ] `/revenue/import`: upload a Showmore order CSV, confirm the preview shows
      new/changed/unchanged counts before you click Confirm, and that nothing
      writes until you do.
- [ ] Known real bugs already fixed here (payment_fees/type mismatch) — just
      confirm typecheck is clean; no further action needed.
- [ ] **New 2026-09-14 — customer import.** The same file upload now also
      shows a "Customers in this file" card in the preview (count, repeat
      customers, total spent) before you click Confirm. Confirm both the
      revenue outcome card *and* a separate customer outcome card appear
      after you click Confirm. If `CUSTOMER_PHONE_HASH_SALT` isn't set yet
      (§0), expect the customer card to show a clear failure message — that's
      correct behavior, not a bug. Once the env var and migration `0008` are
      both in place, confirm `/crm`'s Customers tab (§4 below) actually
      populates after this import.
- [ ] **Upload your complete order history here, not just recent orders** —
      each import fully replaces a customer's lifetime totals keyed by their
      hashed phone number, so a partial file will understate existing
      customers' totals rather than add to them.

### Projects (`/projects`)
- [ ] List shows health/status/progress; open a project's detail page.
- [ ] Add/remove a member on a project; create/edit/delete a project.
- [ ] Confirm a **member** account can see every org project (not just their
      own) — this was a deliberate deviation from the spec's narrower "member:
      own" language, matching the RLS actually deployed. If a member sees fewer
      projects than a founder, that's a real bug, not expected behavior.

### Goals (`/goals`)
- [ ] Grouped list by level (company/annual/quarterly/monthly) renders.
- [ ] Open a goal's detail page; the three stacked drawers each work:
      `?edit=1` (the goal itself), `?newObjective=1`/`?editObjective=<id>`, and
      `?newKr=<objectiveId>`/`?editKr=<id>`. Click through all five — this was
      flagged as the single most likely place for a query-param bug.
- [ ] Use the inline "update current value" control on a key result (not the
      full edit drawer) — confirm it updates only the number, nothing else.

### Products (`/products`)
- [ ] List shows tier/status/stock/margin; open a product detail page with
      variants.
- [ ] **As a member**, confirm you can log a stock count on a variant — this is
      the one screen where any active member (not just manager+) can write,
      matching "fulfillment staff adjust stock" in the DB comments. If a member
      can't do this, that's a real bug.
- [ ] Enter the same count twice in a row — the second save should write
      nothing (a no-op), since only the *difference* from current stock is
      recorded.
- [ ] Create/edit/delete a product as founder/manager; confirm member cannot.

### Inventory (`/inventory`)
- [ ] Read-only dashboard: valuation, stock-status breakdown, reorder list.
      No create/edit here at all — only check that the numbers look internally
      consistent (e.g. the reorder list only contains critical/low items).
- [ ] Confirm products with **no sales data at all** show a separate "unknown/no
      data" bucket, not lumped into "dead stock" — this was the one subtle bug
      risk flagged on this screen. Given seeded demo data, expect the specific
      numbers to look wrong until the real product import runs (§7).

### Content (`/content`)
- [ ] Flat list sorted by pipeline stage; advance a piece's status via the
      inline `<select>`.
- [ ] As **member**: create a new content idea (should work), try editing a
      piece you don't own/didn't create (should be blocked in the UI).
- [ ] As **manager/founder**: edit any piece regardless of owner; delete
      (member should not be able to delete at all).
- [ ] Edit a piece and change only one field (e.g. the hook) — confirm the
      other fields (talent, concept, url, notes) aren't silently blanked. This
      was flagged as the one place a save could wipe data it shouldn't touch.
- [ ] Confirmed **not built**: the calendar/kanban view from the spec — this is
      a flat list only, by design (§6).

### Company Health (`/company/health`)
- [ ] Reached from the Command Center's "Business health" section — click
      through from there once, then also hit `/company/health` directly.
- [ ] Score a system 1–5, confirm `status` and the history dots update
      automatically (this is a database trigger, not app code — if it doesn't
      update, the trigger itself may not be applied).
- [ ] No create/delete controls should exist — the 11 systems are fixed rows.

### SOPs (`/sops`)
- [ ] List filterable by the 11 categories; open a real detail page per SOP.
- [ ] Edit only the title (not the procedure text) — confirm `version` does
      **not** increment. Edit the procedure text itself — confirm `version`
      **does** increment. This is hand-coded (no DB trigger), so it's the one
      place most likely to be wrong.
- [ ] Procedure text renders as plain preformatted text — raw `#`/`-` markdown
      characters showing literally is expected, not a bug (no markdown renderer
      is installed — see §6).

### Reviews (`/reviews`)
- [ ] Create a weekly review — confirm the drawer suggests the most recently
      *completed* Mon–Sun week, not the current in-progress one. Same check for
      a monthly review (most recently completed calendar month).
- [ ] Write wins/problems/decisions/priorities, save, reopen the review, edit
      again.
- [ ] Mark complete — confirm `completed_at` is stamped; reopen — confirm it
      doesn't get re-stamped/cleared oddly.
- [ ] Add a metric by hand under one of the seven sections, then add the same
      metric for a later period with a "previous value" — confirm the %
      delta calculates and displays correctly.
- [ ] Confirmed **not built**: automatic metric pre-fill from other screens —
      every number here is manual entry today, by design (§6).

### Marketing (`/marketing`)
- [ ] Three tabs: Campaigns / Ad spend / Creators (`?tab=`). Confirm the tab
      state survives a page reload (it's in the URL).
- [ ] **Campaigns:** create one, log a daily metric against it, confirm ROAS
      shows on the campaign (and shows `—`, not `0` or a crash, when spend is 0).
- [ ] **Ad spend:** log an entry, confirm ROAS/CAC/CPM/CTR/CPC/CVR compute for
      real over the visible rolling-90-day window; confirm **MER is blank**, not
      a wrong number — this is deliberately unbuilt (§6).
- [ ] **Creators:** create one, log a piece of content against them (products
      sent, link, views, sales).
- [ ] Confirm the `EntityActions` edit/delete controls on a campaign/creator
      detail page actually work — this component had a real bug (an illegal
      closure passed across the server/client boundary) that was caught and
      fixed before shipping, but it's never been run for real.

### CRM (`/crm`)
- [ ] Three tabs: Flows / Monthly metrics / Customers.
- [ ] **Flows:** create a flow for one of the 12 unused keys — confirm once
      created, the key becomes a fixed label (not editable) in the edit drawer.
      Create flows for all 12 keys, confirm the "create" option then correctly
      shows "all 12 already exist" instead of an empty dropdown.
- [ ] **Monthly metrics:** add a month, edit it, confirm saving replaces that
      month's numbers rather than adding a second row for the same month.
- [ ] **Customers:** populated by the `/revenue/import` wizard (see the Revenue
      section above) — **live-verified 2026-09-15** against Lucas's real order
      history (5,404 customers, 924 repeat, matching the import preview
      exactly). Before you've run that import, or if the env var isn't set
      yet, it's still correct for this to show an honest "no customers yet"
      message, not an error or a blank crash.
- [ ] **2026-09-15: search + pagination.** The list used to hard-cap at the
      top 200 customers by spend and silently hide everyone else — with real
      data (thousands of rows) that hid the vast majority. Now paginated (50
      per page) with a search box (name/email/phone). Confirm: the page
      shows "Showing 1–50 of N," the search box filters live on submit, Next/
      Prev move through pages, and a search with no matches shows an honest
      "no customers match" message rather than an error.
- [ ] Spot-check: the list is ordered by lifetime spend, a repeat customer's
      order count is 2+, and no real phone number appears anywhere on screen
      unless someone entered one by hand (the import itself only ever writes
      a hash — see the PII decision flagged in `docs/ARCHITECTURE.md` §0 if
      Lucas has since decided to capture real contact info).
- [ ] Confirm **member and manager** accounts cannot reach `/crm` at all
      (redirect), even though `crm_flows`/`crm_metrics_monthly` RLS would
      technically let a member read them — the app gate is intentionally
      stricter here.

### Finance (`/finance`)
- [ ] Two tabs: Monthly P&L / Expenses.
- [ ] **Monthly P&L:** add a month with revenue/COGS/cash/inventory value
      visible up front; open Advanced and fill in payment fees/shipping/
      packaging/advertising/returns/opex. Confirm gross margin % and
      contribution margin shown in the list match hand math:
      `contribution = revenue − cogs − fees − shipping − packaging − ads − returns`.
- [ ] Save the same month again with different numbers — confirm it replaces,
      not adds.
- [ ] **Expenses:** add a few expenses with different free-text categories
      (there's no fixed category list — type whatever you want), confirm the
      90-day running total at the top matches the sum of what's listed.
- [ ] Confirm **only founder** can reach `/finance` — manager and member should
      both redirect.

### Team (`/team`)
- [ ] Directory lists every active member with role/title/department/manager/
      status and a live open/overdue task count.
- [ ] Log in as **manager or member** — confirm you can see the whole list
      (this is the one screen open to everyone) but there's **no edit pencil**.
- [ ] As **founder**, edit a member: change title, department, status. Confirm
      the manager/start-date fields are under "Advanced options."
- [ ] Try to change **your own** role away from founder — the role dropdown
      should be disabled on your own row, with an explanatory note. (If you
      have two founder accounts, confirm founder A *can* change founder B's
      role — the lock is specifically "not yourself," not "no one.")
- [ ] Confirm there's no way to add or remove a team member from this screen —
      that's expected; membership comes from real sign-ups only (§6).

### My Work / Tasks
- [ ] Already verified in an earlier session — spot-check only: kanban drag-
      drop persists, inline status change persists, completing a recurring
      task spawns exactly one next occurrence.

### Global search (⌘K) — new 2026-09-14
- [ ] Press ⌘K (or Ctrl+K on Windows) anywhere in the app, and separately click
      the search bar in the top bar — both should open the same modal.
- [ ] With the query empty, confirm it shows every sidebar link your current
      role can see (same set as the sidebar itself) — this is a quick-jump
      list, not just a search box.
- [ ] Type a nav label (e.g. "revenue") — confirm the nav list filters live.
- [ ] Type 2+ characters that match a real task/project/goal/product/content
      piece/SOP title — confirm a "Results" section appears below Navigation
      within about a second, and clicking (or arrow-key + Enter) navigates to
      the right place: a task opens `/tasks?task=<id>` (the detail panel),
      a project/goal/product/SOP opens its own `/​<type>/<id>` page, content
      opens `/content?edit=<id>` (the edit drawer).
- [ ] Type something that matches nothing — confirm an honest "no results"
      message, not a blank panel or a crash.
- [ ] Esc closes it; clicking outside the modal closes it.
- [ ] As **member**, confirm founder/manager-only nav items (Revenue, Finance,
      CRM, Marketing) do **not** appear in the nav results — same role
      filtering as the sidebar.

### Notifications — new 2026-09-14
- [ ] Click the bell icon in the top bar — confirm it now opens `/notifications`
      instead of 404ing.
- [ ] **Expect this to be empty right now** — nothing in the app writes a
      notification row yet (§6); that's expected, not a bug. Confirm it shows
      an honest empty state, not an error.
- [ ] The bell icon itself should show **no badge** while there are zero
      unread notifications. If you (or a later feature) ever insert a test
      row directly in Supabase with `read_at` null, confirm: the badge count
      appears on the bell, the row appears under the "Unread" tab, clicking
      "Mark as read" (or "Mark all as read") removes it from Unread but keeps
      it visible under "All," and the badge count updates without a page
      reload.

## 5. Settings (`/settings`, `/settings/import`)

### Settings landing page — new 2026-09-15
- [ ] **This page did not exist until today.** `lib/nav.ts` has linked the
      sidebar's "Settings" item to `/settings` since the nav was built, but
      only `/settings/import` ever had a `page.tsx` — clicking "Settings"
      404'd for every founder, the whole session, and nobody had clicked it
      yet to notice. Found the same way search/notifications' dead links were
      found earlier: auditing every nav target for a matching page.
- [ ] Log in as **founder** — confirm `/settings` now shows an Organization
      card (name/slug/member-since) and a "Data & imports" card linking to
      `/settings/import`.
- [ ] Log in as **manager or member** — confirm both redirect away from
      `/settings` (same `can.viewSettings`, founder-only, as Finance/CRM).
- [ ] This is intentionally read-only for now — there's no edit form.
      `organizations.currency`/`.timezone` exist in the schema but nothing in
      the app reads them yet (revenue formatting is hardcoded to TWD), so
      they're deliberately not exposed as editable fields that would look
      functional but do nothing.

### Product import (`/settings/import`)

Already live-verified 2026-09-14 against Lucas's real Showmore product
export:

1. Log in as founder or manager.
2. Go to `/settings/import`, upload the real Showmore product export
   (商品管理 → 匯出).
3. Confirm the preview shows **102 products, 321 variants, 3,512 units on
   hand, 115 costed / 206 uncosted, 0 warnings** — this exact count was
   already verified by the parser outside the database, and matched exactly
   on the live import.
4. **Nothing should write until you click Confirm.** After confirming, spot
   check: SKUs generated as `DS-0001`…`DS-0102`; re-running the same import a
   second time should update, not duplicate (Showmore's own product/variant
   ids are stored for this).
5. Products and Inventory now reflect this real catalogue — checked at the
   code level 2026-09-15 (neither screen has a cap or seed-data assumption
   that would hide real rows), matching what Lucas already saw live.

**2026-09-15: full code-level review of every remaining screen, clean.** With
the live-data bugs found and fixed (§ above), every screen still marked
"typechecks clean, not yet click-tested" — Goals, Projects, Content, Company
Health, SOPs, Reviews, Marketing, Finance, Team — was read end-to-end (data
layer + actions, not just skimmed) specifically hunting for the same bug
classes already found tonight: role-gating mismatches against actual RLS,
stale caps/assumptions from when a table was empty, calculation errors, and
edge cases in create/edit/delete. Nothing new turned up — every `canEdit`/
`canDelete` flag matches its table's real RLS policy exactly, every rollup/
average has the zero-denominator guard the rest of this app is built around,
and the self-demotion guard on Team is enforced server-side, not just in the
UI. This doesn't replace clicking through them for real — it's the strongest
check possible without a live browser, and it came back clean.

## 6. Known gaps — check here before filing a "bug"

These are deliberate, already-documented scope decisions, not oversights.
Full reasoning for each is in `docs/ARCHITECTURE.md` (search for the screen
name).

- **No manager test account exists.** Use Team to temporarily promote/demote
  Alexander (§0) rather than filing this as a data bug.
- **CRM → Customers import: done and live-verified 2026-09-15.** Migration
  `0008` (and its follow-up `0009` — see below) are both run, the env var is
  set, and the real order history is imported (5,404 customers). No longer a
  gap.
- **Two real bugs found and fixed during the first live import (2026-09-15),
  both worth knowing about even though they're already fixed:**
  1. The order-history file was large enough to exceed the server action body
     size limit (`next.config.ts` — raised from 2mb to 15mb).
  2. The customers upsert failed with *"no unique or exclusion constraint
     matching the ON CONFLICT specification"* — `0008`'s unique index was
     partial (`where phone_hash is not null`), which Supabase's plain
     `.upsert(..., { onConflict })` can't target. Migration `0009` replaces it
     with a non-partial index. If you ever see this exact error again on a
     fresh database, confirm `0009` was run, not just `0008`.
- **Decision needed from Lucas: raw phone/email storage for customers.**
  Flagged 2026-09-15 in `docs/ARCHITECTURE.md` §0 — not built, on purpose.
  Lucas asked for "full info, emails phone number etc." on the Customers
  screen, which conflicts with the deliberate hash-only design approved a day
  earlier. See ARCHITECTURE.md for the three options; nothing here changes
  until he picks one.
- **Marketing's MER figure is blank.** Needs cross-referencing Revenue's total
  store revenue for the same dates — deliberately not wired up.
- **CRM's monthly metrics are 100% manual.** No automatic computation from
  `customers` exists yet, even now that Customers itself can be populated —
  a reasonable near-term follow-up, not done this pass.
- **Reviews has no automatic metric pre-fill.** The spec implies ~13 numbers
  auto-pulled per review; deciding exactly which numbers is a real strategy
  call left to Lucas. Metrics are logged by hand today.
- **Content has no calendar/kanban view**, only a flat pipeline list — the
  spec's drag-and-drop view was skipped since it can't be click-tested from a
  sandbox with no browser.
- **Team has no department management** (add/rename/remove departments) — the
  screen reads whatever departments already exist but doesn't manage the list.
- **No markdown renderer anywhere** (SOPs, review notes, etc. show raw text) —
  no markdown package is installed; this needs a real `npm install`, which
  can't happen from the sandbox this was built in.
- **Global search / ⌘K is built (2026-09-14).** Test it under "Global search
  (⌘K)" above. It searches tasks/projects/goals/products/content/SOPs plus
  the nav — it deliberately does not search Revenue/Finance/Marketing/CRM
  rows (none of those tables have one obvious title field to match against).
- **`/notifications` is built (2026-09-14)** — no longer a dead link. It will
  correctly show empty, though, until something actually writes a row: the
  `notifications` table has no insert policy for regular users, so populating
  it (e.g. "notify someone when a task is assigned to them") needs a
  fan-out/cron mechanism that's a separate, still-unbuilt piece of work. The
  read/mark-read UI itself is finished and ready the moment that exists.
- **Campaign→project and creator-content→content links** are free-text only,
  not real relational pickers, in Marketing.
- **Company Health, SOPs, and the 11 fixed business systems/12 CRM flows**
  assume they're either pre-seeded per organization or created on demand
  (CRM) — if a fresh org has zero rows and Company Health shows nothing to
  score, that's a seeding question, not a screen bug.

## 7. Automated test status (for reference, not something to re-run manually)

`npm run test:calc` = **74/74 passing** as of 2026-09-16 (was 71/71 as of
2026-09-14, was 61/61 as of 2026-09-13; the 3 newest tests cover the
2026-09-16 email-capture addition — latest-order-wins, missing-column
doesn't warn, no-email stays null — in
`lib/import/__tests__/customerAggregation.test.ts`), covering every pure
calculation (revenue pacing, contribution margin, ad metrics, inventory
valuation/reorder, key-result/project/system health scoring, the Showmore
order/product CSV parsers, i18n key parity EN/繁中, phone/email customer
aggregation). This suite does **not** cover anything that touches Supabase,
Next.js rendering, or RLS — those can only be checked by the click-through
steps above. Re-run it any time with:

```
npm run test:calc
```

It should stay green. If it doesn't, something regressed — stop and fix before
testing further.

**2026-09-16 note:** this whole suite was also actually run end-to-end from
this session's sandbox for the first time (previously only "parses clean"
was checkable here) — every one of the 74 tests really executed and passed,
not just parsed. The one file that needs the `server-only` npm package
(`customerAggregation.test.ts`, via `customerHash.server.ts`) needed a
throwaway local stub to run here, since this sandbox has no npm registry
access — that stub is not part of the real codebase and was not committed
anywhere. On your machine, `npm run test:calc` already has the real
`server-only` package installed and needs no such workaround.
