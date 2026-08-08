begin;

do $activate$
declare
  v_catalog_id constant uuid := 'b1e00000-2026-4000-8000-000000000002'::uuid;
  v_expected_count constant integer := 482;
  v_actual_count integer;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('bynex-standard-account-plan-2026.1',0)
  );

  select count(*) into v_actual_count
  from public.account_plan_catalog_accounts account
  where account.catalog_id = v_catalog_id;

  if v_actual_count <> v_expected_count then
    raise exception 'Bynex standardkontoplan har % konton men % krävs',
      v_actual_count,v_expected_count
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.account_plan_catalog_accounts account
    where account.catalog_id = v_catalog_id
      and account.account_number !~ '^[1-8][0-9]{3}$'
  ) then
    raise exception 'Bynex standardkontoplan innehåller ogiltiga kontonummer'
      using errcode = '23514';
  end if;

  if (
    select count(distinct left(account.account_number,1))
    from public.account_plan_catalog_accounts account
    where account.catalog_id = v_catalog_id
  ) <> 8 then
    raise exception 'Bynex standardkontoplan måste täcka kontoklass 1 till 8'
      using errcode = '23514';
  end if;

  update public.account_plan_catalogs
  set status = 'active',
      account_count = v_expected_count,
      metadata = jsonb_build_object(
        'complete_account_plan',true,
        'complete_bas_plan',false,
        'official_bas',false,
        'independent_catalog',true,
        'authored_by','Bynex',
        'installation_state','ready',
        'expected_account_count',v_expected_count,
        'accounting_review_required_before_public_launch',true,
        'future_official_bas_ready',true,
        'supersedes_catalog_code','BYNEX-STARTER',
        'coverage',jsonb_build_array(
          'assets',
          'equity_and_liabilities',
          'sales_and_project_revenue',
          'materials_and_subcontractors',
          'operating_expenses',
          'payroll',
          'depreciation',
          'financial_items',
          'appropriations_and_tax'
        )
      ),
      updated_at = now()
  where id = v_catalog_id;

  insert into public.account_plan_catalog_events (
    catalog_id,event_type,actor_user_id,safe_summary,metadata
  )
  select
    v_catalog_id,
    'installed',
    null,
    'Bynex egen fullständiga standardkontoplan installerad',
    jsonb_build_object(
      'catalog_code','BYNEX-STANDARD',
      'version_label','2026.1',
      'account_count',v_expected_count,
      'source_checksum_sha256','707a41aa6e17fb63377cabf3bf2a479ae5ff69687412709dbd2752d23b358352',
      'official_bas',false
    )
  where not exists (
    select 1
    from public.account_plan_catalog_events event
    where event.catalog_id = v_catalog_id
      and event.event_type = 'installed'
      and event.metadata->>'source_checksum_sha256' = '707a41aa6e17fb63377cabf3bf2a479ae5ff69687412709dbd2752d23b358352'
  );

  insert into public.account_plan_platform_settings (
    singleton,default_catalog_id,updated_by_user_id
  ) values (true,v_catalog_id,null)
  on conflict (singleton) do update
  set default_catalog_id = excluded.default_catalog_id,
      updated_by_user_id = null,
      updated_at = now();

  update public.organization_account_plan_settings settings
  set selected_catalog_id = v_catalog_id,
      plan_mode = 'custom',
      selected_at = now(),
      selected_by_user_id = null,
      last_reviewed_at = null,
      updated_at = now()
  from public.account_plan_catalogs previous
  where previous.id = settings.selected_catalog_id
    and previous.catalog_code = 'BYNEX-STARTER';

  insert into public.organization_account_plan_settings (
    organization_id,
    selected_catalog_id,
    plan_mode,
    upgrade_policy,
    smart_suggestions_enabled,
    selected_at,
    selected_by_user_id
  )
  select
    organization.id,
    v_catalog_id,
    'custom',
    'review',
    true,
    now(),
    null
  from public.organizations organization
  where not exists (
    select 1
    from public.organization_account_plan_settings settings
    where settings.organization_id = organization.id
  );

  update public.ledger_accounts ledger
  set catalog_account_id = replacement.id,
      catalog_version_label = '2026.1',
      origin = case when ledger.system_account then 'system' else 'catalog' end,
      updated_at = now()
  from public.account_plan_catalog_accounts replacement
  where replacement.catalog_id = v_catalog_id
    and replacement.account_number = ledger.account_number
    and (
      ledger.catalog_account_id is null
      or exists (
        select 1
        from public.account_plan_catalog_accounts previous_account
        join public.account_plan_catalogs previous_catalog
          on previous_catalog.id = previous_account.catalog_id
        where previous_account.id = ledger.catalog_account_id
          and previous_catalog.catalog_code = 'BYNEX-STARTER'
      )
    );

  update public.account_plan_catalogs
  set status = 'retired',
      metadata = metadata || jsonb_build_object(
        'superseded_by_catalog_id',v_catalog_id,
        'superseded_by_catalog_code','BYNEX-STANDARD'
      ),
      updated_at = now()
  where catalog_code = 'BYNEX-STARTER'
    and version_label = '2026.1'
    and id <> v_catalog_id;
end;
$activate$;

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
      when catalog.source_kind = 'customer_owned' then 'customer_owned'
      when catalog.source_kind = 'bynex_starter' then 'starter'
      else 'custom'
    end
  into v_catalog_id,v_plan_mode
  from public.account_plan_platform_settings settings
  join public.account_plan_catalogs catalog
    on catalog.id = settings.default_catalog_id
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
      coalesce(v_plan_mode,'custom'),
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
