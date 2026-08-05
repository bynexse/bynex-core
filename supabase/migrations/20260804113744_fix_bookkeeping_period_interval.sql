begin;

create or replace function public.enable_bynex_bookkeeping(
  p_organization_id uuid,
  p_business_form text,
  p_accounting_method text default 'accrual',
  p_reporting_framework text default 'k2'
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare fy_id uuid;
declare v_connector_id uuid;
declare v_connection_id uuid;
declare start_date date:=make_date(extract(year from current_date)::integer,1,1);
declare end_date date:=make_date(extract(year from current_date)::integer,12,31);
declare month_no integer;
begin
  if not private.has_organization_role(
    p_organization_id,array['owner','admin']::text[],(select auth.uid())
  ) then raise exception 'Behörighet saknas' using errcode='42501'; end if;
  if p_business_form not in ('sole_trader','limited_company','trading_partnership','limited_partnership','economic_association','nonprofit','public_entity','other') then
    raise exception 'Ogiltig företagsform' using errcode='22023';
  end if;
  if p_reporting_framework not in ('k1','k2','k3') then
    raise exception 'Ogiltigt regelverk' using errcode='22023';
  end if;
  if p_accounting_method not in ('cash','accrual') then
    raise exception 'Ogiltig bokföringsmetod' using errcode='22023';
  end if;
  update public.organizations set business_form=p_business_form,updated_at=now()
  where id=p_organization_id;
  insert into public.organization_bookkeeping_settings(
    organization_id,accounting_method,reporting_framework
  ) values(p_organization_id,p_accounting_method,p_reporting_framework)
  on conflict(organization_id) do update set enabled=true,
    accounting_method=excluded.accounting_method,
    reporting_framework=excluded.reporting_framework,updated_at=now();
  insert into public.bookkeeping_fiscal_years(
    organization_id,starts_on,ends_on,reporting_framework
  ) values(p_organization_id,start_date,end_date,p_reporting_framework)
  on conflict(organization_id,starts_on,ends_on) do update
    set reporting_framework=excluded.reporting_framework,updated_at=now()
  returning id into fy_id;
  for month_no in 1..12 loop
    insert into public.bookkeeping_periods(
      organization_id,fiscal_year_id,period_number,starts_on,ends_on
    ) values(
      p_organization_id,fy_id,month_no,
      make_date(extract(year from current_date)::integer,month_no,1),
      (make_date(extract(year from current_date)::integer,month_no,1)+interval '1 month - 1 day')::date
    ) on conflict(organization_id,fiscal_year_id,period_number) do nothing;
  end loop;
  insert into public.ledger_accounts(
    organization_id,account_number,name,account_type,normal_balance,system_account
  ) values
    (p_organization_id,'1510','Kundfordringar','asset','debit',true),
    (p_organization_id,'1513','Skattereduktionsfordran ROT/RUT','asset','debit',true),
    (p_organization_id,'1930','Företagskonto','asset','debit',true),
    (p_organization_id,'2440','Leverantörsskulder','liability','credit',true),
    (p_organization_id,'2611','Utgående moms 25 %','liability','credit',true),
    (p_organization_id,'2641','Ingående moms','asset','debit',true),
    (p_organization_id,'3041','Försäljning tjänster 25 % moms','revenue','credit',true),
    (p_organization_id,'4010','Inköp material och varor','expense','debit',true),
    (p_organization_id,'2013','Egna uttag','equity','debit',true),
    (p_organization_id,'2018','Egna insättningar','equity','credit',true)
  on conflict(organization_id,account_number) do nothing;
  select id into v_connector_id from public.accounting_connectors
  where slug='bynex-bookkeeping';
  select id into v_connection_id from public.organization_accounting_connections
  where organization_id=p_organization_id and connector_id=v_connector_id
  order by created_at limit 1;
  if v_connection_id is null then
    insert into public.organization_accounting_connections(
      organization_id,connector_id,display_name,status,external_company_id,
      granted_scopes,default_connection,created_by_user_id
    ) values(
      p_organization_id,v_connector_id,'Bynex Bokföring','active',p_organization_id::text,
      array['customers','suppliers','customer_invoices','supplier_invoices','vouchers','projects','receipts'],
      not exists(select 1 from public.organization_accounting_connections
        where organization_id=p_organization_id and default_connection),
      (select auth.uid())
    ) returning id into v_connection_id;
  else
    update public.organization_accounting_connections
    set status='active',updated_at=now() where id=v_connection_id;
  end if;
  insert into public.accounting_account_mappings(
    organization_id,connection_id,canonical_key,external_account_code
  )
  select p_organization_id,v_connection_id,m.key,m.account
  from (values
    ('accounts_receivable','1510'),('tax_reduction_receivable','1513'),
    ('bank','1930'),('accounts_payable','2440'),('output_vat','2611'),
    ('input_vat','2641'),('revenue','3041'),('expense','4010')
  ) m(key,account)
  on conflict(organization_id,connection_id,canonical_key) do nothing;
  return fy_id;
end;
$$;

revoke all on function public.enable_bynex_bookkeeping(uuid,text,text,text) from public,anon;
grant execute on function public.enable_bynex_bookkeeping(uuid,text,text,text) to authenticated;

commit;
