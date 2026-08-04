-- Bynex core schema. The application is multi-tenant by construction: every
-- business record carries organization_id and every exposed table uses RLS.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 160),
  organization_number text,
  status text not null default 'active' check (status in ('trial', 'active', 'suspended', 'closed')),
  plan_code text not null default 'pilot',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_memberships (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'office', 'worker', 'finance', 'viewer')),
  status text not null default 'active' check (status in ('invited', 'active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create or replace function private.has_org_access(
  requested_organization_id uuid,
  allowed_roles text[] default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = requested_organization_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and (allowed_roles is null or membership.role = any(allowed_roles))
  );
$$;

revoke all on function private.has_org_access(uuid, text[]) from public;
grant execute on function private.has_org_access(uuid, text[]) to authenticated;

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  kind text not null default 'person' check (kind in ('person', 'company', 'association', 'public_body')),
  name text not null check (length(btrim(name)) between 2 and 200),
  email text,
  phone text,
  billing_address jsonb not null default '{}'::jsonb,
  work_address jsonb not null default '{}'::jsonb,
  external_reference text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  customer_id uuid not null,
  number bigint generated always as identity,
  version integer not null default 1 check (version > 0),
  title text not null check (length(btrim(title)) between 2 and 240),
  scope text not null default '',
  price_mode text not null default 'fixed' check (price_mode in ('fixed', 'estimated', 'running')),
  subtotal_minor bigint not null default 0 check (subtotal_minor >= 0),
  currency text not null default 'SEK' check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'declined', 'expired', 'cancelled')),
  sent_at timestamptz,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id),
  locked_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  constraint quotes_customer_fk foreign key (organization_id, customer_id)
    references public.customers(organization_id, id)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  customer_id uuid not null,
  quote_id uuid,
  code text not null,
  name text not null check (length(btrim(name)) between 2 and 240),
  status text not null default 'planned' check (status in ('planned', 'active', 'paused', 'completed', 'cancelled')),
  starts_on date,
  completed_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, code),
  constraint projects_customer_fk foreign key (organization_id, customer_id)
    references public.customers(organization_id, id),
  constraint projects_quote_fk foreign key (organization_id, quote_id)
    references public.quotes(organization_id, id)
);

create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  project_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users(id),
  work_date date not null default current_date,
  minutes integer not null check (minutes > 0 and minutes <= 1440),
  description text not null default '',
  billable boolean not null default true,
  hourly_rate_minor integer check (hourly_rate_minor >= 0),
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint time_entries_project_fk foreign key (organization_id, project_id)
    references public.projects(organization_id, id)
);

create table public.material_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  project_id uuid not null,
  description text not null check (length(btrim(description)) between 1 and 500),
  quantity numeric(14,3) not null default 1 check (quantity > 0),
  unit text not null default 'st',
  cost_minor bigint check (cost_minor >= 0),
  billable_minor bigint not null check (billable_minor >= 0),
  source text not null default 'manual' check (source in ('manual', 'supplier_invoice', 'catalogue', 'order')),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint material_entries_project_fk foreign key (organization_id, project_id)
    references public.projects(organization_id, id)
);

create table public.change_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  project_id uuid not null,
  description text not null check (length(btrim(description)) between 2 and 2000),
  work_status text not null default 'pending_start' check (work_status in ('pending_start', 'authorized', 'in_progress', 'completed', 'cancelled')),
  price_status text not null default 'pending' check (price_status in ('pending', 'estimated', 'reviewed', 'customer_approved', 'rejected')),
  estimated_minor bigint check (estimated_minor >= 0),
  reviewed_minor bigint check (reviewed_minor >= 0),
  price_mode text check (price_mode in ('fixed', 'estimated', 'running')),
  start_authorized_at timestamptz,
  start_authorized_by uuid references auth.users(id),
  human_reviewed_at timestamptz,
  human_reviewed_by uuid references auth.users(id),
  customer_approved_at timestamptz,
  customer_approved_by uuid references auth.users(id),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  constraint change_orders_project_fk foreign key (organization_id, project_id)
    references public.projects(organization_id, id),
  constraint estimated_price_has_amount check (price_status <> 'estimated' or estimated_minor is not null),
  constraint approved_price_is_reviewed check (
    price_status <> 'customer_approved'
    or (human_reviewed_at is not null and customer_approved_at is not null and reviewed_minor is not null)
  )
);

