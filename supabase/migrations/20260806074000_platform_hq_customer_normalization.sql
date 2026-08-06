begin;

create or replace function public.platform_create_customer(
  p_name text,
  p_organization_number text,
  p_business_form text,
  p_legal_name text,
  p_billing_email text,
  p_address_line1 text,
  p_postal_code text,
  p_city text,
  p_country_code text default 'SE',
  p_payment_terms_days integer default 30
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_organization_id uuid;
  customer_number text;
  normalized_business_form text;
begin
  if not private.is_platform_staff(array['platform_owner','platform_admin','sales','finance']) then
    raise exception 'Platform customer write access required' using errcode = '42501';
  end if;

  normalized_business_form := case lower(coalesce(nullif(btrim(p_business_form), ''), 'unknown'))
    when 'partnership' then 'trading_partnership'
    when 'handelsbolag' then 'trading_partnership'
    when 'aktiebolag' then 'limited_company'
    when 'enskild firma' then 'sole_trader'
    else lower(coalesce(nullif(btrim(p_business_form), ''), 'unknown'))
  end;

  if normalized_business_form not in (
    'unknown','sole_trader','limited_company','trading_partnership','limited_partnership',
    'economic_association','nonprofit','public_entity','other'
  ) then
    raise exception 'Invalid business form' using errcode = '22023';
  end if;

  if char_length(btrim(p_name)) < 2 or char_length(btrim(p_legal_name)) < 2
    or position('@' in p_billing_email) <= 1 or p_payment_terms_days not between 0 and 90 then
    raise exception 'Invalid customer data' using errcode = '22023';
  end if;

  insert into public.organizations (name, organization_number, business_form, status, created_by_user_id)
  values (
    btrim(p_name), nullif(btrim(p_organization_number), ''), normalized_business_form,
    'active', (select auth.uid())
  )
  returning id into new_organization_id;

  customer_number := 'BYX-' || upper(substr(replace(new_organization_id::text, '-', ''), 1, 10));
  insert into public.organization_billing_profiles (
    organization_id, customer_number, legal_name, organization_number, billing_email,
    address_line1, postal_code, city, country_code, payment_terms_days
  ) values (
    new_organization_id, customer_number, btrim(p_legal_name),
    coalesce(nullif(btrim(p_organization_number), ''), 'SAKNAS'),
    lower(btrim(p_billing_email)), btrim(p_address_line1), btrim(p_postal_code),
    btrim(p_city), upper(p_country_code), p_payment_terms_days
  );

  insert into public.platform_crm_accounts (
    organization_id, lifecycle_stage, created_by_user_id, updated_by_user_id
  ) values (
    new_organization_id, 'customer', (select auth.uid()), (select auth.uid())
  );

  insert into public.platform_admin_audit_events (staff_user_id, action, metadata)
  values (
    (select auth.uid()), 'create_platform_customer',
    jsonb_build_object(
      'organization_id', new_organization_id,
      'name', p_name,
      'business_form', normalized_business_form
    )
  );
  return new_organization_id;
end;
$$;

revoke all on function public.platform_create_customer(
  text,text,text,text,text,text,text,text,text,integer
) from public, anon;
grant execute on function public.platform_create_customer(
  text,text,text,text,text,text,text,text,text,integer
) to authenticated;

commit;
