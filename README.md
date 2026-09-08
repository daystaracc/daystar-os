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
| `npm run test:calc` | calculations + i18n + import parser (**28 tests**) |
| `npm run db:types` | regenerate `src/types/database.ts` from the live schema |

`test:calc` is the only automated gate. Keep it green.

## Database

Run in the Supabase SQL editor, in order:

```
supabase/migrations/0001_schema.sql
supabase/migrations/0002_rls.sql
supabase/migrations/0003_fix_system_score_trigger.sql
supabase/migrations/0004_fix_tasks_update_recursion.sql
supabase/migrations/0005_products_cost_nullable.sql      ← NOT YET APPLIED
supabase/migrations/0006_variant_level_stock.sql         ← NOT YET APPLIED
supabase/seed.sql
```

**0005 and 0006 are written but have not been run against the live project.** The
product import cannot start until they are. See ARCHITECTURE §0.

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
| Revenue | **in progress** — order history imported, screens not built |
| Projects, Goals, Products, Inventory, Content, Marketing, CRM, Finance, Team, Reviews, SOPs | not built — **the sidebar links to these and they 404** |

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
