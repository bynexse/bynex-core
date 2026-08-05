begin;

create or replace function public.get_bookkeeping_workspace_metrics(
  p_organization_id uuid,
  p_fiscal_year_id uuid default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not private.has_organization_role(
    p_organization_id,
    array['owner','admin','office']::text[],
    (select auth.uid())
  ) then
    raise exception 'Behörighet saknas' using errcode = '42501';
  end if;

  if p_fiscal_year_id is not null and not exists (
    select 1 from public.bookkeeping_fiscal_years
    where organization_id = p_organization_id and id = p_fiscal_year_id
  ) then
    raise exception 'Räkenskapsåret saknas' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'draft_count', count(*) filter (where v.status = 'draft'),
    'review_count', count(*) filter (where v.status = 'review'),
    'posted_count', count(*) filter (where v.status in ('posted','reversed')),
    'unbalanced_count', count(*) filter (
      where v.status in ('draft','review') and (coalesce(x.debit,0) <= 0 or abs(coalesce(x.debit,0) - coalesce(x.credit,0)) > 0.01)
    ),
    'posted_debit', coalesce(sum(x.debit) filter (where v.status in ('posted','reversed')),0),
    'posted_credit', coalesce(sum(x.credit) filter (where v.status in ('posted','reversed')),0)
  ) into v_result
  from public.bookkeeping_vouchers v
  left join lateral (
    select sum(l.debit_amount) as debit, sum(l.credit_amount) as credit
    from public.bookkeeping_voucher_lines l
    where l.organization_id = v.organization_id and l.voucher_id = v.id
  ) x on true
  where v.organization_id = p_organization_id
    and (p_fiscal_year_id is null or v.fiscal_year_id = p_fiscal_year_id);

  return coalesce(v_result, '{}'::jsonb);
end;
$$;

revoke all on function public.get_bookkeeping_workspace_metrics(uuid,uuid) from public, anon;
grant execute on function public.get_bookkeeping_workspace_metrics(uuid,uuid) to authenticated;

create or replace function public.create_manual_bookkeeping_voucher(
  p_organization_id uuid,
  p_voucher_date date,
  p_description text,
  p_lines jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period record;
  v_voucher_id uuid;
  v_line_count integer;
  v_debit numeric(16,2);
  v_credit numeric(16,2);
begin
  if not private.has_organization_role(
    p_organization_id,
    array['owner','admin','office']::text[],
    (select auth.uid())
  ) then
    raise exception 'Behörighet saknas' using errcode = '42501';
  end if;

  if p_voucher_date is null or char_length(btrim(coalesce(p_description,''))) not between 1 and 1000 then
    raise exception 'Datum och beskrivning krävs' using errcode = '22023';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 2 and 100 then
    raise exception 'Verifikationen måste ha 2–100 rader' using errcode = '22023';
  end if;

  select * into v_period from private.find_open_bookkeeping_period(p_organization_id,p_voucher_date);
  if v_period.fiscal_year_id is null then
    raise exception 'Ingen öppen bokföringsperiod finns för datumet' using errcode = '23514';
  end if;

  with parsed as (
    select * from jsonb_to_recordset(p_lines) as x(
      line_number integer,
      account_number text,
      description text,
      debit_amount numeric,
      credit_amount numeric,
      project_id uuid,
      cost_center text,
      tax_code text
    )
  )
  select count(*), coalesce(sum(debit_amount),0), coalesce(sum(credit_amount),0)
  into v_line_count, v_debit, v_credit
  from parsed
  where line_number > 0
    and account_number ~ '^[0-9A-Za-z.-]{2,20}$'
    and debit_amount >= 0 and credit_amount >= 0
    and ((debit_amount > 0 and credit_amount = 0) or (credit_amount > 0 and debit_amount = 0));

  if v_line_count <> jsonb_array_length(p_lines) or v_debit <= 0 or abs(v_debit-v_credit) > 0.01 then
    raise exception 'Verifikationen måste ha giltiga och balanserade rader' using errcode = '23514';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_lines) as x(line_number integer, account_number text)
    left join public.ledger_accounts a
      on a.organization_id = p_organization_id and a.account_number = x.account_number and a.active
    where a.id is null
  ) then
    raise exception 'Ett konto saknas eller är inaktivt' using errcode = '23503';
  end if;

  if exists (
    select 1 from jsonb_to_recordset(p_lines) as x(line_number integer)
    group by line_number having count(*) > 1
  ) then
    raise exception 'Radnummer måste vara unika' using errcode = '23505';
  end if;

  insert into public.bookkeeping_vouchers(
    organization_id,fiscal_year_id,period_id,voucher_date,source_type,description,
    status,bynex_smart_assisted,created_by_user_id
  ) values(
    p_organization_id,v_period.fiscal_year_id,v_period.period_id,p_voucher_date,
    'manual',btrim(p_description),'draft',false,(select auth.uid())
  ) returning id into v_voucher_id;

  insert into public.bookkeeping_voucher_lines(
    organization_id,voucher_id,line_number,account_id,description,debit_amount,
    credit_amount,project_id,cost_center,tax_code
  )
  select
    p_organization_id,v_voucher_id,x.line_number,a.id,nullif(btrim(x.description),''),
    x.debit_amount,x.credit_amount,x.project_id,nullif(btrim(x.cost_center),''),
    nullif(btrim(x.tax_code),'')
  from jsonb_to_recordset(p_lines) as x(
    line_number integer,
    account_number text,
    description text,
    debit_amount numeric,
    credit_amount numeric,
    project_id uuid,
    cost_center text,
    tax_code text
  )
  join public.ledger_accounts a
    on a.organization_id = p_organization_id and a.account_number = x.account_number and a.active
  order by x.line_number;

  return v_voucher_id;
end;
$$;

revoke all on function public.create_manual_bookkeeping_voucher(uuid,date,text,jsonb) from public, anon;
grant execute on function public.create_manual_bookkeeping_voucher(uuid,date,text,jsonb) to authenticated;

commit;