create table public.invoice_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  request_key uuid not null default gen_random_uuid(),
  project_id uuid,
  customer_id uuid not null,
  status text not null default 'draft' check (status in ('draft', 'ready', 'issued', 'void')),
  currency text not null default 'SEK' check (currency ~ '^[A-Z]{3}$'),
  subtotal_minor bigint not null default 0 check (subtotal_minor >= 0),
  vat_minor bigint not null default 0 check (vat_minor >= 0),
  total_minor bigint not null default 0 check (total_minor = subtotal_minor + vat_minor),
  source_snapshot jsonb not null default '{}'::jsonb,
  locked_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, request_key),
  constraint invoice_drafts_project_fk foreign key (organization_id, project_id)
    references public.projects(organization_id, id),
  constraint invoice_drafts_customer_fk foreign key (organization_id, customer_id)
    references public.customers(organization_id, id)
);

create table public.portal_memberships (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'customer' check (role in ('customer', 'property_owner', 'tenant', 'consultant')),
  status text not null default 'active' check (status in ('invited', 'active', 'revoked')),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id),
  constraint portal_memberships_project_fk foreign key (organization_id, project_id)
    references public.projects(organization_id, id)
);

create or replace function private.can_view_portal(
  requested_organization_id uuid,
  requested_project_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_org_access(requested_organization_id)
    or exists (
      select 1
      from public.portal_memberships portal_member
      where portal_member.organization_id = requested_organization_id
        and portal_member.project_id = requested_project_id
        and portal_member.user_id = (select auth.uid())
        and portal_member.status = 'active'
    );
$$;

revoke all on function private.can_view_portal(uuid, uuid) from public;
grant execute on function private.can_view_portal(uuid, uuid) to authenticated;

create table public.portal_publications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  project_id uuid not null,
  event_type text not null check (event_type in ('milestone', 'check_in', 'check_out', 'photo', 'document', 'change_order', 'delivery', 'installation', 'handover')),
  title text not null check (length(btrim(title)) between 1 and 240),
  customer_payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  status text not null default 'draft' check (status in ('draft', 'published', 'withdrawn')),
  published_at timestamptz,
  published_by uuid references auth.users(id),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portal_publications_project_fk foreign key (organization_id, project_id)
    references public.projects(organization_id, id),
  constraint published_event_has_audit check (status <> 'published' or (published_at is not null and published_by is not null))
);

create table public.outbox_jobs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id),
  kind text not null,
  aggregate_type text not null,
  aggregate_id uuid not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed', 'dead_letter')),
  attempts smallint not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id),
  actor_user_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Composite indexes lead with organization_id so normal tenant-scoped queries
