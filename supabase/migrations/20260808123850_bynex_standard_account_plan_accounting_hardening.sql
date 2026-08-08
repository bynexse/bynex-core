begin;

-- The Bynex catalog is intentionally conservative. Account names may help the
-- user search, but VAT, legal-form and year-end decisions must never be inferred
-- from an account name alone.
do $guard$
declare
  v_catalog_id constant uuid := 'b1e00000-2026-4000-8000-000000000002'::uuid;
  v_count integer;
begin
  select count(*) into v_count
  from public.account_plan_catalog_accounts account
  where account.catalog_id = v_catalog_id;

  if not exists (
    select 1
    from public.account_plan_catalogs catalog
    where catalog.id = v_catalog_id
      and catalog.catalog_code = 'BYNEX-STANDARD'
      and catalog.version_label = '2026.1'
      and catalog.status = 'draft'
  ) then
    raise exception 'Bynex standardkontoplan måste vara i utkastläge före redovisningshärdning'
      using errcode = 'P0002';
  end if;

  if v_count <> 482 then
    raise exception 'Redovisningshärdningen kräver exakt 482 konton, hittade %',v_count
      using errcode = '23514';
  end if;
end;
$guard$;

-- Lower-case framework identifiers match organization_bookkeeping_settings.
-- All broadly usable accounts remain searchable in K1, K2 and K3. Accounts
-- whose recognition model is specific to K3 are narrowed below.
update public.account_plan_catalog_accounts account
set reporting_frameworks = array['k1','k2','k3']::text[],
    business_forms = array[]::text[],
    source_payload = account.source_payload || jsonb_build_object(
      'vat_hint_policy','document_first',
      'smart_auto_activation_allowed',true,
      'accounting_review_level','standard'
    ),
    updated_at = now()
where account.catalog_id = 'b1e00000-2026-4000-8000-000000000002'::uuid;

-- K3-specific recognition and measurement areas. They may be searched only
-- when the organization has explicitly selected K3.
update public.account_plan_catalog_accounts account
set reporting_frameworks = array['k3']::text[],
    source_payload = account.source_payload || jsonb_build_object(
      'requires_manual_review',true,
      'smart_auto_activation_allowed',false,
      'review_reason','K3-specific recognition or measurement'
    ),
    updated_at = now()
where account.catalog_id = 'b1e00000-2026-4000-8000-000000000002'::uuid
  and account.account_number in (
    '1010','1018','1019',
    '1260','1268','1269',
    '2360','7770','8920'
  );

-- Legal-form specific equity and tax accounts. A sole trader must not receive
-- company-tax or corporate-equity suggestions, while corporate accounts must
-- not be suggested for private withdrawals and deposits.
update public.account_plan_catalog_accounts account
set business_forms = array[
      'sole_trader','trading_partnership','limited_partnership'
    ]::text[],
    updated_at = now()
where account.catalog_id = 'b1e00000-2026-4000-8000-000000000002'::uuid
  and account.account_number in ('2010','2013','2018','2020','2030');

update public.account_plan_catalog_accounts account
set business_forms = array['limited_company']::text[],
    updated_at = now()
where account.catalog_id = 'b1e00000-2026-4000-8000-000000000002'::uuid
  and account.account_number in ('2081','2086','2092','2093');

update public.account_plan_catalog_accounts account
set business_forms = array['limited_company','economic_association']::text[],
    updated_at = now()
where account.catalog_id = 'b1e00000-2026-4000-8000-000000000002'::uuid
  and account.account_number in (
    '2085','2088','2091','2098','2099',
    '2110','2120','2130','2140','2150','2160','2190',
    '2510','2512','2514','2518',
    '8010','8020','8030','8040',
    '8810','8820','8830','8840','8850','8860','8890',
    '8910','8920','8930'
  );

-- Static VAT on ordinary revenue or expense accounts is unsafe. The invoice,
-- counterparty, transaction country, deductibility and current rule version
-- decide the actual VAT treatment. Only accounts dedicated to an explicit VAT
-- rate or cross-border/reverse-charge transaction keep a hint.
update public.account_plan_catalog_accounts account
set vat_code = null,
    source_payload = account.source_payload || jsonb_build_object(
      'vat_hint_removed',true,
      'vat_decision_source','document_and_counterparty'
    ),
    updated_at = now()
where account.catalog_id = 'b1e00000-2026-4000-8000-000000000002'::uuid
  and account.account_type = 'expense'
  and account.account_number not in ('4310','4320','4330','4340','4350','4390');

update public.account_plan_catalog_accounts account
set vat_code = null,
    source_payload = account.source_payload || jsonb_build_object(
      'vat_hint_removed',true,
      'vat_decision_source','document_and_customer'
    ),
    updated_at = now()
