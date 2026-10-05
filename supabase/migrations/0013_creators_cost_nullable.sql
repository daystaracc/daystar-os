-- 0013_creators_cost_nullable.sql
--
-- `creators.cost` was created NOT NULL DEFAULT 0, which silently represents
-- "no cost ever entered" as a real $0 (i.e. a confirmed free/gifted collab).
-- That contradicts this project's own convention, already true of every other
-- cost column (`products.cost`): a cost of null means unknown, never zero.
--
-- This migration only loosens the constraint — it does NOT touch any existing
-- row's value, so every creator currently at cost = 0 stays at 0. Deciding
-- which of those rows are genuinely free vs. simply never entered is a
-- separate, non-blocking data decision left for Lucas (see docs/ARCHITECTURE.md
-- §0, 2026-10-02 entry) — this migration does not attempt to answer it.
--
-- Safe to run twice: dropping a constraint that is already dropped is a no-op.

alter table creators alter column cost drop not null;
alter table creators alter column cost drop default;
