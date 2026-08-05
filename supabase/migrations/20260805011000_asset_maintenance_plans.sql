-- Tenant-scoped maintenance plans. Smart proposals are always pending until a
-- permitted human approves them; manufacturer requirements require a source.

create table public.asset_maintenance_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  asset_id uuid not null,
  title text not null check (length(btrim(title)) between 2 and 160),
  service_type text not null check (service_type in ('planned_service','repair','inspection','calibration','tire_change','other')),
  interval_months smallint check (interval_months is null or interval_months between 1 and 240),
  interval_meter numeric(14,2) check (interval_meter is null or interval_meter > 0),
  meter_unit text check (meter_unit is null or meter_unit in ('hours','kilometers','cycles')),
  next_due_on date,
  next_due_meter numeric(14,2) check (next_due_meter is null or next_due_meter >= 0),
  source_kind text not null check (source_kind in ('manufacturer_document','service_history','asset_register','company_policy','regulatory','other','bynex_estimate')),
  source_reference text,
  source_url text,
  notes text,
  origin text not null default 'human' check (origin in ('human','bynex_smart')),
  approval_status text not null default 'pending' check (approval_status in ('pending','approved','rejected')),
  status text not null default 'draft' check (status in ('draft','active','paused','retired')),
  approved_by_user_id uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_by_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, asset_id) references public.assets(organization_id, id) on delete cascade,
  check ((interval_meter is null and meter_unit is null) or (interval_meter is not null and meter_unit is not null)),
  check (next_due_meter is null or meter_unit is not null),
  check (source_kind <> 'manufacturer_document' or nullif(btrim(source_reference), '') is not null),
  check (status <> 'active' or approval_status = 'approved'),
  check (
    (approval_status = 'approved' and approved_by_user_id is not null and approved_at is not null)
    or (approval_status <> 'approved' and approved_by_user_id is null and approved_at is null)
  )
);

create index asset_maintenance_plans_due_idx
  on public.asset_maintenance_plans (organization_id, next_due_on, asset_id)
  where status in ('draft','active');
create index asset_maintenance_plans_asset_idx
  on public.asset_maintenance_plans (organization_id, asset_id, approval_status, status, updated_at desc);

create trigger asset_maintenance_plans_set_updated_at
before update on public.asset_maintenance_plans
for each row execute function public.set_updated_at();

create function private.guard_asset_maintenance_approval()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.approval_status <> 'pending' or new.approved_by_user_id is not null or new.approved_at is not null then
      raise exception 'En ny underhållsplan måste invänta mänskligt godkännande.' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.approval_status is distinct from old.approval_status
     or new.approved_by_user_id is distinct from old.approved_by_user_id
     or new.approved_at is distinct from old.approved_at then
    if not private.has_organization_role(
      old.organization_id,
      array['owner','admin','office','manager']::text[],
      (select auth.uid())
    ) then
      raise exception 'Behörig person måste granska underhållsplanen.' using errcode = '42501';
    end if;
    if new.approval_status = 'approved' then
      new.approved_by_user_id := (select auth.uid());
      new.approved_at := now();
      new.status := 'active';
    else
      new.approved_by_user_id := null;
      new.approved_at := null;
      if new.status = 'active' then new.status := 'draft'; end if;
    end if;
  end if;
  return new;
end $$;

revoke all on function private.guard_asset_maintenance_approval() from public, anon, authenticated;
create trigger asset_maintenance_plans_guard_approval
before insert or update on public.asset_maintenance_plans
for each row execute function private.guard_asset_maintenance_approval();

alter table public.asset_maintenance_plans enable row level security;
alter table public.asset_maintenance_plans force row level security;

create policy asset_maintenance_plans_member_select on public.asset_maintenance_plans
for select to authenticated using (private.is_organization_member(organization_id, (select auth.uid())));
create policy asset_maintenance_plans_operations_insert on public.asset_maintenance_plans
for insert to authenticated with check (
  approval_status = 'pending' and approved_by_user_id is null and approved_at is null
  and private.has_organization_role(organization_id, array['owner','admin','office','manager','supervisor']::text[], (select auth.uid()))
);
create policy asset_maintenance_plans_operations_update on public.asset_maintenance_plans
for update to authenticated using (
  private.has_organization_role(organization_id, array['owner','admin','office','manager','supervisor']::text[], (select auth.uid()))
) with check (
  private.has_organization_role(organization_id, array['owner','admin','office','manager','supervisor']::text[], (select auth.uid()))
);
create policy asset_maintenance_plans_management_delete on public.asset_maintenance_plans
for delete to authenticated using (
  private.has_organization_role(organization_id, array['owner','admin','office','manager']::text[], (select auth.uid()))
);

revoke all on public.asset_maintenance_plans from public, anon, authenticated;
grant select, insert, update, delete on public.asset_maintenance_plans to authenticated;
