begin;

create table public.platform_cost_commitments (
  id uuid primary key default gen_random_uuid(),
  supplier text not null check (char_length(btrim(supplier)) between 2 and 160),
  service_name text not null check (char_length(btrim(service_name)) between 2 and 200),
  category text not null default 'software'
    check (category in (
      'hosting','database','ai','source_control','domain','email',
      'accounting','marketing','professional_services','software','other'
    )),
  amount_ex_vat numeric(14,2) not null check (amount_ex_vat > 0),
  vat_rate numeric(6,2) not null default 25 check (vat_rate between 0 and 100),
  currency text not null default 'SEK' check (currency = 'SEK'),
  billing_interval_months integer not null default 1
    check (billing_interval_months in (1,3,6,12)),
  starts_on date not null default current_date,
  next_charge_on date not null,
  ends_on date,
  active boolean not null default true,
  notes text not null default '' check (char_length(notes) <= 5000),
  created_by_user_id uuid not null default auth.uid() references auth.users(id),
  updated_by_user_id uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);

create index platform_cost_commitments_active_next_idx
  on public.platform_cost_commitments (active desc, next_charge_on, category);
create index platform_cost_commitments_supplier_idx
  on public.platform_cost_commitments (lower(supplier), lower(service_name));

create table public.platform_cost_entries (
  id uuid primary key default gen_random_uuid(),
  commitment_id uuid references public.platform_cost_commitments(id) on delete set null,
  supplier text not null check (char_length(btrim(supplier)) between 2 and 160),
  description text not null check (char_length(btrim(description)) between 2 and 500),
  category text not null default 'software'
    check (category in (
      'hosting','database','ai','source_control','domain','email',
      'accounting','marketing','professional_services','software','other'
    )),
  cost_date date not null default current_date,
  service_period_starts_on date,
  service_period_ends_on date,
  amount_ex_vat numeric(14,2) not null check (amount_ex_vat > 0),
  vat_amount numeric(14,2) not null default 0 check (vat_amount >= 0),
  amount_inc_vat numeric(14,2) not null check (amount_inc_vat > 0),
  currency text not null default 'SEK' check (currency = 'SEK'),
  status text not null default 'received'
    check (status in ('received','approved','paid','cancelled')),
  invoice_reference text check (
    invoice_reference is null or char_length(btrim(invoice_reference)) between 1 and 200
  ),
  notes text not null default '' check (char_length(notes) <= 5000),
  document_storage_path text,
  created_by_user_id uuid not null default auth.uid() references auth.users(id),
  approved_by_user_id uuid references auth.users(id),
  approved_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    service_period_ends_on is null
    or service_period_starts_on is null
    or service_period_ends_on >= service_period_starts_on
  ),
  check (amount_inc_vat = round(amount_ex_vat + vat_amount, 2))
);

create index platform_cost_entries_date_idx
  on public.platform_cost_entries (cost_date desc, created_at desc);
create index platform_cost_entries_category_status_idx
  on public.platform_cost_entries (category, status, cost_date desc);
create index platform_cost_entries_commitment_idx
  on public.platform_cost_entries (commitment_id, cost_date desc)
  where commitment_id is not null;

alter table public.platform_cost_commitments enable row level security;
alter table public.platform_cost_entries enable row level security;

revoke all on public.platform_cost_commitments from public, anon, authenticated;
revoke all on public.platform_cost_entries from public, anon, authenticated;

create or replace function public.get_platform_hq_costs()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text;
  result jsonb;
