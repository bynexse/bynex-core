begin;

-- New organizations must inherit a plan mode that matches the selected global
-- catalog. Keeping this decision in the database prevents the interface from
-- describing a licensed BAS catalog as a starter plan, and keeps a future
-- catalog change independent from application release timing.
create or replace function private.initialize_organization_account_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_catalog_id uuid;
  v_plan_mode text;
begin
  select
    settings.default_catalog_id,
    case
      when catalog.source_kind = 'bas_machine_readable' then 'licensed_full'
      when catalog.source_kind = 'bynex_starter' then 'starter'
      when catalog.source_kind = 'customer_owned' then 'customer_owned'
      else 'custom'
    end
  into v_catalog_id,v_plan_mode
  from public.account_plan_platform_settings settings
  join public.account_plan_catalogs catalog
    on catalog.id = settings.default_catalog_id
   and catalog.status = 'active'
  where settings.singleton;

  if v_catalog_id is not null then
    insert into public.organization_account_plan_settings (
      organization_id,
      selected_catalog_id,
      plan_mode,
      upgrade_policy,
      smart_suggestions_enabled
    ) values (
      new.id,
      v_catalog_id,
      v_plan_mode,
      'review',
      true
    )
    on conflict (organization_id) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function private.initialize_organization_account_plan()
  from public,anon,authenticated;

commit;
