begin;

-- Maskiner & tillgångar is available in beta through the packages that
-- explicitly include it. A separate paid checkout is not live yet.
insert into public.product_modules (
  slug,name,description,product_area,standalone_available,beta_available,active,sort_order
) values (
  'assets','Maskiner & tillgångar',
  'QR, utlåning, placering, service och återlämning.',
  'construction',false,true,true,80
)
on conflict (slug) do update set
  name=excluded.name,
  description=excluded.description,
  product_area=excluded.product_area,
  standalone_available=excluded.standalone_available,
  beta_available=excluded.beta_available,
  active=excluded.active,
  sort_order=excluded.sort_order,
  updated_at=now();

insert into public.plan_modules(plan_id,module_slug,included)
select p.id,'assets',true
from public.plans p
where p.slug in ('construction','property','complete')
on conflict (plan_id,module_slug) do update set included=true;

-- Repair existing active/trial subscriptions without overriding an explicit
-- addon or administrator entitlement.
insert into public.organization_module_entitlements(
  organization_id,module_slug,source,status,starts_at,ends_at
)
select s.organization_id,'assets',
  case when s.status='trialing' then 'trial' else 'subscription' end,
  'active',
  coalesce(s.trial_starts_at,s.current_period_starts_at,s.created_at),
  case when s.status='trialing' then s.trial_ends_at else null end
from public.organization_subscriptions s
join public.plans p on p.id=s.plan_id
where s.status in ('trialing','active')
  and p.slug in ('construction','property','complete')
on conflict (organization_id,module_slug) do update set
  source=excluded.source,
  status=excluded.status,
  starts_at=excluded.starts_at,
  ends_at=excluded.ends_at,
  updated_at=now()
where public.organization_module_entitlements.source in ('trial','subscription');

-- Existing role policies remain permissive policies. This restrictive policy
-- is an additional AND gate, so membership alone never unlocks asset rows.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'assets','asset_financials','asset_files','asset_qr_codes',
    'asset_qr_label_batches','asset_qr_label_items','asset_loans',
    'asset_condition_reports','asset_service_records','asset_scan_events',
    'asset_locations','asset_location_events','asset_maintenance_plans',
    'asset_manufacturer_identifiers','asset_theft_cases','asset_theft_events',
    'organization_gps_connections','asset_gps_devices',
    'asset_gps_location_snapshots','asset_evidence_packages',
    'asset_evidence_package_items'
  ]
  loop
    if to_regclass('public.' || table_name) is not null then
      execute format('drop policy if exists asset_module_entitlement_gate on public.%I',table_name);
      execute format(
        'create policy asset_module_entitlement_gate on public.%I as restrictive for all to authenticated using (private.has_active_module(organization_id,''assets'',(select auth.uid()))) with check (private.has_active_module(organization_id,''assets'',(select auth.uid())))',
        table_name
      );
    end if;
  end loop;
end;
$$;

drop policy if exists organization_module_preferences_entitlement_gate
  on public.organization_module_preferences;
create policy organization_module_preferences_entitlement_gate
  on public.organization_module_preferences
  as restrictive for all to authenticated
  using (private.has_active_module(organization_id,module_slug,(select auth.uid())))
  with check (private.has_active_module(organization_id,module_slug,(select auth.uid())));

create or replace function private.can_access_asset_object(
  object_name text,
  requested_user_id uuid default auth.uid()
)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  parts text[] := storage.foldername(object_name);
  path_org uuid;
  path_asset uuid;
begin
  if cardinality(parts) < 2 then return false; end if;
  begin
    path_org := parts[1]::uuid;
    path_asset := parts[2]::uuid;
  exception when invalid_text_representation then return false;
  end;
  return private.has_active_module(path_org,'assets',requested_user_id)
    and exists (
      select 1 from public.asset_files f
      where f.organization_id=path_org and f.asset_id=path_asset
        and f.storage_path=object_name
    );
end;
$$;

revoke all on function private.can_access_asset_object(text,uuid)
  from public,anon,authenticated;

commit;