-- stay selective at the intended 10,000-company scale.
create index organization_memberships_user_idx on public.organization_memberships (user_id, status, organization_id);
create index customers_org_status_name_idx on public.customers (organization_id, status, name, id);
create index quotes_org_status_created_idx on public.quotes (organization_id, status, created_at desc, id);
create index projects_org_status_updated_idx on public.projects (organization_id, status, updated_at desc, id);
create index time_entries_org_project_date_idx on public.time_entries (organization_id, project_id, work_date desc, id);
create index time_entries_org_user_date_idx on public.time_entries (organization_id, user_id, work_date desc, id);
create index material_entries_org_project_created_idx on public.material_entries (organization_id, project_id, created_at desc, id);
create index change_orders_org_project_status_idx on public.change_orders (organization_id, project_id, work_status, price_status, created_at desc);
create index invoice_drafts_org_status_created_idx on public.invoice_drafts (organization_id, status, created_at desc, id);
create index portal_memberships_user_idx on public.portal_memberships (user_id, status, project_id);
create index portal_publications_project_timeline_idx on public.portal_publications (organization_id, project_id, occurred_at desc, id) where status = 'published';
create index outbox_jobs_claim_idx on public.outbox_jobs (status, available_at, id) where status in ('pending', 'failed');
create index audit_events_org_created_idx on public.audit_events (organization_id, created_at desc, id);

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger organizations_touch_updated_at before update on public.organizations for each row execute function private.touch_updated_at();
create trigger organization_memberships_touch_updated_at before update on public.organization_memberships for each row execute function private.touch_updated_at();
create trigger customers_touch_updated_at before update on public.customers for each row execute function private.touch_updated_at();
create trigger quotes_touch_updated_at before update on public.quotes for each row execute function private.touch_updated_at();
create trigger projects_touch_updated_at before update on public.projects for each row execute function private.touch_updated_at();
create trigger time_entries_touch_updated_at before update on public.time_entries for each row execute function private.touch_updated_at();
create trigger material_entries_touch_updated_at before update on public.material_entries for each row execute function private.touch_updated_at();
create trigger change_orders_touch_updated_at before update on public.change_orders for each row execute function private.touch_updated_at();
create trigger invoice_drafts_touch_updated_at before update on public.invoice_drafts for each row execute function private.touch_updated_at();
create trigger portal_publications_touch_updated_at before update on public.portal_publications for each row execute function private.touch_updated_at();

create or replace function private.protect_locked_financial_record()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.locked_at is not null
    and (
      tg_table_name <> 'invoice_drafts'
      or (to_jsonb(new) - array['status', 'updated_at'])
        is distinct from (to_jsonb(old) - array['status', 'updated_at'])
    )
    and new is distinct from old
  then
    raise exception 'Locked financial records are immutable';
  end if;
  return new;
end;
$$;

create trigger quotes_protect_locked before update or delete on public.quotes for each row execute function private.protect_locked_financial_record();
create trigger invoice_drafts_protect_locked before update or delete on public.invoice_drafts for each row execute function private.protect_locked_financial_record();

alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.customers enable row level security;
alter table public.quotes enable row level security;
alter table public.projects enable row level security;
alter table public.time_entries enable row level security;
alter table public.material_entries enable row level security;
alter table public.change_orders enable row level security;
alter table public.invoice_drafts enable row level security;
alter table public.portal_memberships enable row level security;
alter table public.portal_publications enable row level security;
alter table public.outbox_jobs enable row level security;
alter table public.audit_events enable row level security;

create policy organizations_select on public.organizations for select to authenticated
  using ((select private.has_org_access(id)));
create policy organizations_update on public.organizations for update to authenticated
  using ((select private.has_org_access(id, array['owner', 'admin'])))
  with check ((select private.has_org_access(id, array['owner', 'admin'])));

create policy memberships_select on public.organization_memberships for select to authenticated
  using (user_id = (select auth.uid()) or (select private.has_org_access(organization_id, array['owner', 'admin'])));

create policy customers_select on public.customers for select to authenticated
  using ((select private.has_org_access(organization_id)));
create policy customers_insert on public.customers for insert to authenticated
  with check ((select private.has_org_access(organization_id, array['owner', 'admin', 'office', 'finance'])));
create policy customers_update on public.customers for update to authenticated
  using ((select private.has_org_access(organization_id, array['owner', 'admin', 'office', 'finance'])))
  with check ((select private.has_org_access(organization_id, array['owner', 'admin', 'office', 'finance'])));

create policy quotes_select on public.quotes for select to authenticated
  using ((select private.has_org_access(organization_id)));
create policy quotes_insert on public.quotes for insert to authenticated
  with check ((select private.has_org_access(organization_id, array['owner', 'admin', 'office'])));
