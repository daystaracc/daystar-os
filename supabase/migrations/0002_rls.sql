-- =====================================================================
-- DAYSTAR OS — row level security  (0002)
-- Roles: founder (admin) / manager / member.  Enforced in the database,
-- never only in the UI.  Service-role key is server-only.
-- =====================================================================

-- ---------------------------------------------------------------------
-- helpers (security definer, stable → cheap inside policies)
-- ---------------------------------------------------------------------
create or replace function public.auth_org_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select organization_id from public.memberships
   where profile_id = auth.uid() and status = 'active'
$$;

create or replace function public.auth_role(org uuid)
returns text language sql stable security definer set search_path = public as $$
  select role from public.memberships
   where profile_id = auth.uid() and organization_id = org and status = 'active'
   limit 1
$$;

create or replace function public.is_founder(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.auth_role(org) = 'founder', false)
$$;

create or replace function public.is_manager_or_above(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.auth_role(org) in ('founder','manager'), false)
$$;

create or replace function public.is_member(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.auth_role(org) in ('founder','manager','member'), false)
$$;

grant execute on function public.auth_org_ids(), public.auth_role(uuid), public.is_founder(uuid),
  public.is_manager_or_above(uuid), public.is_member(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- organizations / profiles / departments / memberships
-- ---------------------------------------------------------------------
alter table public.organizations enable row level security;
create policy organizations_select on public.organizations for select using (id in (select public.auth_org_ids()));
create policy organizations_update on public.organizations for update using (public.is_founder(id));

alter table public.profiles enable row level security;
create policy profiles_select on public.profiles for select using (
  id = auth.uid()
  or exists (select 1 from public.memberships m
              where m.profile_id = profiles.id and m.organization_id in (select public.auth_org_ids()))
);
create policy profiles_update_own on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

alter table public.departments enable row level security;
create policy departments_select on public.departments for select using (organization_id in (select public.auth_org_ids()));
create policy departments_write  on public.departments for all using (public.is_founder(organization_id)) with check (public.is_founder(organization_id));

alter table public.memberships enable row level security;
create policy memberships_select on public.memberships for select using (organization_id in (select public.auth_org_ids()));
create policy memberships_write  on public.memberships for all using (public.is_founder(organization_id)) with check (public.is_founder(organization_id));

-- ---------------------------------------------------------------------
-- generic policies for organization-scoped tables
--   read:  every active member of the organization
--   write: managers and founders
-- (tables that need different rules are handled below)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'goals','objectives','key_results','projects','task_labels',
    'suppliers','products','inventory','inventory_counts',
    'campaigns','creators','crm_flows','crm_metrics_monthly',
    'operations_daily','customer_service_cases','business_systems','reviews','sops','attachments','attention_dismissals','product_sales_daily']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select using (organization_id in (select public.auth_org_ids()))', t || '_select', t);
    execute format('create policy %I on public.%I for insert with check (public.is_manager_or_above(organization_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update using (public.is_manager_or_above(organization_id)) with check (public.is_manager_or_above(organization_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete using (public.is_founder(organization_id))', t || '_delete', t);
  end loop;
end $$;

-- targets: everyone can read, only founders change goals/targets
alter table public.targets enable row level security;
create policy targets_select on public.targets for select using (organization_id in (select public.auth_org_ids()));
create policy targets_write  on public.targets for all using (public.is_founder(organization_id)) with check (public.is_founder(organization_id));

-- tasks: any member may create; update if you own it, are assigned, created it, or are a manager+
alter table public.tasks enable row level security;
create policy tasks_select on public.tasks for select using (organization_id in (select public.auth_org_ids()));
create policy tasks_insert on public.tasks for insert with check (public.is_member(organization_id));
-- The task_assignees check goes through a security-definer helper: inlining it as a
-- subquery makes Postgres expand tasks -> task_assignees -> tasks and refuse to plan
-- any UPDATE (42P17, infinite recursion). See migration 0004.
create or replace function public.is_task_assignee(t uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.task_assignees ta where ta.task_id = t and ta.profile_id = auth.uid())
$$;
grant execute on function public.is_task_assignee(uuid) to authenticated;

