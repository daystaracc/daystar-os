-- =====================================================================
-- DAYSTAR OS — 0003: score history must be recorded AFTER the row exists
-- (0001 created it as a BEFORE trigger → FK violation on insert). Idempotent.
-- Also removes any partial seed data so seed.sql can be re-run cleanly.
-- =====================================================================
delete from public.organizations where slug = 'daystar';
delete from auth.users where email in ('kai@daystar.tw','lucas@daystar.tw','alexander@daystar.tw');

drop trigger if exists business_systems_history on public.business_systems;
drop trigger if exists business_systems_status  on public.business_systems;

-- BEFORE: keep status in sync with the score; stamp last_reviewed_at when the score changes
create or replace function public.business_systems_after_score()
returns trigger language plpgsql as $$
begin
  new.status = case when new.score >= 4 then 'healthy' when new.score >= 2 then 'at_risk' else 'critical' end;
  if tg_op = 'INSERT' then
    new.last_reviewed_at = coalesce(new.last_reviewed_at, now());
  elsif new.score is distinct from old.score then
    new.last_reviewed_at = now();
  end if;
  new.updated_at = now();
  return new;
end $$;

-- AFTER: append to the score history (row now exists, FK is satisfied)
create or replace function public.record_system_score()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.score is distinct from old.score then
    insert into public.system_scores (business_system_id, score, scored_by) values (new.id, new.score, auth.uid());
  end if;
  return new;
end $$;

create trigger business_systems_status  before insert or update of score on public.business_systems
  for each row execute procedure public.business_systems_after_score();
create trigger business_systems_history after  insert or update of score on public.business_systems
  for each row execute procedure public.record_system_score();