create policy quotes_update on public.quotes for update to authenticated
  using ((select private.has_org_access(organization_id, array['owner', 'admin', 'office'])))
  with check ((select private.has_org_access(organization_id, array['owner', 'admin', 'office'])));

create policy projects_select on public.projects for select to authenticated
  using ((select private.has_org_access(organization_id)));
create policy projects_insert on public.projects for insert to authenticated
  with check ((select private.has_org_access(organization_id, array['owner', 'admin', 'office'])));
create policy projects_update on public.projects for update to authenticated
  using ((select private.has_org_access(organization_id, array['owner', 'admin', 'office', 'worker'])))
  with check ((select private.has_org_access(organization_id, array['owner', 'admin', 'office', 'worker'])));

create policy time_entries_select on public.time_entries for select to authenticated
  using ((select private.has_org_access(organization_id)));
create policy time_entries_insert on public.time_entries for insert to authenticated
  with check ((select private.has_org_access(organization_id, array['owner', 'admin', 'office', 'worker'])));
create policy time_entries_update on public.time_entries for update to authenticated
  using (approved_at is null and (user_id = (select auth.uid()) or (select private.has_org_access(organization_id, array['owner', 'admin', 'office']))))
  with check ((select private.has_org_access(organization_id, array['owner', 'admin', 'office', 'worker'])));

create policy material_entries_select on public.material_entries for select to authenticated
  using ((select private.has_org_access(organization_id)));
create policy material_entries_insert on public.material_entries for insert to authenticated
  with check ((select private.has_org_access(organization_id, array['owner', 'admin', 'office', 'worker'])));
create policy material_entries_update on public.material_entries for update to authenticated
  using ((select private.has_org_access(organization_id, array['owner', 'admin', 'office', 'worker'])))
  with check ((select private.has_org_access(organization_id, array['owner', 'admin', 'office', 'worker'])));

create policy change_orders_select on public.change_orders for select to authenticated
  using ((select private.has_org_access(organization_id)));
create policy change_orders_insert on public.change_orders for insert to authenticated
  with check ((select private.has_org_access(organization_id, array['owner', 'admin', 'office', 'worker'])));
create policy change_orders_update on public.change_orders for update to authenticated
  using ((select private.has_org_access(organization_id, array['owner', 'admin', 'office', 'worker'])))
  with check ((select private.has_org_access(organization_id, array['owner', 'admin', 'office', 'worker'])));

create policy invoice_drafts_select on public.invoice_drafts for select to authenticated
  using ((select private.has_org_access(organization_id, array['owner', 'admin', 'office', 'finance'])));
create policy invoice_drafts_insert on public.invoice_drafts for insert to authenticated
  with check ((select private.has_org_access(organization_id, array['owner', 'admin', 'office', 'finance'])));
create policy invoice_drafts_update on public.invoice_drafts for update to authenticated
  using ((select private.has_org_access(organization_id, array['owner', 'admin', 'office', 'finance'])))
  with check ((select private.has_org_access(organization_id, array['owner', 'admin', 'office', 'finance'])));

create policy portal_memberships_select on public.portal_memberships for select to authenticated
  using (user_id = (select auth.uid()) or (select private.has_org_access(organization_id, array['owner', 'admin', 'office'])));
create policy portal_publications_select on public.portal_publications for select to authenticated
  using (
    (select private.has_org_access(organization_id))
    or (status = 'published' and (select private.can_view_portal(organization_id, project_id)))
  );
create policy portal_publications_insert on public.portal_publications for insert to authenticated
  with check ((select private.has_org_access(organization_id, array['owner', 'admin', 'office', 'worker'])));
create policy portal_publications_update on public.portal_publications for update to authenticated
  using ((select private.has_org_access(organization_id, array['owner', 'admin', 'office'])))
  with check ((select private.has_org_access(organization_id, array['owner', 'admin', 'office'])));

create policy outbox_jobs_select on public.outbox_jobs for select to authenticated
  using ((select private.has_org_access(organization_id, array['owner', 'admin'])));