create policy tasks_update on public.tasks for update
  using (public.is_manager_or_above(organization_id) or owner_id = auth.uid() or assignee_id = auth.uid() or created_by = auth.uid()
         or public.is_task_assignee(id))
  with check (public.is_member(organization_id));
create policy tasks_delete on public.tasks for delete using (public.is_manager_or_above(organization_id) or created_by = auth.uid());

-- task children: follow the parent task's visibility; members can write on tasks they can see
alter table public.task_assignees enable row level security;
create policy task_assignees_all on public.task_assignees for all
  using (exists (select 1 from public.tasks t where t.id = task_id and t.organization_id in (select public.auth_org_ids())))
  with check (exists (select 1 from public.tasks t where t.id = task_id and t.organization_id in (select public.auth_org_ids())));

alter table public.task_checklists enable row level security;
create policy task_checklists_all on public.task_checklists for all
  using (exists (select 1 from public.tasks t where t.id = task_id and t.organization_id in (select public.auth_org_ids())))
  with check (exists (select 1 from public.tasks t where t.id = task_id and t.organization_id in (select public.auth_org_ids())));

alter table public.task_comments enable row level security;
create policy task_comments_select on public.task_comments for select
  using (exists (select 1 from public.tasks t where t.id = task_id and t.organization_id in (select public.auth_org_ids())));
create policy task_comments_insert on public.task_comments for insert
  with check (author_id = auth.uid() and exists (select 1 from public.tasks t where t.id = task_id and t.organization_id in (select public.auth_org_ids())));
create policy task_comments_update on public.task_comments for update using (author_id = auth.uid());
create policy task_comments_delete on public.task_comments for delete using (author_id = auth.uid());

alter table public.task_dependencies enable row level security;
create policy task_dependencies_all on public.task_dependencies for all
  using (exists (select 1 from public.tasks t where t.id = task_id and t.organization_id in (select public.auth_org_ids())))
  with check (exists (select 1 from public.tasks t where t.id = task_id and t.organization_id in (select public.auth_org_ids())));

-- project members
alter table public.project_members enable row level security;
create policy project_members_select on public.project_members for select
  using (exists (select 1 from public.projects p where p.id = project_id and p.organization_id in (select public.auth_org_ids())));
create policy project_members_write on public.project_members for all
  using (exists (select 1 from public.projects p where p.id = project_id and public.is_manager_or_above(p.organization_id)))
  with check (exists (select 1 from public.projects p where p.id = project_id and public.is_manager_or_above(p.organization_id)));

-- product variants follow the product
alter table public.product_variants enable row level security;
create policy product_variants_select on public.product_variants for select
  using (exists (select 1 from public.products p where p.id = product_id and p.organization_id in (select public.auth_org_ids())));
create policy product_variants_write on public.product_variants for all
  using (exists (select 1 from public.products p where p.id = product_id and public.is_manager_or_above(p.organization_id)))
  with check (exists (select 1 from public.products p where p.id = product_id and public.is_manager_or_above(p.organization_id)));

-- inventory movements: every member can record a movement (fulfillment staff adjust stock);
-- movements are append-only — no update / delete for anyone (audit trail)
alter table public.inventory_movements enable row level security;
create policy inventory_movements_select on public.inventory_movements for select using (organization_id in (select public.auth_org_ids()));
create policy inventory_movements_insert on public.inventory_movements for insert
  with check (public.is_member(organization_id) and created_by = auth.uid());

-- content: members may create content and edit their own; managers+ edit all
alter table public.content enable row level security;
create policy content_select on public.content for select using (organization_id in (select public.auth_org_ids()));
create policy content_insert on public.content for insert with check (public.is_member(organization_id));
create policy content_update on public.content for update
  using (public.is_manager_or_above(organization_id) or owner_id = auth.uid() or created_by = auth.uid())
  with check (public.is_member(organization_id));
create policy content_delete on public.content for delete using (public.is_manager_or_above(organization_id));

