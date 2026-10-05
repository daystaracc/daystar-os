-- =====================================================================
-- DAYSTAR OS — content pillars + collapse the content pipeline to 4 stages  (0012)
--
-- Decision record (2026-10-02): Lucas asked for the Content module to match a
-- standalone prototype artifact he'd built (dark/gold "content calendar" with a
-- `pillars` taxonomy and a 4-stage idea → planned → shot → posted pipeline). The
-- first ask was "just restyle" (done — see the `.content-theme` CSS work and
-- content/layout.tsx) and the real 8-stage pipeline was kept untouched then.
-- Lucas then explicitly confirmed he wants to go further: "Yes — make it exactly
-- like the artifact" — collapse the real pipeline to the artifact's 4 values AND
-- add `pillars` as the main way content gets categorized. This is that schema
-- change. It is NOT additive: `content.status` genuinely drops from 8 values to 4.
--
-- pillars
-- -------
-- A small, org-owned list of content buckets (e.g. "founder education", "creator
-- seeding" — Lucas has NOT told us the actual names yet, so none are seeded here;
-- he creates his own via the new "Manage pillars" UI). Each pillar carries a color
-- *key*, not a freeform hex value — same "design tokens only" discipline the rest
-- of the app follows; the fixed key list below is rendered through new `--ct-pillar-*`
-- custom properties scoped under `.content-theme` in globals.css, not an arbitrary
-- color the UI would have to invent per-request.
--
-- RLS mirrors `campaigns` (both are a content-marketing taxonomy owned by the org,
-- not org-structure like `departments`): any active member can read; creating or
-- renaming/recoloring is manager-or-above; deleting is founder-only. This is the
-- same shape the 0002 generic-loop produces for `campaigns`, written out by hand
-- here since the loop itself lives in 0002 and isn't re-run by later migrations.
--
-- content.status collapse
-- ------------------------
-- Mapping from the old 8 stages to the new 4, applied to every existing row before
-- the old CHECK constraint is dropped and the new one added:
--   idea            -> idea     (still nothing done)
--   script          -> planned  (writing/pre-production, not shot yet)
--   ready_to_shoot  -> planned
--   shot            -> shot     (footage/photo exists)
--   editing         -> shot     (post-production on already-shot material)
--   review          -> shot
--   scheduled       -> shot     (shot and queued, just not live yet)
--   published       -> posted
-- `published_at` (stamped the first time a piece reached `published`) is untouched
-- — it keeps meaning "when this went live", now checked against `status = 'posted'`
-- instead of `'published'` (see updateContentStatus in content/actions.ts).
--
-- The old CHECK constraint is looked up by its actual definition (not assumed to be
-- named `content_status_check`) so this migration can't silently no-op if Postgres
-- ever named it something else.
--
-- Re-runnable: every statement is guarded; the data UPDATE is idempotent because it
-- only ever maps old-vocabulary values forward (a row already on 'idea'/'planned'/
-- 'shot'/'posted' is left alone by the CASE's ELSE branch).
-- =====================================================================

create table if not exists public.pillars (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  name_zh         text,
  color           text not null default 'gold' check (color in ('gold','rose','sage','sky','violet','bronze','ember','slate')),
  sort_order      int not null default 0,
  created_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, name)
);

alter table public.content
  add column if not exists pillar_id uuid references public.pillars(id) on delete set null;

create index if not exists content_pillar_idx on public.content (organization_id, pillar_id);

drop trigger if exists pillars_set_updated_at on public.pillars;
create trigger pillars_set_updated_at before update on public.pillars
  for each row execute procedure public.set_updated_at();

alter table public.pillars enable row level security;
drop policy if exists pillars_select on public.pillars;
drop policy if exists pillars_insert on public.pillars;
drop policy if exists pillars_update on public.pillars;
drop policy if exists pillars_delete on public.pillars;
create policy pillars_select on public.pillars for select using (organization_id in (select public.auth_org_ids()));
create policy pillars_insert on public.pillars for insert with check (public.is_manager_or_above(organization_id));
create policy pillars_update on public.pillars for update
  using (public.is_manager_or_above(organization_id)) with check (public.is_manager_or_above(organization_id));
create policy pillars_delete on public.pillars for delete using (public.is_founder(organization_id));

-- ---- status collapse: find and drop the real old constraint, migrate the data,
-- ---- then add the new 4-value constraint -----------------------------------
do $$
declare
  old_check_name text;
begin
  select con.conname into old_check_name
  from pg_constraint con
  join pg_class cls on cls.oid = con.conrelid
  join pg_namespace ns on ns.oid = cls.relnamespace
  where ns.nspname = 'public'
    and cls.relname = 'content'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%status%published%';

  if old_check_name is not null then
    execute format('alter table public.content drop constraint %I', old_check_name);
  end if;
end $$;

update public.content set status = case status
  when 'idea' then 'idea'
  when 'script' then 'planned'
  when 'ready_to_shoot' then 'planned'
  when 'shot' then 'shot'
  when 'editing' then 'shot'
  when 'review' then 'shot'
  when 'scheduled' then 'shot'
  when 'published' then 'posted'
  else status
end
where status in ('idea','script','ready_to_shoot','shot','editing','review','scheduled','published')
  and status not in ('idea','planned','shot','posted');

alter table public.content alter column status set default 'idea';
alter table public.content drop constraint if exists content_status_check4;
alter table public.content add constraint content_status_check4 check (status in ('idea','planned','shot','posted'));

comment on column public.content.status is
  'Collapsed 2026-10-02 (migration 0012) from an 8-stage production pipeline to idea/planned/shot/posted, matching the artifact-based content calendar redesign. See this migration''s header comment for the old->new mapping.';
comment on table public.pillars is
  'Content-marketing categorization buckets (e.g. "founder education"), added 2026-10-02 alongside the status collapse. Org-owned list, created through the Content module''s "Manage pillars" UI — nothing is seeded here.';