create policy audit_events_select on public.audit_events for select to authenticated
  using ((select private.has_org_access(organization_id, array['owner', 'admin'])));

-- New Supabase projects no longer expose tables automatically. Keep anon out,
-- and grant only the operations for which an authenticated RLS policy exists.
revoke all on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;

grant select, update on public.organizations to authenticated;
grant select on public.organization_memberships to authenticated;
grant select, insert, update on public.customers to authenticated;
grant select, insert, update on public.quotes to authenticated;
grant select, insert, update on public.projects to authenticated;
grant select, insert, update on public.time_entries to authenticated;
grant select, insert, update on public.material_entries to authenticated;
grant select, insert, update on public.change_orders to authenticated;
grant select, insert, update on public.invoice_drafts to authenticated;
grant select on public.portal_memberships to authenticated;
grant select, insert, update on public.portal_publications to authenticated;
grant select on public.outbox_jobs to authenticated;
grant select on public.audit_events to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Bynex Smart keeps inputs and outputs attached to the project. Generated
-- material is always versioned and safety-critical output requires review.
create table public.smart_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  project_id uuid not null,
  module text not null check (module in ('project', 'quote', 'change_order', 'drawing', 'calculation', 'materials', 'procurement', 'schedule', 'customer_portal', 'asset')),
  task_type text not null,
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  input_references jsonb not null default '[]'::jsonb,
  result_summary jsonb not null default '{}'::jsonb,
  requested_by uuid not null default auth.uid() references auth.users(id),
  started_at timestamptz,
  completed_at timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  constraint smart_runs_project_fk foreign key (organization_id, project_id)
    references public.projects(organization_id, id)
);

create table public.project_artifacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  project_id uuid not null,
  change_order_id uuid,
  artifact_type text not null check (artifact_type in ('drawing', 'calculation', 'material_specification', 'work_list', 'schedule', 'checklist', 'instruction', 'photo_analysis', 'delivery_plan', 'handover_document')),
  title text not null check (length(btrim(title)) between 2 and 240),
  review_level text not null default 'normal' check (review_level in ('normal', 'professional', 'safety_critical')),
  status text not null default 'draft' check (status in ('draft', 'review_required', 'approved', 'published', 'superseded', 'withdrawn')),
  current_version integer not null default 1 check (current_version > 0),
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  constraint project_artifacts_project_fk foreign key (organization_id, project_id)
    references public.projects(organization_id, id),
  constraint project_artifacts_change_order_fk foreign key (organization_id, change_order_id)
    references public.change_orders(organization_id, id),
  constraint approved_artifact_has_reviewer check (status not in ('approved', 'published') or (approved_at is not null and approved_by is not null))
);

create table public.artifact_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  artifact_id uuid not null,
  version integer not null check (version > 0),
  generated_by text not null default 'user' check (generated_by in ('user', 'bynex_smart', 'import')),
  smart_run_id uuid references public.smart_runs(id),
  source_references jsonb not null default '[]'::jsonb,
  structured_content jsonb not null default '{}'::jsonb,
  storage_path text,
  content_hash text,
  change_note text not null default '',
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique (artifact_id, version),
  constraint artifact_versions_artifact_fk foreign key (organization_id, artifact_id)
    references public.project_artifacts(organization_id, id)
);

create table public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  project_id uuid not null,
  source_artifact_id uuid,
  title text not null check (length(btrim(title)) between 1 and 240),
  description text not null default '',
  status text not null default 'planned' check (status in ('planned', 'ready', 'in_progress', 'blocked', 'completed', 'cancelled')),
  priority smallint not null default 3 check (priority between 1 and 5),
  starts_at timestamptz,
  due_at timestamptz,
  estimated_minutes integer check (estimated_minutes > 0),
  assigned_user_id uuid references auth.users(id),
  blocking_reason text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  constraint project_tasks_project_fk foreign key (organization_id, project_id)
    references public.projects(organization_id, id),
  constraint project_tasks_artifact_fk foreign key (organization_id, source_artifact_id)
    references public.project_artifacts(organization_id, id),
  constraint task_dates_in_order check (starts_at is null or due_at is null or due_at >= starts_at)
);

