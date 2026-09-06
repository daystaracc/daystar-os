# DAYSTAR OS

Business Operating System for DAYSTAR. Next.js 15 · React 19 · TypeScript · Tailwind 3 · shadcn/ui · Supabase (Postgres, Auth, RLS). Bilingual English ↔ 繁體中文.

Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) first — it is the product spec.

## Running locally

```bash
npm install
cp .env.example .env.local   # then fill in the values below
npm run dev                  # http://localhost:3000
```

`.env.local` (never committed):

| Variable | Needed for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | every request — ships to the browser |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | every request — ships to the browser |
| `NEXT_PUBLIC_SITE_URL` | password-reset email links (set to the deployed origin) |
| `SUPABASE_PROJECT_ID` | `npm run db:types` only |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only admin client — **not yet used by any screen** |

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | dev server |
| `npm run build` | production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run test:calc` | calculation + i18n tests (14) |
| `npm run db:types` | regenerate `src/types/database.ts` from the live schema |

## Database

Run in the Supabase SQL editor, in order:

```
supabase/migrations/0001_schema.sql
supabase/migrations/0002_rls.sql
supabase/migrations/0003_fix_system_score_trigger.sql
supabase/migrations/0004_fix_tasks_update_recursion.sql
supabase/seed.sql
```

Roles are enforced by row-level security, not by the UI: founder · manager · member.
`src/lib/permissions.ts` mirrors the policies so the interface can disable what the
database would refuse anyway.

## Conventions

- Business math lives only in `src/lib/calculations` and is tested. Screens assemble
  data in `src/lib/data/*` (server) and render in `src/components/*`.
- Every changing business value is database data; **every target is a `targets` row**.
- Inventory changes only through `inventory_movements` (append-only audit trail).
- New user-facing text goes into **both** `src/lib/i18n/en.ts` and `zh-Hant.ts` —
  the i18n test fails on any key that exists in one and not the other.
- Bilingual data columns (`name_zh`, `title_zh`) are read through `localizedField()`.
- Design tokens only — no new colours, radii or shadows in components.
- A `'use server'` module may export **only** async functions.

## Status

| Module | State |
|---|---|
| Auth, app shell, i18n, design tokens | done |
| Command Center (`/overview`) | done |
| My Work (`/my-work`) | done |
| Tasks (`/tasks`) | done — list · kanban · calendar, CRUD, recurrence, filters |
| Revenue, Projects, Goals, Products, Inventory, Content, Finance, Team | next |