begin
  select staff.role into caller_role
  from public.platform_staff staff
  where staff.user_id = (select auth.uid()) and staff.active;

  if caller_role is null then
    raise exception 'Platform staff access required' using errcode = '42501';
  end if;

  if caller_role not in ('platform_owner','platform_admin','finance','read_only') then
    return jsonb_build_object(
      'restricted', true,
      'summary', jsonb_build_object(
        'current_month_inc_vat', 0,
        'current_year_inc_vat', 0,
        'active_monthly_commitment_ex_vat', 0,
        'projected_12_months_ex_vat', 0,
        'upcoming_30_days_inc_vat', 0,
        'unpaid_inc_vat', 0,
        'active_commitments', 0
      ),
      'by_category', '[]'::jsonb,
      'commitments', '[]'::jsonb,
      'entries', '[]'::jsonb
    );
  end if;

  select jsonb_build_object(
    'restricted', false,
    'summary', jsonb_build_object(
      'current_month_inc_vat', coalesce((
        select round(sum(entry.amount_inc_vat), 2)
        from public.platform_cost_entries entry
        where entry.status <> 'cancelled'
          and entry.cost_date >= date_trunc('month', current_date)::date
          and entry.cost_date < (date_trunc('month', current_date) + interval '1 month')::date
      ), 0),
      'current_year_inc_vat', coalesce((
        select round(sum(entry.amount_inc_vat), 2)
        from public.platform_cost_entries entry
        where entry.status <> 'cancelled'
          and entry.cost_date >= date_trunc('year', current_date)::date
          and entry.cost_date < (date_trunc('year', current_date) + interval '1 year')::date
      ), 0),
      'active_monthly_commitment_ex_vat', coalesce((
        select round(sum(commitment.amount_ex_vat / commitment.billing_interval_months), 2)
        from public.platform_cost_commitments commitment
        where commitment.active
          and (commitment.ends_on is null or commitment.ends_on >= current_date)
      ), 0),
      'projected_12_months_ex_vat', coalesce((
        select round(sum(
          commitment.amount_ex_vat * 12 / commitment.billing_interval_months
        ), 2)
        from public.platform_cost_commitments commitment
        where commitment.active
          and (commitment.ends_on is null or commitment.ends_on >= current_date)
      ), 0),
      'upcoming_30_days_inc_vat', coalesce((
        select round(sum(
          commitment.amount_ex_vat
          + round(commitment.amount_ex_vat * commitment.vat_rate / 100, 2)
        ), 2)
        from public.platform_cost_commitments commitment
        where commitment.active
          and commitment.next_charge_on between current_date and current_date + 30
          and (commitment.ends_on is null or commitment.ends_on >= current_date)
      ), 0),
      'unpaid_inc_vat', coalesce((
        select round(sum(entry.amount_inc_vat), 2)
        from public.platform_cost_entries entry
        where entry.status in ('received','approved')
      ), 0),
      'active_commitments', (
        select count(*)
        from public.platform_cost_commitments commitment
        where commitment.active
          and (commitment.ends_on is null or commitment.ends_on >= current_date)
      )
    ),
    'by_category', coalesce((
      with actual as (
        select entry.category, round(sum(entry.amount_inc_vat), 2) as actual_inc_vat
        from public.platform_cost_entries entry
        where entry.status <> 'cancelled'
          and entry.cost_date >= date_trunc('year', current_date)::date
          and entry.cost_date < (date_trunc('year', current_date) + interval '1 year')::date
        group by entry.category
      ), recurring as (
        select commitment.category,
          round(sum(commitment.amount_ex_vat / commitment.billing_interval_months), 2)
            as monthly_commitment_ex_vat
        from public.platform_cost_commitments commitment
        where commitment.active
          and (commitment.ends_on is null or commitment.ends_on >= current_date)
        group by commitment.category
      )
      select jsonb_agg(to_jsonb(category_row) order by category_row.actual_inc_vat desc, category_row.category)
      from (
        select
          coalesce(actual.category, recurring.category) as category,
          coalesce(actual.actual_inc_vat, 0) as actual_inc_vat,
          coalesce(recurring.monthly_commitment_ex_vat, 0) as monthly_commitment_ex_vat
        from actual
        full outer join recurring on recurring.category = actual.category
      ) category_row
    ), '[]'::jsonb),
    'commitments', coalesce((
      select jsonb_agg(
        to_jsonb(commitment)
        || jsonb_build_object(
          'monthly_amount_ex_vat', round(
            commitment.amount_ex_vat / commitment.billing_interval_months,
            2
          ),
          'amount_inc_vat', round(
            commitment.amount_ex_vat
            + commitment.amount_ex_vat * commitment.vat_rate / 100,
            2
          )
        )
        order by commitment.active desc, commitment.next_charge_on, commitment.supplier
      )
      from public.platform_cost_commitments commitment
    ), '[]'::jsonb),
    'entries', coalesce((
      select jsonb_agg(to_jsonb(entry_row) order by entry_row.cost_date desc, entry_row.created_at desc)
      from (
        select entry.*, commitment.service_name as commitment_service_name
        from public.platform_cost_entries entry
        left join public.platform_cost_commitments commitment on commitment.id = entry.commitment_id
        order by entry.cost_date desc, entry.created_at desc
        limit 500
      ) entry_row
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

create or replace function public.platform_save_cost_commitment(
  p_commitment_id uuid,
  p_supplier text,
  p_service_name text,
  p_category text,
  p_amount_ex_vat numeric,
  p_vat_rate numeric,
  p_billing_interval_months integer,
  p_starts_on date,
  p_next_charge_on date,
  p_ends_on date,
  p_notes text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_id uuid;
begin
  if not private.is_platform_staff(array['platform_owner','platform_admin','finance']) then
    raise exception 'Platform cost write access required' using errcode = '42501';
  end if;

  if char_length(btrim(coalesce(p_supplier, ''))) not between 2 and 160
    or char_length(btrim(coalesce(p_service_name, ''))) not between 2 and 200
    or p_category not in (
      'hosting','database','ai','source_control','domain','email',
      'accounting','marketing','professional_services','software','other'
    )
    or p_amount_ex_vat <= 0
    or p_vat_rate not between 0 and 100
    or p_billing_interval_months not in (1,3,6,12)
    or p_starts_on is null
    or p_next_charge_on is null
    or (p_ends_on is not null and p_ends_on < p_starts_on)
    or char_length(coalesce(p_notes, '')) > 5000
  then
    raise exception 'Kontrollera produktionskostnadens uppgifter' using errcode = '22023';
  end if;

  if p_commitment_id is null then
    insert into public.platform_cost_commitments (
      supplier, service_name, category, amount_ex_vat, vat_rate,
      billing_interval_months, starts_on, next_charge_on, ends_on,
      notes, created_by_user_id, updated_by_user_id
    ) values (
      btrim(p_supplier), btrim(p_service_name), p_category, round(p_amount_ex_vat, 2),
      round(p_vat_rate, 2), p_billing_interval_months, p_starts_on,
      p_next_charge_on, p_ends_on, coalesce(p_notes, ''),
      (select auth.uid()), (select auth.uid())
    ) returning id into saved_id;
  else
    update public.platform_cost_commitments
    set supplier = btrim(p_supplier),
        service_name = btrim(p_service_name),
        category = p_category,
        amount_ex_vat = round(p_amount_ex_vat, 2),
        vat_rate = round(p_vat_rate, 2),
        billing_interval_months = p_billing_interval_months,
        starts_on = p_starts_on,
        next_charge_on = p_next_charge_on,
        ends_on = p_ends_on,
        notes = coalesce(p_notes, ''),
        updated_by_user_id = (select auth.uid()),
        updated_at = now()
    where id = p_commitment_id
    returning id into saved_id;

    if saved_id is null then
      raise exception 'Produktionskostnaden hittades inte' using errcode = 'P0002';
    end if;
  end if;

  insert into public.platform_admin_audit_events (staff_user_id, action, metadata)
  values (
    (select auth.uid()),
    case when p_commitment_id is null then 'create_platform_cost_commitment' else 'update_platform_cost_commitment' end,
    jsonb_build_object(
      'commitment_id', saved_id,
      'supplier', btrim(p_supplier),
      'service_name', btrim(p_service_name),
      'amount_ex_vat', round(p_amount_ex_vat, 2),
      'billing_interval_months', p_billing_interval_months
    )
  );

  return saved_id;
end;
$$;

create or replace function public.platform_set_cost_commitment_active(
  p_commitment_id uuid,
  p_active boolean,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_id uuid;
begin
  if not private.is_platform_staff(array['platform_owner','platform_admin','finance']) then
    raise exception 'Platform cost write access required' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 3 and 1000 then
    raise exception 'En orsak krävs' using errcode = '22023';
  end if;

  update public.platform_cost_commitments
  set active = p_active,
      updated_by_user_id = (select auth.uid()),
      updated_at = now()
  where id = p_commitment_id
  returning id into saved_id;

  if saved_id is null then
    raise exception 'Produktionskostnaden hittades inte' using errcode = 'P0002';
  end if;

  insert into public.platform_admin_audit_events (staff_user_id, action, metadata)
  values (
    (select auth.uid()),
    'set_platform_cost_commitment_active',
    jsonb_build_object(
      'commitment_id', saved_id,
      'active', p_active,
      'reason', btrim(p_reason)
    )
  );
  return saved_id;
end;
$$;

create or replace function public.platform_record_cost_entry(
  p_commitment_id uuid,
  p_supplier text,
  p_description text,
  p_category text,
  p_cost_date date,
  p_service_period_starts_on date,
  p_service_period_ends_on date,
  p_amount_ex_vat numeric,
  p_vat_amount numeric,
  p_status text,
  p_invoice_reference text,
  p_notes text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
  total_inc_vat numeric(14,2);
  selected_commitment public.platform_cost_commitments;
begin
  if not private.is_platform_staff(array['platform_owner','platform_admin','finance']) then
    raise exception 'Platform cost write access required' using errcode = '42501';
  end if;

  if p_commitment_id is not null then
    select * into selected_commitment
    from public.platform_cost_commitments
    where id = p_commitment_id;
    if selected_commitment.id is null then
      raise exception 'Löpande produktionskostnad hittades inte' using errcode = 'P0002';
    end if;
  end if;

  if char_length(btrim(coalesce(p_supplier, ''))) not between 2 and 160
    or char_length(btrim(coalesce(p_description, ''))) not between 2 and 500
    or p_category not in (
      'hosting','database','ai','source_control','domain','email',
      'accounting','marketing','professional_services','software','other'
    )
    or p_cost_date is null
    or p_amount_ex_vat <= 0
    or p_vat_amount < 0
    or p_status not in ('received','approved','paid')
    or (
      p_service_period_ends_on is not null
      and p_service_period_starts_on is not null
      and p_service_period_ends_on < p_service_period_starts_on
    )
    or char_length(coalesce(p_notes, '')) > 5000
  then
    raise exception 'Kontrollera kostnadsunderlaget' using errcode = '22023';
  end if;

  total_inc_vat := round(p_amount_ex_vat + p_vat_amount, 2);

  insert into public.platform_cost_entries (
    commitment_id, supplier, description, category, cost_date,
    service_period_starts_on, service_period_ends_on,
    amount_ex_vat, vat_amount, amount_inc_vat, status,
    invoice_reference, notes, created_by_user_id,
    approved_by_user_id, approved_at, paid_at
  ) values (
    p_commitment_id, btrim(p_supplier), btrim(p_description), p_category, p_cost_date,
    p_service_period_starts_on, p_service_period_ends_on,
    round(p_amount_ex_vat, 2), round(p_vat_amount, 2), total_inc_vat, p_status,
    nullif(btrim(coalesce(p_invoice_reference, '')), ''), coalesce(p_notes, ''),
    (select auth.uid()),
    case when p_status in ('approved','paid') then (select auth.uid()) else null end,
    case when p_status in ('approved','paid') then now() else null end,
    case when p_status = 'paid' then now() else null end
  ) returning id into new_id;

  if p_commitment_id is not null
    and selected_commitment.next_charge_on <= p_cost_date
  then
    update public.platform_cost_commitments
    set next_charge_on = (
          p_cost_date + make_interval(months => billing_interval_months)
        )::date,
        updated_by_user_id = (select auth.uid()),
        updated_at = now()
    where id = p_commitment_id;
  end if;

  insert into public.platform_admin_audit_events (staff_user_id, action, metadata)
  values (
    (select auth.uid()),
    'record_platform_cost_entry',
    jsonb_build_object(
      'entry_id', new_id,
      'commitment_id', p_commitment_id,
      'supplier', btrim(p_supplier),
      'amount_ex_vat', round(p_amount_ex_vat, 2),
      'vat_amount', round(p_vat_amount, 2),
      'amount_inc_vat', total_inc_vat,
      'status', p_status
    )
  );
  return new_id;
end;
$$;

create or replace function public.platform_update_cost_entry_status(
  p_entry_id uuid,
  p_status text,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_id uuid;
begin
  if not private.is_platform_staff(array['platform_owner','platform_admin','finance']) then
    raise exception 'Platform cost write access required' using errcode = '42501';
  end if;
  if p_status not in ('received','approved','paid','cancelled')
    or char_length(btrim(coalesce(p_reason, ''))) not between 3 and 1000
  then
    raise exception 'Status och orsak måste anges' using errcode = '22023';
  end if;

  update public.platform_cost_entries
  set status = p_status,
      approved_by_user_id = case
        when p_status in ('approved','paid') then (select auth.uid())
        else approved_by_user_id
      end,
      approved_at = case
        when p_status in ('approved','paid') then coalesce(approved_at, now())
        else approved_at
      end,
      paid_at = case when p_status = 'paid' then coalesce(paid_at, now()) else paid_at end,
      updated_at = now()
  where id = p_entry_id
  returning id into saved_id;

  if saved_id is null then
    raise exception 'Kostnadsunderlaget hittades inte' using errcode = 'P0002';
  end if;

  insert into public.platform_admin_audit_events (staff_user_id, action, metadata)
  values (
    (select auth.uid()),
    'update_platform_cost_entry_status',
    jsonb_build_object(
      'entry_id', saved_id,
      'status', p_status,
      'reason', btrim(p_reason)
    )
  );
  return saved_id;
end;
$$;

revoke all on function public.get_platform_hq_costs() from public, anon;
revoke all on function public.platform_save_cost_commitment(
  uuid,text,text,text,numeric,numeric,integer,date,date,date,text
) from public, anon;
revoke all on function public.platform_set_cost_commitment_active(uuid,boolean,text) from public, anon;
revoke all on function public.platform_record_cost_entry(
  uuid,text,text,text,date,date,date,numeric,numeric,text,text,text
) from public, anon;
revoke all on function public.platform_update_cost_entry_status(uuid,text,text) from public, anon;

grant execute on function public.get_platform_hq_costs() to authenticated;
grant execute on function public.platform_save_cost_commitment(
  uuid,text,text,text,numeric,numeric,integer,date,date,date,text
) to authenticated;
grant execute on function public.platform_set_cost_commitment_active(uuid,boolean,text) to authenticated;
grant execute on function public.platform_record_cost_entry(
  uuid,text,text,text,date,date,date,numeric,numeric,text,text,text
) to authenticated;
grant execute on function public.platform_update_cost_entry_status(uuid,text,text) to authenticated;

select pg_notify('pgrst', 'reload schema');

commit;