create table public.task_dependencies (
  organization_id uuid not null references public.organizations(id),
  task_id uuid not null,
  depends_on_task_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (task_id, depends_on_task_id),
  constraint task_dependency_not_self check (task_id <> depends_on_task_id),
  constraint task_dependencies_task_fk foreign key (organization_id, task_id)
    references public.project_tasks(organization_id, id) on delete cascade,
  constraint task_dependencies_parent_fk foreign key (organization_id, depends_on_task_id)
    references public.project_tasks(organization_id, id) on delete cascade
);

create table public.material_requirements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  project_id uuid not null,
  source_artifact_id uuid,
  description text not null check (length(btrim(description)) between 1 and 500),
  product_reference text,
  quantity numeric(14,3) not null check (quantity > 0),
  unit text not null default 'st',
  needed_on date,
  status text not null default 'suggested' check (status in ('suggested', 'approved', 'ordered', 'partially_delivered', 'delivered', 'cancelled')),
  recommendation jsonb not null default '{}'::jsonb,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  constraint material_requirements_project_fk foreign key (organization_id, project_id)
    references public.projects(organization_id, id),
  constraint material_requirements_artifact_fk foreign key (organization_id, source_artifact_id)
    references public.project_artifacts(organization_id, id)
);

create table public.smart_suggestions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  project_id uuid not null,
  smart_run_id uuid references public.smart_runs(id),
  recipient_role text not null check (recipient_role in ('owner', 'admin', 'office', 'worker', 'finance', 'viewer')),
  category text not null check (category in ('next_action', 'risk', 'schedule', 'material', 'delivery', 'change_order', 'quality', 'cost')),
  title text not null check (length(btrim(title)) between 2 and 240),
  rationale text not null default '',
  action_payload jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'accepted', 'dismissed', 'expired')),
  created_at timestamptz not null default now(),
  acted_at timestamptz,
  acted_by uuid references auth.users(id),
  constraint smart_suggestions_project_fk foreign key (organization_id, project_id)
    references public.projects(organization_id, id)
);

create index smart_runs_org_project_created_idx on public.smart_runs (organization_id, project_id, created_at desc, id);
create index smart_runs_queue_idx on public.smart_runs (status, created_at, id) where status in ('queued', 'processing');
create index project_artifacts_org_project_type_idx on public.project_artifacts (organization_id, project_id, artifact_type, updated_at desc, id);
create index artifact_versions_artifact_version_idx on public.artifact_versions (organization_id, artifact_id, version desc);
create index project_tasks_org_project_status_due_idx on public.project_tasks (organization_id, project_id, status, due_at, id);
create index project_tasks_assignee_status_idx on public.project_tasks (organization_id, assigned_user_id, status, due_at) where assigned_user_id is not null;
create index material_requirements_org_project_status_needed_idx on public.material_requirements (organization_id, project_id, status, needed_on, id);
create index smart_suggestions_org_project_role_idx on public.smart_suggestions (organization_id, project_id, recipient_role, status, created_at desc);

create trigger project_artifacts_touch_updated_at before update on public.project_artifacts for each row execute function private.touch_updated_at();
create trigger project_tasks_touch_updated_at before update on public.project_tasks for each row execute function private.touch_updated_at();
create trigger material_requirements_touch_updated_at before update on public.material_requirements for each row execute function private.touch_updated_at();

alter table public.smart_runs enable row level security;
alter table public.project_artifacts enable row level security;
alter table public.artifact_versions enable row level security;
alter table public.project_tasks enable row level security;
alter table public.task_dependencies enable row level security;
alter table public.material_requirements enable row level security;
alter table public.smart_suggestions enable row level security;

create policy smart_runs_select on public.smart_runs for select to authenticated
  using ((select private.has_org_access(organization_id)));