alter table public.content_metrics enable row level security;
create policy content_metrics_all on public.content_metrics for all
  using (exists (select 1 from public.content c where c.id = content_id and c.organization_id in (select public.auth_org_ids())))
  with check (exists (select 1 from public.content c where c.id = content_id and c.organization_id in (select public.auth_org_ids())));

alter table public.campaign_metrics enable row level security;
create policy campaign_metrics_select on public.campaign_metrics for select
  using (exists (select 1 from public.campaigns c where c.id = campaign_id and c.organization_id in (select public.auth_org_ids())));
create policy campaign_metrics_write on public.campaign_metrics for all
  using (exists (select 1 from public.campaigns c where c.id = campaign_id and public.is_manager_or_above(c.organization_id)))
  with check (exists (select 1 from public.campaigns c where c.id = campaign_id and public.is_manager_or_above(c.organization_id)));

alter table public.creator_content enable row level security;
create policy creator_content_select on public.creator_content for select
  using (exists (select 1 from public.creators c where c.id = creator_id and c.organization_id in (select public.auth_org_ids())));
create policy creator_content_write on public.creator_content for all
  using (exists (select 1 from public.creators c where c.id = creator_id and public.is_manager_or_above(c.organization_id)))
  with check (exists (select 1 from public.creators c where c.id = creator_id and public.is_manager_or_above(c.organization_id)));

alter table public.system_scores enable row level security;
create policy system_scores_select on public.system_scores for select
  using (exists (select 1 from public.business_systems b where b.id = business_system_id and b.organization_id in (select public.auth_org_ids())));

alter table public.review_metrics enable row level security;
create policy review_metrics_all on public.review_metrics for all
  using (exists (select 1 from public.reviews r where r.id = review_id and public.is_manager_or_above(r.organization_id)))
  with check (exists (select 1 from public.reviews r where r.id = review_id and public.is_manager_or_above(r.organization_id)));

-- ---------------------------------------------------------------------
-- revenue: founders + managers.  finance & expenses & customers: founders only.
-- ---------------------------------------------------------------------
alter table public.sales_channels enable row level security;
create policy sales_channels_select on public.sales_channels for select using (organization_id in (select public.auth_org_ids()));
create policy sales_channels_write  on public.sales_channels for all using (public.is_founder(organization_id)) with check (public.is_founder(organization_id));

alter table public.sales_daily enable row level security;
create policy sales_daily_select on public.sales_daily for select using (public.is_manager_or_above(organization_id));
create policy sales_daily_write  on public.sales_daily for all using (public.is_manager_or_above(organization_id)) with check (public.is_manager_or_above(organization_id));

alter table public.ad_spend_daily enable row level security;
create policy ad_spend_daily_select on public.ad_spend_daily for select using (public.is_manager_or_above(organization_id));
create policy ad_spend_daily_write  on public.ad_spend_daily for all using (public.is_manager_or_above(organization_id)) with check (public.is_manager_or_above(organization_id));

alter table public.financial_monthly enable row level security;
create policy financial_monthly_all on public.financial_monthly for all using (public.is_founder(organization_id)) with check (public.is_founder(organization_id));

alter table public.expenses enable row level security;
create policy expenses_all on public.expenses for all using (public.is_founder(organization_id)) with check (public.is_founder(organization_id));

alter table public.customers enable row level security;
create policy customers_all on public.customers for all using (public.is_founder(organization_id)) with check (public.is_founder(organization_id));

-- ---------------------------------------------------------------------
-- notifications: recipient only.  activity log: read by managers+, written by triggers.
-- ---------------------------------------------------------------------
alter table public.notifications enable row level security;
create policy notifications_select on public.notifications for select using (recipient_id = auth.uid());
create policy notifications_update on public.notifications for update using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

alter table public.activity_logs enable row level security;
create policy activity_logs_select on public.activity_logs for select using (public.is_manager_or_above(organization_id));
-- no insert/update/delete policies: rows are written only by security-definer triggers

-- ---------------------------------------------------------------------
-- views inherit RLS through security_invoker; grant usage to app role
-- ---------------------------------------------------------------------
grant select on public.v_project_progress, public.v_sales_daily_total, public.v_product_sales_30d to authenticated;
