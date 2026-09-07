-- =====================================================================
-- DAYSTAR OS — products.cost becomes "unknown-able"  (0005)
--
-- Showmore's product export carries no cost, so imported products must be able
-- to say "we do not know the cost yet" rather than claim it is zero. A zero cost
-- is not neutral: it reads as 100% gross margin and as NT$0 of inventory value,
-- which is worse than showing nothing.
--
-- `cost` was `numeric not null default 0`. It becomes nullable with no default,
-- so an insert that omits it stores NULL. Existing rows keep their costs; the
-- calculation layer treats NULL as "no cost data" and refuses to compute margin.
--
-- inventory.unit_cost was already nullable and is unchanged.
-- =====================================================================

alter table public.products alter column cost drop not null;
alter table public.products alter column cost drop default;

comment on column public.products.cost is
  'Unit cost in TWD. NULL means unknown — never treat it as 0 for margin or inventory value.';