where account.catalog_id = 'b1e00000-2026-4000-8000-000000000002'::uuid
  and account.account_type = 'revenue'
  and account.account_number not in (
    '3011','3012','3013',
    '3021','3022','3023',
    '3210','3220','3230','3240','3250','3260'
  );

-- Correct contra accounts and remove a misleading fixed-rate material label.
update public.account_plan_catalog_accounts account
set name = 'Projektmaterial med avvikande momshantering',
    vat_code = null,
    description = 'Projektmaterial där momssatsen eller avdragsrätten måste bestämmas från originalunderlaget och motparten.',
    synonyms = array['material annan moms','material kontroll moms','avvikande materialmoms']::text[],
    search_text = '4012 projektmaterial avvikande momshantering material annan moms kontroll originalunderlag',
    source_payload = account.source_payload || jsonb_build_object(
      'requires_manual_review',true,
      'smart_auto_activation_allowed',false,
      'review_reason','VAT rate or deductibility cannot be inferred from the account'
    ),
    updated_at = now()
where account.catalog_id = 'b1e00000-2026-4000-8000-000000000002'::uuid
  and account.account_number = '4012';

update public.account_plan_catalog_accounts account
set normal_balance = 'credit',
    source_payload = account.source_payload || jsonb_build_object(
      'contra_account',true
    ),
    updated_at = now()
where account.catalog_id = 'b1e00000-2026-4000-8000-000000000002'::uuid
  and account.account_number in ('4090','7540');

-- High-judgement accounts remain searchable but are never future candidates
-- for silent activation or automatic posting. Bynex Smart must show its source,
-- rule version and the consequence before a person can approve them.
update public.account_plan_catalog_accounts account
set tags = array(
      select distinct tag
      from unnest(account.tags || array['manuell redovisningsbedömning']::text[]) tag
    ),
    source_payload = account.source_payload || jsonb_build_object(
      'requires_manual_review',true,
      'smart_auto_activation_allowed',false,
      'accounting_review_level','high',
      'review_reason','Year-end, tax, valuation, impairment, accrual or legal-form judgement'
    ),
    updated_at = now()
where account.catalog_id = 'b1e00000-2026-4000-8000-000000000002'::uuid
  and (
    account.account_number in (
      '1040','1470','1480','1515','1518','1690','1750','1790',
      '2030','2099','2430','2510','2512','2514','2518',
      '2910','2920','2930','2940','2950','2960','2970','2990',
      '3410','4430','4440','4490','7790','7920'
    )
    or account.account_number between '2110' and '2190'
    or account.account_number between '8010' and '8990'
  );

-- Rebuild search text for corrected rows and include the review flag as useful
-- evidence for the advisor without exposing internal JSON to the user.
update public.account_plan_catalog_accounts account
set search_text = left(
      lower(
        concat_ws(
          ' ',
          account.account_number,
          account.name,
          coalesce(account.description,''),
          array_to_string(account.synonyms,' '),
          array_to_string(account.tags,' ')
        )
      ),
      8000
    ),
    updated_at = now()
where account.catalog_id = 'b1e00000-2026-4000-8000-000000000002'::uuid;

-- Fail closed if any of the important accounting invariants drift.
do $validate$
declare
  v_catalog_id constant uuid := 'b1e00000-2026-4000-8000-000000000002'::uuid;
begin
  if exists (
    select 1
    from public.account_plan_catalog_accounts account
    where account.catalog_id = v_catalog_id
      and account.reporting_frameworks && array['K1','K2','K3']::text[]
  ) then
    raise exception 'Kontoplanens regelverkskoder måste vara gemener'
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
    raise exception 'Ett vanligt kostnadskonto har fortfarande en osäker fast momskod'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.account_plan_catalog_accounts account
    where account.catalog_id = v_catalog_id
      and account.account_number in ('4090','7540')
      and account.normal_balance <> 'credit'
  ) then
    raise exception 'Kontrakontots normalsaldo är felaktigt'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.account_plan_catalog_accounts account
    where account.catalog_id = v_catalog_id
      and account.account_number in ('2510','2512','2514','2518','8910','8920','8930')
      and 'sole_trader' = any(account.business_forms)
  ) then
    raise exception 'Företagsskattekonto får inte föreslås för enskild firma'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.account_plan_catalog_accounts account
    where account.catalog_id = v_catalog_id
      and account.source_payload->>'requires_manual_review' = 'true'
      and account.source_payload->>'smart_auto_activation_allowed' <> 'false'
  ) then
    raise exception 'Ett högriskkonto tillåter automatisk aktivering'
      using errcode = '23514';
  end if;
end;
$validate$;

commit;
