@AGENTS.md

# DAYSTAR OS — Claude Code project instructions

## Purpose

DAYSTAR OS is the internal Business Operating System for DAYSTAR (日星), a Taiwan
street-luxury jewelry brand. It replaces a scatter of spreadsheets and manual
tracking with one app covering revenue, products/inventory, CRM, projects/goals,
content, marketing, finance, team, reviews, SOPs, and company health — bilingual
English ↔ 繁體中文. Long-term, proven internal use is the first phase of a plan to
harden and sell it as a product to other businesses (see
`docs/ARCHITECTURE.md` and the analyst briefing artifact for the full blueprint).

**Before any substantial work, read `docs/ARCHITECTURE.md` §0 "Current state"** —
it says what is actually built, what is real data vs. seed, what is deployed vs.
only local, and what to do next. README.md's "What is built" table is the
per-module status at a glance. Sections 1–10 of ARCHITECTURE.md are the product
spec; §0 is where the build actually is as of the last session that touched it.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript 5 · Tailwind 3 + shadcn/ui ·
Supabase (Postgres, Auth, Row-Level Security) · Zod · date-fns · Recharts ·
tsx as the test runner (`node --test` semantics, run with
`--conditions=react-server`). Package manager is npm (there is a
`package-lock.json`, no other lockfile — don't introduce pnpm/yarn).

## Project structure

- `src/app/(app)/*` — the authenticated app shell: one route folder per module
  (`revenue`, `products`, `inventory`, `crm`, `projects`, `goals`, `content`,
  `marketing`, `finance`, `team`, `reviews`, `sops`, `operations`, `company/health`,
  `settings`, `tasks`, `my-work`, `overview`, `notifications`). Most modules
  follow `page.tsx` + `actions.ts` (server actions) + drawer/dialog components.
- `src/app/(auth)/*` — login, password reset.
- `src/app/api/cron/*` — Vercel Cron-triggered routes (e.g. `notifications-fanout`).
  Auth via `Authorization: Bearer <CRON_SECRET>`, which Vercel sends automatically
  per `vercel.json`'s `crons` entry — no other auth plumbing needed.
- `src/app/api/internal/*` — endpoints Claude or Lucas trigger by hand (e.g. the
  Showmore daily sync), not on a schedule.
- `src/app/api/webhooks/*` — inbound webhooks from third parties (Showmore).
- `src/components/<domain>/*` — UI components grouped by the same module names
  as the routes above, plus `layout/` (TopBar, Sidebar, CommandPalette) and
  `dashboard/` (Command Center widgets).
- `src/lib/calculations/*` — **all business math lives here, and only here.**
  Pure, tested functions (finance, goals, health, inventory, pacing, recurrence,
  rules). Tested in `src/lib/calculations/__tests__/`.
- `src/lib/data/<domain>.ts` — server-side data fetchers per module; screens
  assemble data here, not inline in page components.
- `src/lib/i18n/` — `en.ts` and `zh-Hant.ts` dictionaries. **Every new
  user-facing string goes in both files** — the i18n test fails on any key
  present in one and not the other.
- `src/lib/import/*` — CSV/Showmore import parsers (tolerant parsing matters —
  Showmore's product CSV is malformed; see Gotchas in README.md).
- `src/lib/integrations/*` — external API clients (Showmore, Google Analytics).
- `src/lib/supabase/{client,server,admin}.ts` — the three Supabase client
  flavors. `admin.ts` is the service-role client: server-only, for cron jobs,
  webhooks, and anything that must bypass RLS deliberately.
- `src/lib/permissions.ts` — mirrors the real RLS policies so the UI can hide
  what the database would refuse anyway. If this drifts from the actual RLS in
  `supabase/migrations/0002_rls.sql`, the UI will lie about what a role can do.
- `src/types/database.ts` — generated from the live schema via
  `npm run db:types`. **Never hand-edit; regenerate it.**
- `supabase/migrations/*.sql` — run manually in the Supabase SQL editor, in
  order, against the live project. This project does not use `supabase db push`
  as part of its normal workflow.
- `docs/ARCHITECTURE.md` — the authoritative current-state doc (§0) plus the
  full product spec (§1–10).
- `scripts/db-types.mjs` — regenerates `src/types/database.ts`.

## Commands

| Command | What it does |
|---|---|
| `npm install` | install dependencies |
| `npm run dev` | dev server at http://localhost:3000 |
| `npm run build` | production build |
| `npm run start` | run a production build locally |
| `npm run lint` | ESLint (flat config, `eslint.config.mjs`) |
| `npm run typecheck` | `tsc --noEmit` — run this before considering any change done |
| `npm run test:calc` | the full automated test suite (calculations, i18n parity, import parsers, permissions) — **the only automated gate in this project. Keep it green.** |
| `npm run db:types` | regenerate `src/types/database.ts` from the live Supabase schema (needs `SUPABASE_PROJECT_ID`) |

## Build/test workflow

For any implementation task, before declaring it done:

1. `npm run typecheck` — must be clean. This project has shipped code that
   typechecked clean but was never run through the compiler by hand before
   (the notifications-fanout cron route) — don't repeat that; always actually run it.
2. `npm run test:calc` if the change touches `lib/calculations`, `lib/i18n`,
   `lib/import`, `lib/integrations`, or `lib/permissions.ts` — these are exactly
   what the suite covers.
3. `npm run lint`.
4. Manually verify the actual behavior changed as intended — `test:calc` is the
   *only* automated gate; most UI and server-action code has zero test coverage,
   so "typechecks clean" is not the same claim as "works." Use the project's own
   vocabulary for this distinction when reporting status: **"typechecks clean"**
   (compiles, not run) vs. **"click-tested"** or **"live-verified"** (actually
   exercised against real/dev data). Don't claim the stronger one without doing it.
5. Fix failures, retest. Don't stop at the first failed attempt.
6. Report honestly which of the two levels above you actually reached, and any
   remaining blocker.

## Conventions

(Full list in README.md's "Conventions" and "Gotchas that have already cost
time" sections — read those for anything not covered here. Highlights worth
never forgetting:)

- Business math lives only in `src/lib/calculations` and is tested.
- Every changing business value is database data; every target is a `targets` row.
- Inventory changes only through `inventory_movements` (append-only audit trail).
- New user-facing text goes into **both** `en.ts` and `zh-Hant.ts`.
- A cost of `null` means **unknown**, never zero — never fabricate a value to
  avoid a null.
- Design tokens only — no new colours, radii, or shadows invented ad hoc.
- No fake buttons, filters, charts, or search — if it's not wired to something
  real, don't ship it.
- A `'use server'` module may export **only async functions**.
- A Server Component cannot pass a function prop to a Client Component.
- `postgrest-js` types the result from the select string **literal** — building
  it with string concatenation widens it to `string` and every column becomes
  `never`.

## Autonomous execution policy

When given a development objective:

1. Understand the desired outcome.
2. Inspect the existing implementation.
3. Create your own implementation plan.
4. Execute the plan without waiting for approval on minor decisions.
5. Test what you build.
6. Diagnose failures.
7. Fix failures.
8. Retest.
9. Verify the complete workflow where possible.
10. Continue iterating until the objective is genuinely complete.

Do not stop merely because: one implementation attempt failed; a test failed; a
dependency needs installing; a file needs creating; code needs refactoring;
there are several reasonable implementation options; or additional debugging is
required. Choose the most reasonable, reversible option and continue.

Only stop and ask when there is a genuine blocker: credentials only Lucas can
provide; a required external authorization; an irreversible production action
(a force push, a destructive database operation, a production deploy not
explicitly requested); an important business decision with materially
different consequences (anything that trades off privacy, cost, or scope in a
way the product spec doesn't already settle); or something technically
impossible from the current environment.

Do not claim completion merely because code was written. Completion means the
implementation has been reasonably tested and verified per the Build/test
workflow above — run relevant tests, check for obvious errors, verify the
actual workflow, fix failures where practical, and report remaining blockers
honestly rather than glossing over them.

**When given an implementation task, continue autonomously through planning,
implementation, testing, debugging, and verification. Do not stop for minor
implementation decisions. Make reasonable and reversible decisions
independently. Continue until the requested milestone is genuinely complete or
a real external blocker is encountered.**

## Safety boundaries (enforced in `.claude/settings.json`)

- Secrets are never read or edited by Claude: `.env`, `.env.local`, and every
  other non-example env file; SSH keys; credential stores. `.env.example` is
  fine to read and edit — it's documentation, not a secret, and is meant to be
  kept current (e.g. it was updated this way when `CRON_SECRET` was added).
- Hard-blocked regardless of approval: force pushes, `git reset --hard`,
  `git clean -f`, recursive force-deletes, and Supabase CLI commands that would
  push schema changes or reset the database (`supabase db push`,
  `supabase db reset`, `supabase migration up`) — this project's real workflow
  runs migrations by hand in the Supabase SQL editor against a database with
  real customer and revenue data, not via CLI.
- Plain `git push` is deliberately **not** on the always-allowed list, even
  though `git add`/`git commit` are. On this repo, pushing to `main` triggers
  an immediate Vercel production deploy — so it always needs your real-time
  go-ahead, the same way we did it together when shipping the #418 fix and the
  notifications cron.
- Same treatment for `vercel deploy --prod` / `vercel --prod` and any other
  explicit production-deploy command — always asks first.
