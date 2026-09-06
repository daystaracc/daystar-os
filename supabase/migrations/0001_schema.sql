-- =====================================================================
-- DAYSTAR OS — schema  (0001)
-- Postgres 15 / Supabase. Run in the Supabase SQL editor (or `supabase db push`).
-- Conventions: uuid PKs, organization_id on all business data, created_at /
-- updated_at / created_by, text status columns with CHECK constraints,
-- indexes on organization_id + the columns screens filter on.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- organization & people
-- ---------------------------------------------------------------------
create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  currency    text not null default 'TWD',
  timezone    text not null default 'Asia/Taipei',
  locale      text not null default 'zh-Hant' check (locale in ('zh-Hant','en')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  full_name    text not null default '',
  display_name text,
  email        text,
  avatar_url   text,
  locale       text not null default 'zh-Hant' check (locale in ('zh-Hant','en')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- auto-create a profile for every auth user
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, display_name)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
          coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create table public.departments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key             text not null,
  name            text not null,
  name_zh         text,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  unique (organization_id, key)
);

create table public.memberships (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  role            text not null check (role in ('founder','manager','member')),
  department_id   uuid references public.departments(id) on delete set null,
  title           text,
  manager_id      uuid references public.profiles(id) on delete set null,
  start_date      date,
  status          text not null default 'active' check (status in ('active','inactive')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, profile_id)
);
create index memberships_org_idx on public.memberships (organization_id, status);
create index memberships_profile_idx on public.memberships (profile_id);

-- ---------------------------------------------------------------------
-- targets (every target in the product is editable data, never hardcoded)
-- ---------------------------------------------------------------------
create table public.targets (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  metric          text not null,          -- e.g. monthly_revenue, weekly_content, aov, cvr, gross_margin, repeat_revenue
  period_type     text not null check (period_type in ('day','week','month','quarter','year')),
  period_start    date not null,
  period_end      date not null,
  value           numeric not null,
  unit            text not null default 'TWD' check (unit in ('TWD','percent','count','ratio','days')),
  notes           text,
  created_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, metric, period_start)
);
create index targets_lookup_idx on public.targets (organization_id, metric, period_start);

