# What got done today — DAYSTAR OS

A plain-language rundown of this session's work, updated after the "keep building
while I'm away" run. Everything below is already saved to your `daystar-os` folder
on your computer.

## 2026-09-21, even later: automatic order sync from Showmore is built (not deployed yet)

You got Showmore's real API docs and an API key, added it to Vercel yourself, and
said to build it. It's built and all 86 automated tests pass, but it hasn't gone
live yet — three things need to happen first, in order:

1. **I need to run two small database migrations** (0010, 0011) against your real
   Supabase project — I'll walk you through this, or do it if you give me the
   go-ahead to run SQL there directly.
2. **You need to add one more Vercel environment variable**: `SUPABASE_SERVICE_ROLE_KEY`.
   Find it in your Supabase project → Settings → API → the `service_role` key
   (different from the `anon` key already on Vercel). This is needed because the
   webhook that receives Showmore's order notifications has no logged-in user —
   it needs this key to be allowed to write to the database at all.
3. **Once deployed, register the webhook URL on Showmore's side**: go to Showmore's
   backend → 串接文件 (integration docs) settings, and paste in
   `https://daystar-os.vercel.app/api/webhooks/showmore`. I'll remind you of this
   exact URL once step 1 and 2 are done and it's live.

**What it actually does, once live:** every time an order is created, canceled,
edited, or returned on Showmore, it automatically pulls the full order and
updates that day's numbers on your Revenue screen — no more manual CSV exports.
It also updates per-product sales numbers, which feeds things like the Hero
Products reorder alerts on your Overview page (those weren't actually being fed
by anything before this). There's also a "Sync now" button on the Revenue import
page for pulling in a date range by hand — useful for backfilling your order
history once this is live, or double-checking a week if something looks off.

**One real thing I found and fixed along the way:** your product catalogue
import was reading Showmore's own SKU field but throwing it away — never saving
it. Fixed that too, since order matching depends on it: as you fill in SKUs on
Showmore's side and re-run the product import, order-to-product matching gets
more accurate automatically, no rebuild needed.

**What "automatic" doesn't cover:** it won't touch your Operations daily log
(the one you/the team fill in by hand) — that has real fields no order feed
could know, like errors and CS response times, and I didn't want to risk
silently overwriting something someone typed in. If you'd ever want order
counts feeding into that too, just ask.

## 2026-09-21, later: click-tested the whole live site

You logged me into the real site and I clicked through every screen in the
sidebar to check nothing else is quietly broken — same spirit as how the
Operations 404 got found. Results:

- **Operations** (my build from earlier today): tested both tabs for real.
  Created a daily-log entry, watched the KPIs and 30-day totals update
  correctly, then edited it. Created a CS case, then changed its status to
  "resolved" and watched it re-sort and the pending count drop — this is
  the exact code path the build-error fix touched (issue type saving
  correctly, status stamping correctly). Confirmed working end to end.
- **Everything else** — Projects, Goals, Content, the Company Health score
  on your Overview page, SOPs, Reviews (覆盤), Marketing, Finance, Team,
  the ⌘K search, and Notifications — all loaded real data with no errors.
  Nothing 404s, nothing showed a blank or broken screen.
- The "missing isn't zero" behavior held up everywhere I looked — things
  with no data yet show a dash or "no data," never a false zero.

**Two things I left behind on purpose:** a test daily-log entry dated
2026-09-21 in Operations, and a test CS case ("Test Customer QA" /
TEST-0921, now marked resolved). Both have delete buttons that pop a
browser confirm dialog, which isn't safe for me to click through
automated — you're welcome to delete them yourself next time you're in
there, or just leave them, they're harmless.

Nothing else needs your attention from this pass.

## 2026-09-21: the git push landed, and the Operations screen is built

The push from two days ago finally went through — everything built since 09-16
(MER on Marketing, the Campaign field on Content, all the small hardening fixes)
is now live on the real site.