create policy smart_runs_insert on public.smart_runs for insert to authenticated
  with check ((select private.has_org_access(organization_id, array['owner', 'admin', 'office', 'worker'])));

create policy project_artifacts_select on public.project_artifacts for select to authenticated
  using ((select private.has_org_access(organization_id)));
create policy project_artifacts_insert on public.project_artifacts for insert to authenticated
  with check ((select private.has_org_access(organization_id, array['owner', 'admin', 'office', 'worker'])));
create policy project_artifacts_update on public.project_artifacts for update to authenticated
  using ((select private.has_org_access(organization_id, array['owner', 'admin', 'office'])))
  with check ((select private.has_org_access(organization_id, array['owner', 'admin', 'office'])));

create policy artifact_versions_select on public.artifact_versions for select to authenticated
  using ((select private.has_org_access(organization_id)));
create policy artifact_versions_insert on public.artifact_versions for insert to authenticated
  with check ((select private.has_org_access(organization_id, array['owner', 'admin', 'office', 'worker'])));

create policy project_tasks_select on public.project_tasks for select to authenticated
  using ((select private.has_org_access(organization_id)));
create policy project_tasks_insert on public.project_tasks for insert to authenticated
  with check ((select private.has_org_access(organization_id, array['owner', 'admin', 'office', 'worker'])));
create policy project_tasks_update on public.project_tasks for update to authenticated
  using ((select private.has_org_access(organization_id, array['owner', 'admin', 'office', 'worker'])))
  with check ((select private.has_org_access(organization_id, array['owner', 'admin', 'office', 'worker'])));

create policy task_dependencies_select on public.task_dependencies for select to authenticated
  using ((select private.has_org_access(organization_id)));
create policy task_dependencies_insert on public.task_dependencies for insert to authenticated
  with check ((select private.has_org_access(organization_id, array['owner', 'admin', 'office'])));

create policy material_requirements_select on public.material_requirements for select to authenticated
  using ((select private.has_org_access(organization_id)));
create policy material_requirements_insert on public.material_requirements for insert to authenticated
  with check ((select private.has_org_access(organization_id, array['owner', 'admin', 'office', 'worker'])));
create policy material_requirements_update on public.material_requirements for update to authenticated
  using ((select private.has_org_access(organization_id, array['owner', 'admin', 'office', 'worker'])))
  with check ((select private.has_org_access(organization_id, array['owner', 'admin', 'office', 'worker'])));

create policy smart_suggestions_select on public.smart_suggestions for select to authenticated
  using ((select private.has_org_access(organization_id)));
create policy smart_suggestions_update on public.smart_suggestions for update to authenticated
  using ((select private.has_org_access(organization_id)))
  with check ((select private.has_org_access(organization_id)));

grant select, insert on public.smart_runs to authenticated;
grant select, insert, update on public.project_artifacts to authenticated;
grant select, insert on public.artifact_versions to authenticated;
grant select, insert, update on public.project_tasks to authenticated;
grant select, insert on public.task_dependencies to authenticated;
grant select, insert, update on public.material_requirements to authenticated;
grant select, update on public.smart_suggestions to authenticated;

-- Transactional workflow functions prevent partial state and duplicate work
-- when clients retry after a lost network response. They run as the caller;
-- normal grants and RLS remain in force.
create or replace function public.create_project_from_quote(
  requested_quote_id uuid,
  requested_project_code text
)
returns public.projects
language plpgsql
security invoker
set search_path = ''
as $$
declare
  source_quote public.quotes;
  existing_project public.projects;
  created_project public.projects;