-- ---------------------------------------------------------------------
-- goals → objectives → key results
-- ---------------------------------------------------------------------
create table public.goals (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title           text not null,
  title_zh        text,
  description     text,
  level           text not null check (level in ('company','annual','quarterly','monthly')),
  status          text not null default 'on_track' check (status in ('on_track','at_risk','off_track','completed','draft')),
  owner_id        uuid references public.profiles(id),
  start_date      date,
  end_date        date,
  parent_id       uuid references public.goals(id) on delete set null,
  sort_order      int not null default 0,
  created_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index goals_org_idx on public.goals (organization_id, status);

create table public.objectives (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  goal_id         uuid not null references public.goals(id) on delete cascade,
  title           text not null,
  title_zh        text,
  description     text,
  owner_id        uuid references public.profiles(id),
  period_type     text not null check (period_type in ('annual','quarterly','monthly')),
  start_date      date,
  end_date        date,
  status          text not null default 'on_track' check (status in ('on_track','at_risk','off_track','completed','draft')),
  sort_order      int not null default 0,
  created_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index objectives_goal_idx on public.objectives (goal_id);

create table public.key_results (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  objective_id    uuid not null references public.objectives(id) on delete cascade,
  title           text not null,
  title_zh        text,
  metric          text,                   -- optional link to a targets.metric / calculated metric
  unit            text not null default 'count' check (unit in ('TWD','percent','count','ratio','days')),
  direction       text not null default 'increase' check (direction in ('increase','decrease')),
  start_value     numeric not null default 0,
  current_value   numeric not null default 0,
  target_value    numeric not null,
  owner_id        uuid references public.profiles(id),
  deadline        date,
  status          text not null default 'on_track' check (status in ('on_track','at_risk','off_track','completed')),
  notes           text,
  last_updated_at timestamptz,
  created_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index key_results_objective_idx on public.key_results (objective_id);

-- ---------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------
create table public.projects (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  name_zh         text,
  description     text,
  owner_id        uuid references public.profiles(id),
  department_id   uuid references public.departments(id) on delete set null,
  goal_id         uuid references public.goals(id) on delete set null,
  objective_id    uuid references public.objectives(id) on delete set null,
  key_result_id   uuid references public.key_results(id) on delete set null,
  status          text not null default 'planning' check (status in ('planning','active','at_risk','blocked','completed','cancelled')),
  start_date      date,
  deadline        date,
  budget          numeric,
  notes           text,
  created_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  completed_at    timestamptz
);
create index projects_org_idx on public.projects (organization_id, status);

create table public.project_members (
  project_id  uuid not null references public.projects(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  role        text not null default 'member' check (role in ('owner','member')),
  primary key (project_id, profile_id)
);

-- ---------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------
create table public.task_labels (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  color           text not null default 'neutral',
  unique (organization_id, name)
);

create table public.tasks (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  project_id          uuid references public.projects(id) on delete set null,
  goal_id             uuid references public.goals(id) on delete set null,
  key_result_id       uuid references public.key_results(id) on delete set null,
  department_id       uuid references public.departments(id) on delete set null,
  title               text not null,
  description         text,
  owner_id            uuid references public.profiles(id),   -- accountable
  assignee_id         uuid references public.profiles(id),   -- doing the work
  priority            text not null default 'medium' check (priority in ('urgent','high','medium','low')),
  status              text not null default 'todo' check (status in ('backlog','todo','in_progress','blocked','review','done')),
  start_date          date,
  due_date            date,
  due_time            time,
  labels              text[] not null default '{}',
  recurring_rule      text,               -- null | 'daily' | 'weekdays' | 'weekly:FRI' | 'monthly:1' | 'monthly:last'
  recurring_parent_id uuid references public.tasks(id) on delete set null,
  sort_order          int not null default 0,
  created_by          uuid references public.profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  completed_at        timestamptz,
  completed_by        uuid references public.profiles(id)
);
create index tasks_org_status_idx   on public.tasks (organization_id, status);
create index tasks_assignee_idx     on public.tasks (assignee_id, status, due_date);
create index tasks_project_idx      on public.tasks (project_id, status);
create index tasks_due_idx          on public.tasks (organization_id, due_date) where status <> 'done';

-- done ⇄ completed_at kept in sync
create or replace function public.tasks_sync_completion()
returns trigger language plpgsql as $$
begin
  if new.status = 'done' and (old.status is distinct from 'done') then
    new.completed_at = now();
    new.completed_by = coalesce(new.completed_by, auth.uid());
  elsif new.status <> 'done' then
    new.completed_at = null;
    new.completed_by = null;
  end if;
  return new;
end $$;
create trigger tasks_sync_completion before update on public.tasks
  for each row execute procedure public.tasks_sync_completion();

create table public.task_assignees (
  task_id    uuid not null references public.tasks(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  primary key (task_id, profile_id)
);

create table public.task_checklists (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks(id) on delete cascade,
  title      text not null,
  is_done    boolean not null default false,
  sort_order int not null default 0
);
create index task_checklists_task_idx on public.task_checklists (task_id);

create table public.task_comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks(id) on delete cascade,
  author_id  uuid references public.profiles(id),
  body       text not null,
  created_at timestamptz not null default now()
);
create index task_comments_task_idx on public.task_comments (task_id, created_at);

create table public.task_dependencies (
  task_id            uuid not null references public.tasks(id) on delete cascade,
  depends_on_task_id uuid not null references public.tasks(id) on delete cascade,
  primary key (task_id, depends_on_task_id),
  check (task_id <> depends_on_task_id)
);

-- ---------------------------------------------------------------------
-- products & suppliers
-- ---------------------------------------------------------------------
create table public.suppliers (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  contact         text,
  lead_time_days  int,
  moq             int,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.products (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  name_zh         text,
  sku             text not null,
  category        text,
  collection      text,
  status          text not null default 'active' check (status in ('draft','active','low_stock','out_of_stock','discontinued')),
  tier            text not null default 'core' check (tier in ('entry','core','premium','high_ticket')),
  price           numeric not null default 0,
  cost            numeric not null default 0,
  weight_g        numeric,
  material        text,
  specification   text,
  color           text,
  size            text,
  supplier_id     uuid references public.suppliers(id) on delete set null,
  is_hero         boolean not null default false,
  launch_date     date,
  image_url       text,
  notes           text,
  created_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, sku)
);
create index products_org_idx  on public.products (organization_id, status);
create index products_hero_idx on public.products (organization_id) where is_hero;

create table public.product_variants (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  name        text not null,
  sku         text not null,
  price       numeric,
  cost        numeric,
  attributes  jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index product_variants_product_idx on public.product_variants (product_id);

-- ---------------------------------------------------------------------
-- inventory (with a mandatory audit trail: on_hand only changes via movements)
-- ---------------------------------------------------------------------
create table public.inventory (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  product_id        uuid not null references public.products(id) on delete cascade,
  on_hand           int not null default 0,
  reserved          int not null default 0,
  incoming          int not null default 0,
  safety_stock      int not null default 0,
  reorder_point     int not null default 0,
  moq               int,
  lead_time_days    int,
  unit_cost         numeric,
  abc_class         text check (abc_class in ('A','B','C')),
  incoming_eta      date,
  last_restocked_at date,
  last_counted_at   date,
  updated_at        timestamptz not null default now(),
  unique (organization_id, product_id)
);

create table public.inventory_movements (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id      uuid not null references public.products(id) on delete cascade,
  type            text not null check (type in ('purchase','restock','sale','return','adjustment','damage','sample','gift','count')),
  quantity        int not null,           -- signed: +in / -out
  unit_cost       numeric,
  reference       text,
  note            text,
  created_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now()
);
create index inventory_movements_product_idx on public.inventory_movements (product_id, created_at desc);
create index inventory_movements_org_idx     on public.inventory_movements (organization_id, created_at desc);

create or replace function public.apply_inventory_movement()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.inventory (organization_id, product_id, on_hand)
  values (new.organization_id, new.product_id, 0)
  on conflict (organization_id, product_id) do nothing;

  update public.inventory
     set on_hand = on_hand + new.quantity,
         last_restocked_at = case when new.type in ('purchase','restock') and new.quantity > 0 then current_date else last_restocked_at end,
         last_counted_at   = case when new.type = 'count' then current_date else last_counted_at end,
         updated_at = now()
   where organization_id = new.organization_id and product_id = new.product_id;

  update public.products p
     set status = case
           when p.status in ('draft','discontinued') then p.status
           when i.on_hand <= 0 then 'out_of_stock'
           when i.on_hand <= i.reorder_point then 'low_stock'
           else 'active' end
    from public.inventory i
   where i.product_id = p.id and p.id = new.product_id;
  return new;
end $$;
create trigger inventory_movements_apply after insert on public.inventory_movements
  for each row execute procedure public.apply_inventory_movement();

create table public.inventory_counts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id      uuid not null references public.products(id) on delete cascade,
  counted_qty     int not null,
  system_qty      int not null,
  variance        int generated always as (counted_qty - system_qty) stored,
  counted_by      uuid references public.profiles(id),
  counted_at      timestamptz not null default now(),
  note            text
);

-- ---------------------------------------------------------------------
-- sales (manual entry in v1; integrations write the same tables later)
-- ---------------------------------------------------------------------
create table public.sales_channels (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key             text not null check (key in ('website','shopee','other')),
  display_name    text not null,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (organization_id, key)
);

create table public.sales_daily (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  date               date not null,
  channel_id         uuid not null references public.sales_channels(id),
  orders             int not null default 0,
  gross_revenue      numeric not null default 0,
  refunds            numeric not null default 0,
  platform_fees      numeric not null default 0,
  net_revenue        numeric generated always as (gross_revenue - refunds - platform_fees) stored,
  sessions           int,
  new_customers      int,
  returning_customers int,
  notes              text,
  created_by         uuid references public.profiles(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (organization_id, date, channel_id)
);
create index sales_daily_org_date_idx on public.sales_daily (organization_id, date);

create table public.product_sales_daily (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  date            date not null,
  product_id      uuid not null references public.products(id) on delete cascade,
  units           int not null default 0,
  revenue         numeric not null default 0,
  created_at      timestamptz not null default now(),
  unique (organization_id, date, product_id)
);
create index product_sales_daily_idx on public.product_sales_daily (organization_id, product_id, date);

-- ---------------------------------------------------------------------
-- finance (management view, not accounting)
-- ---------------------------------------------------------------------
create table public.financial_monthly (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  month              date not null,           -- first day of month
  revenue            numeric not null default 0,
  cogs               numeric not null default 0,
  payment_fees       numeric not null default 0,
  shipping           numeric not null default 0,
  packaging          numeric not null default 0,
  advertising        numeric not null default 0,
  returns            numeric not null default 0,
  operating_expenses numeric not null default 0,
  cash_balance       numeric,
  inventory_value    numeric,
  notes              text,
  created_by         uuid references public.profiles(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (organization_id, month)
);

create table public.expenses (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  date            date not null,
  category        text not null,
  amount          numeric not null,
  vendor          text,
  note            text,
  created_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now()
);
create index expenses_org_date_idx on public.expenses (organization_id, date);

-- ---------------------------------------------------------------------
-- content OS
-- ---------------------------------------------------------------------
create table public.campaigns (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  objective       text,
  offer           text,
  start_date      date,
  end_date        date,
  budget          numeric,
  status          text not null default 'planning' check (status in ('planning','active','completed','cancelled')),
  project_id      uuid references public.projects(id) on delete set null,
  notes           text,
  created_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index campaigns_org_idx on public.campaigns (organization_id, status);

create table public.content (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title           text not null,
  concept         text,
  hook            text,
  content_type    text not null default 'short_video' check (content_type in ('short_video','photo','carousel','story','live','long_video','other')),
  platform        text not null default 'instagram' check (platform in ('instagram','tiktok','youtube_shorts','facebook','other')),
  owner_id        uuid references public.profiles(id),
  talent          text,
  product_id      uuid references public.products(id) on delete set null,
  campaign_id     uuid references public.campaigns(id) on delete set null,
  status          text not null default 'idea' check (status in ('idea','script','ready_to_shoot','shot','editing','review','scheduled','published')),
  shoot_date      date,
  publish_date    date,
  publish_time    time,
  url             text,
  thumbnail_url   text,
  notes           text,
  created_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  published_at    timestamptz
);
create index content_org_status_idx  on public.content (organization_id, status);
create index content_publish_idx     on public.content (organization_id, publish_date);

create table public.content_metrics (
  id                  uuid primary key default gen_random_uuid(),
  content_id          uuid not null references public.content(id) on delete cascade,
  captured_at         date not null default current_date,
  views               int not null default 0,
  retention_pct       numeric,
  likes               int not null default 0,
  comments            int not null default 0,
  shares              int not null default 0,
  saves               int not null default 0,
  clicks              int not null default 0,
  commerce_clicks     int not null default 0,
  attributed_revenue  numeric not null default 0,
  unique (content_id, captured_at)
);

-- ---------------------------------------------------------------------
-- marketing: paid ads & creators
-- ---------------------------------------------------------------------
create table public.campaign_metrics (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  date        date not null,
  revenue     numeric not null default 0,
  orders      int not null default 0,
  spend       numeric not null default 0,
  unique (campaign_id, date)
);

create table public.ad_spend_daily (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  date            date not null,
  platform        text not null check (platform in ('meta','tiktok','google','other')),
  spend           numeric not null default 0,
  impressions     int not null default 0,
  clicks          int not null default 0,
  purchases       int not null default 0,
  revenue         numeric not null default 0,
  created_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  unique (organization_id, date, platform)
);

create table public.creators (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  handle          text,
  platform        text not null default 'instagram' check (platform in ('instagram','tiktok','youtube','other')),
  followers       int,
  market          text not null default 'TW',
  category        text,
  contact         text,
  status          text not null default 'prospect' check (status in ('prospect','contacted','agreed','product_sent','content_pending','published','successful','inactive')),
  cost            numeric not null default 0,
  owner_id        uuid references public.profiles(id),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index creators_org_idx on public.creators (organization_id, status);

create table public.creator_content (
  id            uuid primary key default gen_random_uuid(),
  creator_id    uuid not null references public.creators(id) on delete cascade,
  content_id    uuid references public.content(id) on delete set null,
  product_id    uuid references public.products(id) on delete set null,
  products_sent text,
  url           text,
  published_at  date,
  views         int not null default 0,
  clicks        int not null default 0,
  sales         numeric not null default 0,
  cost          numeric not null default 0,
  note          text,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- CRM
-- ---------------------------------------------------------------------
create table public.customers (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  external_id     text,
  name            text,
  email           text,
  phone           text,
  line_id         text,
  first_order_at  date,
  last_order_at   date,
  orders_count    int not null default 0,
  total_spent     numeric not null default 0,
  tags            text[] not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index customers_org_idx on public.customers (organization_id, last_order_at desc);

create table public.crm_flows (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key             text not null check (key in ('welcome','abandoned_cart','post_purchase','review_request','cross_sell','winback','vip','launch','restock','birthday','lapsed','high_value')),
  name            text not null,
  channel         text not null default 'line' check (channel in ('line','email','sms','other')),
  status          text not null default 'planned' check (status in ('planned','draft','active','paused')),
  audience        text,
  messages_count  int not null default 0,
  sends           int not null default 0,
  conversions     int not null default 0,
  revenue         numeric not null default 0,
  owner_id        uuid references public.profiles(id),
  notes           text,
  last_updated_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, key)
);

create table public.crm_metrics_monthly (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  month               date not null,
  customers           int not null default 0,
  new_customers       int not null default 0,
  returning_customers int not null default 0,
  repeat_rate         numeric,
  repeat_revenue      numeric not null default 0,
  retention_revenue   numeric not null default 0,
  avg_orders          numeric,
  ltv                 numeric,
  created_at          timestamptz not null default now(),
  unique (organization_id, month)
);

-- ---------------------------------------------------------------------
-- operations
-- ---------------------------------------------------------------------
create table public.operations_daily (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references public.organizations(id) on delete cascade,
  date                    date not null,
  orders_waiting          int not null default 0,
  orders_shipped          int not null default 0,
  fulfillment_started_at  time,
  fulfillment_completed_at time,
  fulfillment_minutes     int,
  errors                  int not null default 0,
  returns                 int not null default 0,
  cs_pending              int not null default 0,
  cs_avg_response_minutes int,
  employee_id             uuid references public.profiles(id),
  notes                   text,
  created_by              uuid references public.profiles(id),
  created_at              timestamptz not null default now(),
  unique (organization_id, date)
);

create table public.customer_service_cases (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  customer_name    text,
  order_ref        text,
  channel          text not null default 'line' check (channel in ('line','instagram','email','shopee','other')),
  issue_type       text not null check (issue_type in ('shipping','return','exchange','defect','size','product_question','payment','other')),
  status           text not null default 'open' check (status in ('open','waiting','resolved','closed')),
  owner_id         uuid references public.profiles(id),
  created_at       timestamptz not null default now(),
  last_response_at timestamptz,
  resolved_at      timestamptz,
  resolution       text,
  notes            text
);
create index cs_cases_org_idx on public.customer_service_cases (organization_id, status);

-- ---------------------------------------------------------------------
-- business systems (health score 1–5, ownership matrix)
-- ---------------------------------------------------------------------
create table public.business_systems (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  key              text not null check (key in ('brand','content','product','cro','aov','crm','paid_ads','creators','supply_chain','team','finance')),
  name             text not null,
  name_zh          text,
  owner_id         uuid references public.profiles(id),
  future_owner     text,
  transfer_date    date,
  goal             text,
  bottleneck       text,
  next_action      text,
  score            smallint not null default 1 check (score between 1 and 5),
  status           text not null default 'at_risk' check (status in ('healthy','at_risk','critical')),
  last_reviewed_at timestamptz,
  sort_order       int not null default 0,
  updated_at       timestamptz not null default now(),
  unique (organization_id, key)
);

create table public.system_scores (
  id                 uuid primary key default gen_random_uuid(),
  business_system_id uuid not null references public.business_systems(id) on delete cascade,
  score              smallint not null check (score between 1 and 5),
  note               text,
  scored_by          uuid references public.profiles(id),
  scored_at          timestamptz not null default now()
);

-- keep status in sync with the score (BEFORE) …
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
create trigger business_systems_status before insert or update of score on public.business_systems
  for each row execute procedure public.business_systems_after_score();

-- … and keep history (AFTER, so the row exists for the foreign key)
create or replace function public.record_system_score()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.score is distinct from old.score then
    insert into public.system_scores (business_system_id, score, scored_by) values (new.id, new.score, auth.uid());
  end if;
  return new;
end $$;
create trigger business_systems_history after insert or update of score on public.business_systems
  for each row execute procedure public.record_system_score();

-- ---------------------------------------------------------------------
-- reviews (weekly / monthly business review)
-- ---------------------------------------------------------------------
create table public.reviews (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  type            text not null check (type in ('weekly','monthly')),
  period_start    date not null,
  period_end      date not null,
  status          text not null default 'draft' check (status in ('draft','completed')),
  wins            text,
  problems        text,
  decisions       text,
  priorities      text,
  answers         jsonb not null default '{}'::jsonb,   -- monthly review Q&A
  created_by      uuid references public.profiles(id),
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, type, period_start)
);

create table public.review_metrics (
  id             uuid primary key default gen_random_uuid(),
  review_id      uuid not null references public.reviews(id) on delete cascade,
  section        text not null check (section in ('growth','product','content','crm','operations','finance','team')),
  metric         text not null,
  value          numeric,
  previous_value numeric,
  note           text
);
create index review_metrics_review_idx on public.review_metrics (review_id);

-- ---------------------------------------------------------------------
-- SOPs
-- ---------------------------------------------------------------------
create table public.sops (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title           text not null,
  title_zh        text,
  category        text not null check (category in ('fulfillment','inventory','customer_service','content','marketing','product','finance','website','operations','management','other')),
  owner_id        uuid references public.profiles(id),
  version         int not null default 1,
  status          text not null default 'draft' check (status in ('draft','active','needs_review','archived')),
  content_md      text not null default '',
  created_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index sops_org_idx on public.sops (organization_id, category, status);

-- ---------------------------------------------------------------------
-- system: notifications, activity log, attachments, attention dismissals
-- ---------------------------------------------------------------------
create table public.notifications (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  recipient_id    uuid not null references public.profiles(id) on delete cascade,
  type            text not null,
  severity        text not null default 'medium' check (severity in ('critical','high','medium','low')),
  title           text not null,
  body            text,
  entity_type     text,
  entity_id       uuid,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index notifications_recipient_idx on public.notifications (recipient_id, read_at, created_at desc);

create table public.activity_logs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id        uuid references public.profiles(id),
  action          text not null,              -- created | updated | deleted | completed | ...
  entity_type     text not null,
  entity_id       uuid,
  summary         text not null,
  diff            jsonb,
  created_at      timestamptz not null default now()
);
create index activity_logs_org_idx on public.activity_logs (organization_id, created_at desc);

create table public.attachments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_type     text not null,
  entity_id       uuid not null,
  storage_path    text not null,
  file_name       text not null,
  mime_type       text,
  size_bytes      bigint,
  uploaded_by     uuid references public.profiles(id),
  created_at      timestamptz not null default now()
);
create index attachments_entity_idx on public.attachments (entity_type, entity_id);

-- "What needs attention" items are computed by rules at read time;
-- this table only stores what a user resolved/dismissed and until when.
create table public.attention_dismissals (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  rule_code       text not null,
  entity_id       uuid,
  action          text not null check (action in ('resolved','dismissed')),
  until_date      date,
  acted_by        uuid references public.profiles(id),
  created_at      timestamptz not null default now()
);
create index attention_dismissals_idx on public.attention_dismissals (organization_id, rule_code, entity_id);

-- ---------------------------------------------------------------------
-- activity log triggers (financial and inventory changes must be traceable)
-- ---------------------------------------------------------------------
create or replace function public.log_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r jsonb; o jsonb; v_action text; v_summary text; v_sku text;
begin
  r := to_jsonb(coalesce(new, old));
  o := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  v_action := case tg_op when 'INSERT' then 'created' when 'DELETE' then 'deleted' else 'updated' end;
  if tg_table_name = 'tasks' and tg_op = 'UPDATE' and (r->>'status') = 'done' and (o->>'status') <> 'done' then v_action := 'completed'; end if;

  v_summary := case tg_table_name
    when 'tasks' then v_action || ' task: ' || coalesce(r->>'title','')
    when 'projects' then v_action || ' project: ' || coalesce(r->>'name','')
    when 'inventory_movements' then
      (select 'Inventory ' || (r->>'type') || ' ' || (r->>'quantity') || ' (' || coalesce(p.sku,'?') || ')' from public.products p where p.id = (r->>'product_id')::uuid)
    when 'sales_daily' then v_action || ' revenue entry for ' || coalesce(r->>'date','')
    when 'targets' then v_action || ' target ' || coalesce(r->>'metric','') || ' = ' || coalesce(r->>'value','')
    when 'financial_monthly' then v_action || ' monthly finance for ' || left(coalesce(r->>'month',''), 7)
    when 'key_results' then v_action || ' key result: ' || coalesce(r->>'title','')
    when 'business_systems' then 'Scored system ' || coalesce(r->>'key','') || ' = ' || coalesce(r->>'score','')
    else v_action || ' ' || tg_table_name end;

  insert into public.activity_logs (organization_id, actor_id, action, entity_type, entity_id, summary, diff)
  values ((r->>'organization_id')::uuid, auth.uid(), v_action, tg_table_name, (r->>'id')::uuid, coalesce(v_summary, v_action),
          case when tg_op = 'UPDATE' then jsonb_build_object('before', o, 'after', r) else null end);
  return coalesce(new, old);
end $$;

create trigger log_tasks               after insert or update of status, assignee_id, due_date on public.tasks for each row execute procedure public.log_activity();
create trigger log_projects            after insert or update of status, deadline, owner_id on public.projects for each row execute procedure public.log_activity();
create trigger log_inventory_movements after insert on public.inventory_movements for each row execute procedure public.log_activity();
create trigger log_sales_daily         after insert or update on public.sales_daily for each row execute procedure public.log_activity();
create trigger log_targets             after insert or update or delete on public.targets for each row execute procedure public.log_activity();
create trigger log_financial_monthly   after insert or update on public.financial_monthly for each row execute procedure public.log_activity();
create trigger log_key_results         after update of current_value, target_value, status on public.key_results for each row execute procedure public.log_activity();
create trigger log_business_systems    after update of score on public.business_systems for each row execute procedure public.log_activity();

-- ---------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['organizations','profiles','memberships','targets','goals','objectives','key_results','projects','tasks',
    'suppliers','products','sales_daily','financial_monthly','campaigns','content','creators','customers','crm_flows','sops','reviews']
  loop
    execute format('create trigger %I_set_updated_at before update on public.%I for each row execute procedure public.set_updated_at()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- read views used by screens (aggregation stays in the database)
-- ---------------------------------------------------------------------
create or replace view public.v_project_progress with (security_invoker = true) as
select p.id as project_id, p.organization_id,
       count(t.id) filter (where t.status <> 'backlog')                       as total_tasks,
       count(t.id) filter (where t.status = 'done')                           as done_tasks,
       count(t.id) filter (where t.status <> 'done' and t.due_date < current_date) as overdue_tasks,
       count(t.id) filter (where t.status = 'blocked')                        as blocked_tasks,
       case when count(t.id) filter (where t.status <> 'backlog') = 0 then 0
            else round(100.0 * count(t.id) filter (where t.status = 'done') / count(t.id) filter (where t.status <> 'backlog')) end as progress_pct
  from public.projects p
  left join public.tasks t on t.project_id = p.id
 group by p.id, p.organization_id;

create or replace view public.v_sales_daily_total with (security_invoker = true) as
select organization_id, date,
       sum(orders) as orders, sum(gross_revenue) as gross_revenue, sum(refunds) as refunds,
       sum(platform_fees) as platform_fees, sum(net_revenue) as net_revenue, sum(sessions) as sessions,
       case when sum(orders) > 0 then round(sum(gross_revenue) / sum(orders)) else null end as aov
  from public.sales_daily
 group by organization_id, date;

create or replace view public.v_product_sales_30d with (security_invoker = true) as
select ps.organization_id, ps.product_id,
       sum(ps.units) as units_30d, sum(ps.revenue) as revenue_30d,
       round(sum(ps.units) / 30.0, 2) as units_per_day
  from public.product_sales_daily ps
 where ps.date >= current_date - interval '30 days'
 group by ps.organization_id, ps.product_id;