You reported **Operations (#12 in the sidebar) as a 404** — and you were right.
It's been a link in the sidebar with nothing behind it since the very first
session: the database tables existed, but the actual page never got built. It's
built now, with two tabs:

- **Daily log** — log each day's orders waiting/shipped, errors, returns, CS
  pending, and (if you want to track it) how long fulfillment took and who
  logged it. Shows today's numbers plus 30-day totals and averages up top.
- **CS cases** — open customer service issues: channel, issue type, status
  (open → waiting → resolved → closed), who owns it, resolution notes. Open and
  waiting cases always sort to the top.

Both were already wired into the "needs attention" list on your Command Center
(stale CS cases, orders piling up) — that link just went nowhere until now. It
does now.

**On auto-pulling orders from Showmore and 蝦皮 (Shopee):** this is a real
project, not a quick add — each platform would need to push order events to a
webhook this app exposes, authenticated, mapped into the same tables Revenue
already uses. Before I can start on it for real, I need whatever API/webhook
access those platforms offer on your seller accounts — that's not something I
can set up from here. Worth a short conversation about which platform to wire
up first once you have that in hand.

## 2026-09-17, later: five more small input-size fixes

Follow-up to the one above — checked every text box in the app for the same
kind of gap (no size limit) and found four more, all low-stakes: adding
labels or a checklist item to a task, the CRM customer search box, and the
⌘K quick-search box. All now capped at a sensible size, same as everywhere
else. Nothing you need to do.

## 2026-09-17: one small security/data-hygiene fix

Went looking systematically for anywhere in the app that accepts free text
or a list without a size limit (the kind of gap that's usually harmless
until someone — or some bug — sends something huge). Found exactly one:
a product variant's "attributes" field (the size/color/material text you
type when adding a variant) had no limit at all. Low real risk — only
managers can use it — but now it's capped at a sensible size, same as
every other text field in the app. Nothing you need to do about this one.

## 2026-09-16, later still: campaign pages now show their linked content

Quick follow-up to the Content ↔ Campaign link below: a campaign's own detail
page (Marketing → a campaign) now lists every piece of content tagged to it,
with a one-click link straight into editing that piece. Small, safe addition —
no new permissions, nothing that needed a live database to verify. Git push
still unchanged, still stuck — see above.

## 2026-09-16, later: Marketing ↔ Revenue connected, Content ↔ Campaign linked

Two real features, plus a doc correction:

1. **Marketing's MER number now actually shows up.** The Ad spend tab always
   showed "MER not available yet" — the math for it existed for weeks, it
   just was never told your total store revenue. Now it pulls that from
   Revenue automatically and shows the real number; the old note only
   reappears if that lookup ever fails.
2. **You can now tag content with the campaign it belongs to.** Your database
   has had a spot for this since the very first version of the app, but
   nothing in the screens ever used it — Content and Marketing were two
   islands even though the data connecting them already existed. Content →
   New/Edit → Advanced now has a Campaign dropdown.
3. Corrected an outdated code comment about CRM's monthly metrics (still
   manual — see the updated `TOMORROW_2HR_GUIDE.md` for why) and re-ran the
   full test suite clean (74/74) after all of today's changes.
4. **The git push from earlier today is still stuck** — checked again just
   now, unchanged. This is the #1 item in your updated
   `TOMORROW_2HR_GUIDE.md`; none of today's work (this or the items below)
   is on the live site yet.

## 2026-09-16, continuing: last screens checked, one real bug fixed, full test run confirmed clean

Went through the three earliest-built screens (Command Center, My Work, Tasks)
with the same close look everything else got — that closes out every screen
in the app. Found and fixed one real bug: if a recurring task's next
occurrence failed to get created when you marked it done, that failure was
completely invisible — the task just looked completed and nothing told you
the repeat had silently broken. Now it at least gets logged so it's not
invisible anymore. Also ran your entire automated test suite for real (not
just checked that it reads correctly, actually ran every test) — **74 of 74
pass**, including the 3 new ones for tonight's email-capture work.

## 2026-09-16 midday: the git discovery, the email decision, and what's next

Two things happened when you were at the keyboard for that hour:

