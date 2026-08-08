begin;

-- Bynex Bokföring has historically used account 3041 as the canonical revenue
-- system account. The independently authored catalog initially used 3021 for
-- the same purpose. Keep one account, preserve the catalog size, and make every
-- starter system account available in the replacement catalog before approval.
do $compatibility$
declare
  v_catalog_id constant uuid := 'b1e00000-2026-4000-8000-000000000002'::uuid;
  v_starter_id constant uuid := 'b1e00000-2026-4000-8000-000000000001'::uuid;
  v_source public.account_plan_catalog_accounts;
  v_count integer;
  v_checksum text;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('bynex-standard-account-plan-2026.1',0)
  );

  if not exists (
    select 1
    from public.account_plan_catalogs catalog
    where catalog.id = v_catalog_id
      and catalog.catalog_code = 'BYNEX-STANDARD'
      and catalog.version_label = '2026.1'
      and catalog.status = 'draft'
      and catalog.metadata->>'installation_state' = 'review_ready'
  ) then
    raise exception 'Bynex standardkontoplan måste vara granskningsklar före systemkontokompatibilitet'
      using errcode = '23514';
  end if;

  select * into v_source
  from public.account_plan_catalog_accounts account
  where account.catalog_id = v_catalog_id
    and account.account_number = '3021'
  for update;

  if v_source.id is null then
    raise exception 'Källkontot 3021 saknas i Bynex standardkontoplan'
      using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.account_plan_catalog_accounts account
    where account.catalog_id = v_catalog_id
      and account.account_number = '3041'
  ) then
    raise exception 'Systemkontot 3041 finns redan och migrationen kan inte avgöra källan säkert'
      using errcode = '23505';
  end if;

  insert into public.account_plan_catalog_accounts (
    catalog_id,
    account_number,
    name,
    account_type,
    normal_balance,
    vat_code,
    tax_form_mapping,
    description,
    synonyms,
    tags,
    business_forms,
    reporting_frameworks,
    active,
    search_text,
    source_payload
  ) values (
    v_catalog_id,
    '3041',
    'Försäljning tjänster 25 % moms',
    'revenue',
    'credit',
    '25',
    v_source.tax_form_mapping,
    'Tjänsteförsäljning inom Sverige med 25 procents moms. Kontot är Bynex Bokförings kanoniska intäktskonto och momshanteringen måste fortfarande verifieras mot kund och underlag.',
    array['tjänster 25','arbete 25','försäljning tjänster','tjänsteintäkt']::text[],
    array(
      select distinct tag
      from unnest(v_source.tags || array['systemkonto','försäljning Sverige']::text[]) tag
    ),
    v_source.business_forms,
    v_source.reporting_frameworks,
    true,
    '3041 försäljning tjänster 25 procent moms tjänsteintäkt arbete systemkonto försäljning sverige',
    v_source.source_payload || jsonb_build_object(
      'accountNumber','3041',
      'system_account_compatibility',true,
      'replaces_catalog_account_number','3021',
      'compatibility_reason','Bynex canonical revenue account'
    )
  );

  delete from public.account_plan_catalog_accounts account
  where account.catalog_id = v_catalog_id
    and account.account_number = '3021';

  select count(*) into v_count
  from public.account_plan_catalog_accounts account
  where account.catalog_id = v_catalog_id;

  if v_count <> 482 then
    raise exception 'Systemkontokompatibiliteten måste bevara exakt 482 konton, hittade %',v_count
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.account_plan_catalog_accounts starter
    where starter.catalog_id = v_starter_id
      and not exists (
        select 1
        from public.account_plan_catalog_accounts replacement
        where replacement.catalog_id = v_catalog_id
          and replacement.account_number = starter.account_number
      )
  ) then
    raise exception 'Alla befintliga Bynex-systemkonton måste finnas i standardkontoplanen'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.account_plan_catalog_accounts account
    where account.catalog_id = v_catalog_id
      and account.account_number = '3041'
      and account.account_type = 'revenue'
      and account.normal_balance = 'credit'
      and account.vat_code = '25'
      and account.reporting_frameworks = array['k1','k2','k3']::text[]
  ) or exists (
    select 1
    from public.account_plan_catalog_accounts account
    where account.catalog_id = v_catalog_id
      and account.account_number = '3021'
  ) then
    raise exception 'Intäktskontot 3041 är inte korrekt ersatt och validerat'
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
  set account_count = v_count,
      source_checksum_sha256 = v_checksum,
      metadata = metadata || jsonb_build_object(
        'installation_state','review_ready',
        'complete_account_plan',false,
        'accounting_review_required_before_public_launch',true,
        'system_account_compatibility','3041',
        'replaced_catalog_account_number','3021',
        'source_checksum_sha256',v_checksum
      ),
      updated_at = now()
  where id = v_catalog_id;

  insert into public.account_plan_catalog_events (
    catalog_id,event_type,actor_user_id,safe_summary,metadata
  ) values (
    v_catalog_id,
    'metadata_updated',
    null,
    'Bynex standardkontoplan kompletterad med kanoniskt systemkonto 3041',
    jsonb_build_object(
      'account_number','3041',
      'replaced_account_number','3021',
      'account_count',v_count,
      'source_checksum_sha256',v_checksum,
      'activation_performed',false
    )
  );
end;
$compatibility$;

commit;