begin
  if length(btrim(requested_project_code)) < 1 then
    raise exception 'Project code is required';
  end if;

  select * into source_quote
  from public.quotes
  where id = requested_quote_id
  for update;

  if source_quote.id is null then
    raise exception 'Quote not found or access denied';
  end if;
  if source_quote.status <> 'accepted' or source_quote.locked_at is null then
    raise exception 'Only an accepted and locked quote can become a project';
  end if;

  select * into existing_project
  from public.projects
  where organization_id = source_quote.organization_id
    and quote_id = source_quote.id
  order by created_at
  limit 1;

  if existing_project.id is not null then
    return existing_project;
  end if;

  insert into public.projects (
    organization_id, customer_id, quote_id, code, name, status, created_by
  ) values (
    source_quote.organization_id,
    source_quote.customer_id,
    source_quote.id,
    requested_project_code,
    source_quote.title,
    'planned',
    (select auth.uid())
  )
  returning * into created_project;

  return created_project;
end;
$$;

revoke all on function public.create_project_from_quote(uuid, text) from public;
grant execute on function public.create_project_from_quote(uuid, text) to authenticated;

create or replace function public.create_project_invoice_draft(
  requested_project_id uuid,
  requested_key uuid
)
returns public.invoice_drafts
language plpgsql
security invoker
set search_path = ''
as $$
declare
  source_project public.projects;
  existing_draft public.invoice_drafts;
  quote_minor bigint := 0;
  time_minor bigint := 0;
  material_minor bigint := 0;
  change_minor bigint := 0;
  calculated_subtotal bigint := 0;
  calculated_vat bigint := 0;
  created_draft public.invoice_drafts;
begin
  select * into source_project
  from public.projects
  where id = requested_project_id
  for update;

  if source_project.id is null then
    raise exception 'Project not found or access denied';
  end if;

  select * into existing_draft
  from public.invoice_drafts
  where organization_id = source_project.organization_id
    and request_key = requested_key;

  if existing_draft.id is not null then
    return existing_draft;
  end if;

  if exists (
    select 1 from public.change_orders change_order
    where change_order.organization_id = source_project.organization_id
      and change_order.project_id = source_project.id
      and change_order.work_status <> 'cancelled'
      and change_order.price_status not in ('customer_approved', 'rejected')
  ) then
    raise exception 'Every active change order must have a final price decision';
  end if;

  if source_project.quote_id is not null then
    select coalesce(subtotal_minor, 0) into quote_minor
    from public.quotes
    where organization_id = source_project.organization_id
      and id = source_project.quote_id
      and status = 'accepted';
  end if;

  select coalesce(sum(round((entry.minutes::numeric / 60) * coalesce(entry.hourly_rate_minor, 0)))::bigint, 0)
    into time_minor
  from public.time_entries entry
  where entry.organization_id = source_project.organization_id
    and entry.project_id = source_project.id
    and entry.billable;

  select coalesce(sum(round(entry.quantity * entry.billable_minor))::bigint, 0)
    into material_minor
  from public.material_entries entry
  where entry.organization_id = source_project.organization_id
    and entry.project_id = source_project.id;

  select coalesce(sum(change_order.reviewed_minor), 0)
    into change_minor
  from public.change_orders change_order
  where change_order.organization_id = source_project.organization_id
    and change_order.project_id = source_project.id
    and change_order.price_status = 'customer_approved';

  calculated_subtotal := quote_minor + time_minor + material_minor + change_minor;
  calculated_vat := round(calculated_subtotal * 0.25)::bigint;

  insert into public.invoice_drafts (
    organization_id, request_key, project_id, customer_id, status,
    subtotal_minor, vat_minor, total_minor, source_snapshot, locked_at, created_by
  ) values (
    source_project.organization_id,
    requested_key,
    source_project.id,
    source_project.customer_id,
    'ready',
    calculated_subtotal,
    calculated_vat,
    calculated_subtotal + calculated_vat,
    jsonb_build_object(
      'quote_minor', quote_minor,
      'time_minor', time_minor,
      'material_minor', material_minor,
      'change_order_minor', change_minor,
      'calculated_at', now()
    ),
    now(),
    (select auth.uid())
  )
  returning * into created_draft;

  return created_draft;
end;
$$;

revoke all on function public.create_project_invoice_draft(uuid, uuid) from public;
grant execute on function public.create_project_invoice_draft(uuid, uuid) to authenticated;