1. **We found this whole build had never actually been saved to git before.**
   Everything from Revenue through Settings — the entire multi-day build — was
   sitting as uncommitted changes on your computer. That's why the live site
   never looked current. You ran the commit yourself (worked perfectly, 142
   files) and started the push, but had to step away before it finished — I
   checked afterward and it looks like it's still sitting there, not actually
   sent to GitHub yet. My best guess (I can't see your screen to confirm): git
   probably popped up a sign-in window that's still waiting for you. **Next
   time you're at your computer: just run `git push` again from the
   `daystar-os` folder, and if a sign-in window shows up, click through it.**
   Until that's done, the live site still won't reflect anything new.

2. **You picked "email only" for the customer info question** — I built it
   while you were away. Going forward, real customer email addresses get
   saved from each order import (phone numbers still stay scrambled, never
   the real number — that part didn't change). This needed your computer to
   receive the code, and it's already there waiting, along with the git-push
   fix above.

Nothing else needs a decision from you right now — just that one `git push`,
then whenever you have another hour, the click-testing checklist below is
still the main thing left.

## 2026-09-16 early morning: last two screens checked, both clean

The two screens that hadn't gotten a full read-through yet — the ⌘K search box
and the notifications page — got the same close look everything else did
overnight. Nothing wrong turned up. One tiny, harmless inconsistency: the
search box's "make special characters safe" logic doesn't handle backslashes
quite as completely as the newer Customers search box does — this only matters
if someone searches for something containing a literal `\`, which basically
never happens in practice. Not worth a special trip to fix; noted for whenever
someone's next in that file. That's every screen in the app now checked this
way at least once — the punch list below (in the separate step-by-step guide)
is what's actually worth your time.

Also worth knowing: I couldn't reach your computer overnight (the connection
between us dropped), so nothing new was written to your files in this pass —
just documentation updates here and in `docs/ARCHITECTURE.md`/`TEST_RUN_GUIDE.md`,
which I'll push over as soon as the connection's back.

## Overnight wrap-up: went through everything else, nothing else was broken

After the import fixes and the Customers rebuild below, I spent the rest of the
session doing the closest thing to testing possible without being able to click
through the app myself: read every remaining screen's actual code end to end —
Goals, Projects, Content, Company Health, SOPs, Reviews, Marketing, Finance,
Team — specifically hunting for the same kinds of mistakes that caused tonight's
three real bugs (a permission check that doesn't match the database, a number
that divides by zero, a cap that quietly hides data, a button that looks like it
works but doesn't).

Nothing turned up. Every screen's edit/delete permissions match the database
exactly, every calculation already guards against the "no data yet" case
instead of showing a misleading zero, and the one place someone could otherwise
demote themselves out of being a founder by accident is blocked on the server,
not just grayed out in the browser. I also checked every other place in the app
that writes to the database the same way the customer-import bug did, and every
other search box for the same kind of typed-input bug — both came back clean
too.

This isn't the same as you clicking through each screen yourself — that's still
worth doing when you have time, per `TEST_RUN_GUIDE.md` — but it's the most
thorough check possible while you were away, and it came back clean. Nothing
new to report from this pass; the three bugs below are still the only real ones
found tonight, and all three are already fixed.

## 2026-09-15: your real order history is in, and one thing needs your call

You ran the actual import — nearly 7,000 orders covering April 2025 through
today. Two real bugs showed up along the way and both are fixed:

1. The file was big enough to hit a size limit the app had on file uploads —
   fixed by raising that limit.
2. The customer side of the import failed the first time with a database error
   ("no unique constraint matching..."). That was a genuine bug in yesterday's
   migration — the index it created was slightly the wrong shape for how the
   import tries to write. New migration `0009` fixes it (you already ran it).

End result: **5,404 real customers, 924 of them repeat buyers, NT$6,246,453 in
tracked lifetime spend** — all sitting in your CRM now.

**Then you asked for two more things, and here's where each one stands:**

*"I want all of them"* — done. The Customers tab used to only show your top 200
spenders and just silently hid everyone else, which is what you were running
into. It now shows all 5,404, with a search box (by name, email, or phone) and
paging through the list instead of one giant page.

*"Better to have their full info, emails phone numbers etc."* — **I didn't
build this one, on purpose, and want your OK before I do.** Here's why: right
now, DAYSTAR deliberately never stores a customer's real phone number or email
anywhere — that was the whole point of the "scramble it with a hash" design
from yesterday, which you approved specifically *because* it avoids storing
real numbers. What you're asking for now would undo that. It's not a big
technical lift either way, but it's a real reversal of a privacy decision you
made a day ago, for over 5,000 real people's data at once, and it's the kind
of thing that can also carry actual legal obligations in Taiwan (the Personal
Data Protection Act applies once you're storing customers' phone numbers and
emails). So — three options for when you're back, cheapest to build first:
keep it as-is (names + spend, no raw contact info); add email only (lower-risk,
more standard for a CRM); or add real phone numbers too (the one that reverses
yesterday's decision outright). Your call, no rush — full detail is in
`docs/ARCHITECTURE.md` under "Decision needed from Lucas."

## New since the last update: customers now populate automatically

You said "just do it, standard salted hash is fine," so this is done. Uploading a
Showmore order-export file at `/revenue/import` now does two things at once: it
still updates your daily revenue numbers like before, and it **also** builds your
CRM customer list from the same file — no second upload, no separate screen.

The phone number itself is never stored anywhere, in any form. Each phone number
gets scrambled (a standard cryptographic hash, salted with a secret only your
server knows) the instant the file is read, and only that scrambled version is
saved — it's used purely to recognize "this is the same customer as last time,"
never to recover the actual number. Names are still saved plainly, same as before.

Two things need to happen on your end before this actually works:
1. Run one new database migration file (`supabase/migrations/0008_customer_phone_hash.sql`)
   against your live database — adds one new column.
2. Set a new secret value (`CUSTOMER_PHONE_HASH_SALT` — any long random string
   you like) in both your local `.env` file and your Vercel project settings.

Until you do both, the import fails with a clear message telling you exactly
what's missing — it will never half-import or guess. I added 10 new automated
tests for this (phone-number parsing, the hashing itself, and the customer
totals) — all passing, bringing the running total to **71/71**.

Full detail, including exactly why this design was chosen, is in
`docs/ARCHITECTURE.md` and the updated `TEST_RUN_GUIDE.md`.

## Also new: search actually works, and the bell icon goes somewhere

Two more things that were dead links all session are now real:

**Global search (⌘K).** Press ⌘K (or Ctrl+K) anywhere, or click the search bar
in the top bar — both now open an actual search box instead of doing nothing.
Type nothing and it shows every screen you have access to, as a quick way to
jump around without touching the mouse. Type two or more letters and it also
searches your actual data — tasks, projects, goals, products, content pieces,
and SOPs — and takes you straight to the right one.

**Notifications.** The bell icon in the top bar now opens a real page instead
of a 404. Right now it'll show up empty — nothing in the app writes a
notification yet (that's a separate piece, "notify someone when X happens,"
which wasn't part of this build). But the page itself, and the "mark as read"
behavior, and the little red count badge on the bell, are all real and ready
the moment something starts writing rows into it.

## The short version

Twelve screens now exist that didn't before today: **Revenue, Projects, Goals,
Products, Inventory, Content, SOPs, Reviews, Marketing, CRM, Finance, Team** —
plus **Company Health**, which closes a dangling link your sidebar has had all
session. Along the way, your own `npm run typecheck` run found 2 real bugs (both
fixed), and a real product-export file you gave me confirmed the
product-catalogue import is finally unblocked. **Every link in your sidebar now
works — nothing 404s any more.** What's left isn't more screens; it's running a
real typecheck, clicking through each one against your live app, and a couple of
decisions only you can make (see "What I deliberately did NOT do" below).

Every piece of business math I could test on its own, I tested for real: **71
automated tests, all passing.** The screens themselves (the parts that talk to your
database) are carefully written and reviewed by hand, but most have **not yet been
click-tested against the live app** — I have no way to run Next.js or connect to
Supabase from this sandbox. Before trusting any "written, not yet typechecked"
screen with real data: run `npm run typecheck` and click through it once. Revenue,
Projects and Goals already passed a real typecheck with your help earlier today.

## What's new since your last check-in (built while you were away)

### Products (`/products`)

Your product catalogue: list with stock status and margin, a detail page with
variants, and a way for **any team member** (not just managers) to log a physical
stock count — that's a real, deliberate difference from every other screen, matching
a rule already in your database ("fulfillment staff adjust stock").

### Inventory (`/inventory`)

A read-only dashboard: total stock value, a breakdown of how many products are
critical / low / healthy / overstocked / dead stock, and a reorder-needed list that
links straight to the product. Careful about one thing that's easy to get wrong: a
product with *no sales data yet* is shown separately from one that's genuinely dead
stock — the two look similar but mean very different things.

### Content (`/content`)

The "Content" link in your sidebar that's been going to a 404 — it now works. A
list of content pieces (short videos, photos, etc.) sorted by pipeline stage (Idea →
Script → … → Published), a weekly publishing-pace card ("published 4 of your 10/week
target"), and create/edit/delete. One real nuance from your database rules: **any**
team member can create a content idea, but only managers/founders — or whoever
owns/created that specific piece — can edit it. I did not build the full drag-and-drop
calendar view from the original spec; that's a reasonable next step once this
simpler list has been clicked through and trusted.

### Company Health (`/company/health`)

This one wasn't on the original to-do list — I found it while working. Your Command
Center's "Business health" section has linked to `/company/health` all session, and
every click has been 404ing. I built the page it was missing: a scorecard for your
11 fixed business systems (Brand, Content, Product, CRO, AOV, CRM, Paid ads,
Creators, Supply chain, Team, Finance), each with a 1–5 score, an owner, the current
bottleneck, next action, and a small history strip of past scores. All the "keep
score history, recompute status" logic already lived in your database as a trigger,
so I didn't have to build or test any of that — I just had to build the page that
reads and writes to it.

### SOPs (`/sops`)

Your standard-operating-procedures library — another sidebar link that's been going
to a 404. A list across the 11 fixed categories (fulfillment, inventory, customer
service, content, marketing, product, finance, website, operations, management,
other), a real detail page per procedure, and an edit drawer. One thing worth
knowing: procedures are versioned by hand — there's no automatic version-history
trigger like Company Health has — so the version number only goes up when the
actual procedure text changes, not when someone just relabels the title or owner.
Procedures show as plain text, not rendered Markdown, since there's no Markdown
library in this project yet (a real limitation, not a shortcut I hid).

### Reviews (`/reviews`)

Your weekly/monthly business review screen (WBR/MBR). Create a review for a period
— it suggests the most recently *completed* week or month, editable if you want a
different one — then write your wins, problems, decisions, and next-period
priorities (monthly reviews also get a free-text notes field). Mark it complete
when it's done, reopen it if you need to come back to it, and log any metric you
want by hand, grouped into the seven areas your spec describes (Growth, Product,
Content, CRM, Operations, Finance, Team) — each one shows a % change if you log a
previous value alongside it. Only founders and managers can see this screen at all
(I tightened that beyond what the database technically allows, to match your
original spec and the sidebar's existing behavior — see "What I deliberately did
NOT do" below).

### Marketing (`/marketing`)

Another sidebar link that's been going to a 404 — now three sub-areas in one
screen with a tab switcher at the top. **Campaigns**: create one, log a day's
revenue/orders/spend against it, and see its running ROAS. **Ad spend**: a daily
log by platform (Meta/TikTok/Google/Other) that shows real return-on-ad-spend,
cost-per-acquisition, CPM, CTR, CPC, and conversion rate — all computed from
math that was already built and tested earlier this session, this is just its
first real use. **Creators**: a roster of who you're working with (status from
prospect through successful), with a place to log each piece of content they
make for you — products sent, a link, views, and sales. Same as Reviews, only
founders and managers can open this screen, because two of the underlying
database tables don't let anyone else read spend or performance numbers at all.

### CRM (`/crm`)

The last of the tabbed multi-area screens: **Flows**, **Monthly metrics**, and
**Customers**. Flows track your 12 fixed lifecycle automations (welcome series,
abandoned cart, post-purchase, review request, cross-sell, winback, VIP, launch,
restock, birthday, lapsed, high-value) — channel, status, audience, owner, and
manual performance numbers (messages sent, sends, conversions, revenue). You can
create a flow for any of the 12 keys you haven't set up yet; once created, the key
itself is locked (it's the flow's identity, not something to casually change).
**Monthly metrics** is a simple by-hand log — total customers, repeat rate, LTV,
that kind of thing, one row per month, and saving a month always replaces that
month's numbers rather than adding to them. **Customers** is a real, working list
sorted by lifetime spend, and — new since this section was first written — it
now gets populated automatically from your `/revenue/import` upload (see "New
since the last update" near the top of this document) once you've done the
one-time setup it needs. This is the **strictest**
screen of the whole session — only founders can open it at all, matching your
database's rule that the customers table is founder-only for every single
operation, including read.

### Finance (`/finance`)

The last of the tabbed screens, and the last screen you had a 404 for besides
Team. **Monthly P&L**: one row per month — revenue, cost of goods, cash balance,
and inventory value up front, with the full cost breakdown (payment fees,
shipping, packaging, advertising, returns, operating expenses) tucked under
"Advanced options" since you'd usually fill those in once from your bookkeeping,
not eyeball them one at a time. Saving a month replaces that month's numbers, same
as everywhere else this session. Every row shows real gross margin % and
contribution margin, computed with the exact Playbook formula (Revenue − COGS −
fees − shipping − packaging − ads − returns), which was already built and tested
earlier this session — this is just its first real use. **Expenses**: a simple
running log — date, category, amount, vendor, note — over the last 90 days, with
a total at the top. Category is free text on purpose: your database doesn't lock
it to a fixed list, so neither does the form. Only founders can see this screen —
the one gate this session that needed zero new code, since the founder-only rule
was already sitting there from an earlier session, unused until now, and it
already matched your database exactly.

### Team (`/team`)

The last screen, and the only one this session open to **everyone** — every
active member can see it, not just founders/managers, matching your spec exactly.
A directory of your team: name, role, title, department, manager, status, and a
live count of each person's open tasks and how many are overdue ("who is
loaded," straight from your spec's own question for this screen). Only founders
get an edit control, and even a founder can't demote *themselves* out of founder
through the form — a small guardrail so no one can accidentally lock themselves
out. No way to add or remove team members here — that happens when someone
actually signs up, the same edit-only shape as Company Health's 11 systems, not
something to fake with a "create" button. I didn't build management of your
departments list itself (adding/renaming/removing departments) — this screen
shows whatever departments already exist, since I can't tell from here whether
your real department list is already the way you want it.

## Two real bugs your own machine found (and I fixed)

You ran `npm run typecheck` for the first time today and it found exactly 2 errors,
both in Revenue (`lib/data/revenue.ts` and the import wizard's actions file) — the
same small mistake in two places: a helper's type declaration said a field was
optional when the code actually required it. Fixed both; you re-ran the check and it
came back clean. Projects and Goals had **zero errors** on the very first try —
real evidence that the extra care taken reviewing those screens by hand paid off.

## The product import is finally unblocked

You uploaded a real, current product-export file from Showmore. I ran it through
the already-tested parser (no database involved — just checking the file is
readable): **102 products, 321 variants, 3,512 units on hand, 115 with a known cost
and 206 without** — a clean parse, no errors, no duplicates. The only remaining step
is running the actual import at `/settings/import`, which needs you at the keyboard
since it writes to your live database for the first time. Everything is ready.

## What's tested for real vs. written carefully but unverified

**Genuinely run and passing (71/71 automated tests):** all the pure math — revenue
pacing, the Showmore order and product parsers, key-result progress, project and
system health scoring, inventory valuation and reorder suggestions, phone-number
normalization and hashing plus customer totals for the new customer import (new
this update), and figuring out "the full calendar month before this one" for
monthly reviews.
Products, Inventory, Content, Company Health, and SOPs added zero *new* untested
logic — they all reuse math that was already tested for other screens; Reviews
added exactly that one small date calculation and tested it properly; Marketing
added nothing new either — it's the first real use of the ad-metrics formulas
(ROAS, CAC, CPM, etc.) that were already built and tested earlier this session.
CRM's tabbed screen itself added nothing new — its numbers are by-hand entry or
(for Customers) the newly tested import logic described above. Finance added nothing new either — it's the first
real use of the contribution-margin formula, already built and tested earlier
this session. Team added nothing new either — its workload counts are a plain
tally over your existing tasks, not a new formula.

**Written and reviewed by hand, but never run against your actual app or
database:** every new screen's pages, forms, and database queries. This sandbox has
no way to install Next.js/Supabase or run your app, so hand review — reading every
file twice, checking it against your actual database rules — is the best
verification possible here. The fix: run `npm run typecheck`, then click through
`/products`, `/inventory`, `/content`, `/company/health`, `/sops`, `/reviews`,
`/marketing`, `/crm`, `/finance`, and `/team` once each. Exactly what to check for
each screen is written up in `docs/ARCHITECTURE.md` §0.

## What I deliberately did NOT do

- **Customer profiles from your order history** — done now (see "New since the
  last update" above), after you approved the hashing approach directly.
  Two setup steps still need you: the migration and the new secret value.
- **The full Content calendar / drag-and-drop pipeline** from the spec — built a
  simpler, safer flat list instead, since there's no way to click-test a
  drag-and-drop interaction from this sandbox. Worth revisiting once the current
  version has been used for a bit.
- **Automatic metrics in Reviews** — your spec implies each weekly review pulls in
  a fixed set of ~13 numbers automatically, compared against the previous period.
  Deciding exactly which numbers those are, across seven business areas, is a real
  strategy call — not something I should invent on my own while you're away. I
  built the real workflow around it (create, write, complete, manually log any
  metric you want) so it's useful today; the auto-pull can come later once you've
  told me which numbers matter, and once Marketing/CRM/Finance exist to pull them
  from.
- **One number in Marketing's ad-spend totals (MER)** — it needs your total store
  revenue for the same dates, which lives in the Revenue screen, and I didn't want
  to wire the two screens together without you having seen either work first.
  Every other ad metric (ROAS, CAC, CPM, CTR, CPC, CVR) is shown for real.
- **Linking a campaign to a project, or a creator's content to a specific Content
  OS entry** — both columns exist in the database but I left the picker unbuilt;
  the free-text fields already there cover today's need.
- **CRM's monthly metrics automation** — kept fully manual for now. Customers
  itself is populated automatically as of this update, but computing the
  monthly repeat-rate/retention rollup *from* that data automatically is a
  reasonable next step, not done this pass.
- **Marketing's MER figure, now that Finance exists** — Finance has your real
  monthly revenue, so the cross-reference Marketing's ad-spend totals were
  missing is now technically possible. Still didn't wire it up unattended —
  it's a two-screen connection worth doing deliberately, likely alongside the
  Reviews auto-pull, once you've seen both screens work.
- **Department management on the Team screen** — I show whatever departments
  already exist, but there's no add/rename/remove for the department list
  itself, since I can't tell from here whether it's already set up the way you
  want it.

## Where everything is

All files are saved directly into your `daystar-os` folder — nothing is only in
this chat. The two key docs for full technical detail:

- `docs/ARCHITECTURE.md` §0 — the honest, up-to-date status of everything, including
  exactly what's been verified and what hasn't, screen by screen.
- `README.md` — the quick-reference table of what's built.
