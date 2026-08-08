begin;

-- Finalize the imported catalog as review-ready, but do not expose it as the
-- platform default until a named Bynex reviewer has approved the exact hashed
-- contents. This prevents an unreviewed tax or VAT assumption from silently
-- reaching customer bookkeeping.
do $prepare_review$
declare
  v_catalog_id constant uuid := 'b1e00000-2026-4000-8000-000000000002'::uuid;
  v_expected_count constant integer := 482;
  v_actual_count integer;
  v_checksum text;
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

  if exists (
    select 1
    from public.account_plan_catalog_accounts account
    where account.catalog_id = v_catalog_id
      and account.reporting_frameworks && array['K1','K2','K3']::text[]
  ) then
    raise exception 'Kontoplanen innehåller regelverkskoder med fel skiftläge'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.account_plan_catalog_accounts account
    where account.catalog_id = v_catalog_id
      and account.account_type = 'expense'
      and account.vat_code is not null
      and account.account_number not in ('4310','4320','4330','4340','4350','4390')
  ) then
    raise exception 'Kontoplanen innehåller en osäker fast momskod på ett vanligt kostnadskonto'
      using errcode = '23514';
  end if;

  select encode(
    extensions.digest(
      convert_to(
        coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'account_number',account.account_number,
                'name',account.name,
                'account_type',account.account_type,
                'normal_balance',account.normal_balance,
                'vat_code',account.vat_code,
                'tax_form_mapping',account.tax_form_mapping,
                'description',account.description,
                'synonyms',account.synonyms,
                'tags',account.tags,
                'business_forms',account.business_forms,
                'reporting_frameworks',account.reporting_frameworks,
                'source_payload',account.source_payload
              ) order by account.account_number
            )::text
            from public.account_plan_catalog_accounts account
            where account.catalog_id = v_catalog_id
          ),
          '[]'
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ) into v_checksum;

  update public.account_plan_catalogs
  set status = 'draft',
      account_count = v_expected_count,
      source_checksum_sha256 = v_checksum,
      metadata = jsonb_build_object(
        'complete_account_plan',false,
        'complete_bas_plan',false,
        'official_bas',false,
        'independent_catalog',true,
        'authored_by','Bynex',
        'installation_state','review_ready',
        'expected_account_count',v_expected_count,
        'accounting_review_required_before_public_launch',true,
        'future_official_bas_ready',true,
        'supersedes_catalog_code','BYNEX-STARTER',
        'vat_policy','document_first',
        'activation_requires_platform_review',true,
        'source_checksum_sha256',v_checksum,
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
    'metadata_updated',
    null,
    'Bynex standardkontoplan är tekniskt validerad och väntar på redovisningsgodkännande',
    jsonb_build_object(
      'catalog_code','BYNEX-STANDARD',
      'version_label','2026.1',
      'account_count',v_expected_count,
      'source_checksum_sha256',v_checksum,
      'official_bas',false,
      'activation_performed',false
    )
  where not exists (
    select 1
    from public.account_plan_catalog_events event
    where event.catalog_id = v_catalog_id
      and event.event_type = 'metadata_updated'
      and event.metadata->>'source_checksum_sha256' = v_checksum
  );
end;
$prepare_review$;

-- Explicit, hash-bound activation for Bynex HQ. It is deliberately not called
-- by this migration. The reviewer must approve the exact catalog checksum and
-- provide an auditable review reference before any customer is moved.
create or replace function public.approve_bynex_standard_account_plan(
  p_expected_checksum text,
  p_review_reference text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_catalog_id constant uuid := 'b1e00000-2026-4000-8000-000000000002'::uuid;
  v_catalog public.account_plan_catalogs;
  v_reference text := left(btrim(coalesce(p_review_reference,'')),500);
begin
  if v_user_id is null or not private.is_platform_staff(null) then
    raise exception 'Plattformsbehörighet för kontoplansgodkännande saknas'
      using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('bynex-standard-account-plan-2026.1',0)
  );

  select * into v_catalog
  from public.account_plan_catalogs catalog
  where catalog.id = v_catalog_id
  for update;

  if v_catalog.id is null
     or v_catalog.catalog_code <> 'BYNEX-STANDARD'
     or v_catalog.version_label <> '2026.1'
     or v_catalog.status <> 'draft'
     or v_catalog.metadata->>'installation_state' <> 'review_ready' then
    raise exception 'Bynex standardkontoplan är inte redo för godkännande'
      using errcode = '23514';
  end if;

  if p_expected_checksum is null
     or lower(btrim(p_expected_checksum)) <> v_catalog.source_checksum_sha256 then
    raise exception 'Kontoplansfilens innehåll har ändrats sedan granskningen'
      using errcode = '23514';
  end if;

  if char_length(v_reference) < 8 then
    raise exception 'En tydlig redovisningsreferens krävs för aktivering'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.account_plan_catalog_accounts account
    where account.catalog_id = v_catalog_id
      and account.source_payload->>'requires_manual_review' = 'true'
      and account.source_payload->>'smart_auto_activation_allowed' <> 'false'
  ) then
    raise exception 'Ett högriskkonto tillåter fortfarande automatisk aktivering'
      using errcode = '23514';
  end if;

  update public.account_plan_catalogs
  set status = 'active',
      metadata = metadata || jsonb_build_object(
        'complete_account_plan',true,
        'installation_state','active',
        'accounting_review_required_before_public_launch',false,
        'review_reference',v_reference,
        'reviewed_by_user_id',v_user_id,
        'reviewed_at',now()
      ),
      updated_at = now()
  where id = v_catalog_id;

  insert into public.account_plan_catalog_events (
    catalog_id,event_type,actor_user_id,safe_summary,metadata
  ) values (
    v_catalog_id,
    'activated',
    v_user_id,
    'Bynex standardkontoplan aktiverad efter hashbunden redovisningsgranskning',
    jsonb_build_object(
      'review_reference',v_reference,
      'source_checksum_sha256',v_catalog.source_checksum_sha256,
      'account_count',v_catalog.account_count,
      'official_bas',false
    )
  );

  insert into public.account_plan_platform_settings (
    singleton,default_catalog_id,updated_by_user_id
  ) values (true,v_catalog_id,v_user_id)
  on conflict (singleton) do update
  set default_catalog_id = excluded.default_catalog_id,
      updated_by_user_id = excluded.updated_by_user_id,
      updated_at = now();

  insert into public.account_plan_catalog_events (
    catalog_id,event_type,actor_user_id,safe_summary,metadata
  ) values (
    v_catalog_id,
    'default_changed',
    v_user_id,
    'Bynex standardkontoplan vald som standard för nya företag',
    jsonb_build_object('review_reference',v_reference)
  );

  update public.organization_account_plan_settings settings
  set selected_catalog_id = v_catalog_id,
      plan_mode = 'custom',
      selected_at = now(),
      selected_by_user_id = v_user_id,
      last_reviewed_at = now(),
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
    selected_by_user_id,
    last_reviewed_at
  )
  select
    organization.id,
    v_catalog_id,
    'custom',
    'review',
    true,
    now(),
    v_user_id,
    now()
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
        'superseded_by_catalog_code','BYNEX-STANDARD',
        'superseded_at',now()
      ),
      updated_at = now()
  where catalog_code = 'BYNEX-STARTER'
    and version_label = '2026.1'
    and id <> v_catalog_id;

  return v_catalog_id;
end;
$$;

revoke all on function public.approve_bynex_standard_account_plan(text,text)
  from public,anon,authenticated;
grant execute on function public.approve_bynex_standard_account_plan(text,text)
  to authenticated;

commit;
