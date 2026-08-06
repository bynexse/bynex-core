begin;

create table public.platform_subscription_discounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subscription_id uuid not null references public.organization_subscriptions(id) on delete cascade,
  agreement_id uuid references public.subscription_agreements(id) on delete set null,
  name text not null check (char_length(btrim(name)) between 2 and 160),
  discount_type text not null check (discount_type in ('percent','fixed')),
  applies_to text not null default 'all' check (applies_to in ('all','base','extra_users')),
  discount_value numeric(14,2) not null check (discount_value > 0),
  starts_on date not null,
  ends_on date,
  max_cycles integer check (max_cycles is null or max_cycles > 0),
  priority integer not null default 100,
  status text not null default 'active' check (status in ('draft','active','paused','expired','cancelled')),
  reason text not null check (char_length(btrim(reason)) between 3 and 2000),
  created_by_user_id uuid not null default auth.uid() references auth.users(id),
  approved_by_user_id uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on),
  check ((discount_type = 'percent' and discount_value <= 100) or discount_type = 'fixed')
);

create index platform_subscription_discounts_active_idx
  on public.platform_subscription_discounts (subscription_id, starts_on, ends_on, priority desc)
  where status = 'active';

create table public.platform_manual_subscription_charges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subscription_id uuid not null references public.organization_subscriptions(id) on delete restrict,
  agreement_id uuid not null references public.subscription_agreements(id) on delete restrict,
  description text not null check (char_length(btrim(description)) between 2 and 500),
  item_code text not null default 'BYNEX-MANUAL' check (char_length(item_code) between 2 and 80),
  amount_ex_vat numeric(14,2) not null check (amount_ex_vat > 0),
  vat_rate numeric(5,2) not null default 25 check (vat_rate between 0 and 100),
  service_period_starts_on date not null,
  service_period_ends_on date not null,
  invoice_date date not null default current_date,
  due_date date not null,
  delivery_channel text check (delivery_channel is null or delivery_channel in ('email','peppol')),
  status text not null default 'draft' check (status in ('draft','approved','invoiced','void')),
  reason text not null check (char_length(btrim(reason)) between 3 and 2000),
  issued_invoice_id uuid references public.subscription_invoices(id) on delete restrict,
  created_by_user_id uuid not null default auth.uid() references auth.users(id),
  approved_by_user_id uuid references auth.users(id),
  approved_at timestamptz,
  invoiced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (service_period_ends_on >= service_period_starts_on),
  check (due_date >= invoice_date)
);

create index platform_manual_subscription_charges_org_status_idx
  on public.platform_manual_subscription_charges (organization_id, status, created_at desc);

alter table public.platform_subscription_discounts enable row level security;
alter table public.platform_manual_subscription_charges enable row level security;
revoke all on public.platform_subscription_discounts from public, anon, authenticated;
revoke all on public.platform_manual_subscription_charges from public, anon, authenticated;

alter table public.subscription_invoices
  alter column schedule_id drop not null,
  add column origin text not null default 'automatic' check (origin in ('automatic','manual')),
  add column manual_charge_id uuid references public.platform_manual_subscription_charges(id) on delete restrict;

create unique index subscription_invoices_manual_charge_idx
  on public.subscription_invoices (manual_charge_id)
  where manual_charge_id is not null;

create or replace function private.guard_subscription_invoice_hq_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.origin is distinct from old.origin or new.manual_charge_id is distinct from old.manual_charge_id then
    raise exception 'Fakturans ursprung och manuella underlag är låsta' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_subscription_invoice_hq_fields() from public, anon, authenticated;
create trigger guard_subscription_invoice_hq_fields
  before update on public.subscription_invoices
  for each row execute function private.guard_subscription_invoice_hq_fields();

create or replace function private.apply_hq_discount_to_subscription_invoice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_discount public.platform_subscription_discounts;
  agreement record;
  base_original numeric(14,2);
  extra_original numeric(14,2);
  base_adjusted numeric(14,2);
  extra_adjusted numeric(14,2);
  fixed_remaining numeric(14,2);
  effective_percent numeric(8,4);
begin
  if new.origin <> 'automatic' then return new; end if;

  select discount.* into selected_discount
  from public.platform_subscription_discounts discount
  where discount.subscription_id = new.subscription_id
    and discount.organization_id = new.organization_id
    and discount.status = 'active'
    and discount.starts_on <= new.invoice_date
    and (discount.ends_on is null or discount.ends_on >= new.invoice_date)
    and (
      discount.max_cycles is null or
      (select count(*) from public.subscription_invoices prior
       where prior.subscription_id = discount.subscription_id
         and prior.origin = 'automatic'
         and prior.customer_snapshot -> 'hq_discount' ->> 'id' = discount.id::text) < discount.max_cycles
    )
  order by discount.priority desc, discount.created_at desc
  limit 1;

  if selected_discount.id is null then return new; end if;

  select a.net_monthly_price_ex_vat, a.included_users, a.net_extra_user_price_ex_vat, a.vat_rate,
    s.seat_count
  into agreement
  from public.subscription_agreements a
  join public.organization_subscriptions s on s.id = a.subscription_id
  where a.id = new.agreement_id and a.organization_id = new.organization_id;

  base_original := round(agreement.net_monthly_price_ex_vat, 2);
  extra_original := round(greatest(agreement.seat_count - agreement.included_users, 0) * agreement.net_extra_user_price_ex_vat, 2);
  base_adjusted := base_original;
  extra_adjusted := extra_original;

  if selected_discount.discount_type = 'percent' then
    if selected_discount.applies_to in ('all','base') then
      base_adjusted := round(base_original * (1 - selected_discount.discount_value / 100), 2);
    end if;
    if selected_discount.applies_to in ('all','extra_users') then
      extra_adjusted := round(extra_original * (1 - selected_discount.discount_value / 100), 2);
    end if;
  else
    fixed_remaining := selected_discount.discount_value;
    if selected_discount.applies_to = 'base' then
      base_adjusted := greatest(base_original - fixed_remaining, 0);
    elsif selected_discount.applies_to = 'extra_users' then
      extra_adjusted := greatest(extra_original - fixed_remaining, 0);
    else
      base_adjusted := greatest(base_original - fixed_remaining, 0);
      fixed_remaining := greatest(fixed_remaining - base_original, 0);
      extra_adjusted := greatest(extra_original - fixed_remaining, 0);
    end if;
  end if;

  new.amount_ex_vat := round(base_adjusted + extra_adjusted, 2);
  new.vat_amount := round(new.amount_ex_vat * agreement.vat_rate / 100, 2);
  new.amount_inc_vat := new.amount_ex_vat + new.vat_amount;
  effective_percent := case when base_original + extra_original = 0 then 0
    else round((1 - new.amount_ex_vat / (base_original + extra_original)) * 100, 4) end;
  new.customer_snapshot := new.customer_snapshot || jsonb_build_object('hq_discount', jsonb_build_object(
    'id', selected_discount.id,
    'name', selected_discount.name,
    'type', selected_discount.discount_type,
    'scope', selected_discount.applies_to,
    'value', selected_discount.discount_value,
    'effective_percent', effective_percent,
    'original_base_ex_vat', base_original,
    'original_extra_users_ex_vat', extra_original,
    'adjusted_base_ex_vat', base_adjusted,
    'adjusted_extra_users_ex_vat', extra_adjusted,
    'reason', selected_discount.reason
  ));
  new.content_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'organization_id',new.organization_id,'subscription_id',new.subscription_id,
    'agreement_id',new.agreement_id,'schedule_id',new.schedule_id,
    'issuer_entity_id',new.issuer_entity_id,'invoice_number',new.invoice_number,
    'invoice_date',new.invoice_date,'service_period_starts_on',new.service_period_starts_on,
    'service_period_ends_on',new.service_period_ends_on,'seat_count',new.seat_count_snapshot,
    'amount_ex_vat',new.amount_ex_vat,'vat_amount',new.vat_amount,'amount_inc_vat',new.amount_inc_vat,
    'discount_id',selected_discount.id
  )::text,'UTF8'),'sha256'),'hex');
  return new;
end;
$$;
revoke all on function private.apply_hq_discount_to_subscription_invoice() from public, anon, authenticated;
create trigger apply_hq_discount_to_subscription_invoice
  before insert on public.subscription_invoices
  for each row execute function private.apply_hq_discount_to_subscription_invoice();

create or replace function private.apply_hq_discount_to_subscription_invoice_line()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  discount jsonb;
  scope text;
  discount_type text;
  discount_value numeric;
  original_base numeric;
  original_line numeric;
  adjusted_line numeric;
  reduction numeric;
begin
  select invoice.customer_snapshot -> 'hq_discount' into discount
  from public.subscription_invoices invoice
  where invoice.id = new.invoice_id and invoice.organization_id = new.organization_id;
  if discount is null then return new; end if;

  scope := discount ->> 'scope';
  discount_type := discount ->> 'type';
  discount_value := (discount ->> 'value')::numeric;
  original_base := coalesce((discount ->> 'original_base_ex_vat')::numeric, 0);
  original_line := round(new.quantity * new.unit_price_ex_vat, 2);
  adjusted_line := original_line;

  if new.item_code = 'BYNEX-EXTRA-USER' then
    if scope in ('all','extra_users') then
      if discount_type = 'percent' then
        adjusted_line := round(original_line * (1 - discount_value / 100), 2);
      else
        reduction := case when scope = 'all' then greatest(discount_value - original_base, 0) else discount_value end;
        adjusted_line := greatest(original_line - reduction, 0);
      end if;
    end if;
  elsif scope in ('all','base') then
    if discount_type = 'percent' then
      adjusted_line := round(original_line * (1 - discount_value / 100), 2);
    else
      adjusted_line := greatest(original_line - discount_value, 0);
    end if;
  end if;

  new.line_amount_ex_vat := adjusted_line;
  new.discount_percent := case when original_line = 0 then 0 else round((1 - adjusted_line / original_line) * 100, 2) end;
  new.vat_amount := round(adjusted_line * new.vat_rate / 100, 2);
  return new;
end;
$$;
revoke all on function private.apply_hq_discount_to_subscription_invoice_line() from public, anon, authenticated;
create trigger apply_hq_discount_to_subscription_invoice_line
  before insert on public.subscription_invoice_lines
  for each row execute function private.apply_hq_discount_to_subscription_invoice_line();

create or replace function public.get_platform_hq_billing(requested_organization_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_staff(array['platform_owner','platform_admin','sales','support','finance','read_only']) then
    raise exception 'Platform staff access required' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'discounts', coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at desc)
      from public.platform_subscription_discounts d
      where requested_organization_id is null or d.organization_id = requested_organization_id), '[]'::jsonb),
    'manual_charges', coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at desc)
      from public.platform_manual_subscription_charges c
      where requested_organization_id is null or c.organization_id = requested_organization_id), '[]'::jsonb),
    'delivery_jobs', coalesce((select jsonb_agg(to_jsonb(j) order by j.created_at desc)
      from (select job.* from public.subscription_invoice_delivery_jobs job
        where requested_organization_id is null or job.organization_id = requested_organization_id
        order by job.created_at desc limit 200) j), '[]'::jsonb)
  );
end;
$$;

create or replace function public.platform_create_subscription_discount(
  p_organization_id uuid,
  p_subscription_id uuid,
  p_name text,
  p_discount_type text,
  p_applies_to text,
  p_discount_value numeric,
  p_starts_on date,
  p_ends_on date,
  p_max_cycles integer,
  p_priority integer,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
  agreement_id uuid;
begin
  if not private.is_platform_staff(array['platform_owner','platform_admin','finance']) then
    raise exception 'Platform discount access required' using errcode = '42501';
  end if;
  select id into agreement_id from public.subscription_agreements
  where organization_id=p_organization_id and subscription_id=p_subscription_id and status='active'
  order by created_at desc limit 1;
  if agreement_id is null then raise exception 'Active subscription agreement required' using errcode='P0002'; end if;
  insert into public.platform_subscription_discounts (
    organization_id,subscription_id,agreement_id,name,discount_type,applies_to,discount_value,
    starts_on,ends_on,max_cycles,priority,status,reason,created_by_user_id,approved_by_user_id,approved_at
  ) values (
    p_organization_id,p_subscription_id,agreement_id,btrim(p_name),p_discount_type,p_applies_to,p_discount_value,
    p_starts_on,p_ends_on,p_max_cycles,p_priority,'active',btrim(p_reason),(select auth.uid()),(select auth.uid()),now()
  ) returning id into new_id;
  insert into public.platform_admin_audit_events (staff_user_id,action,metadata)
  values ((select auth.uid()),'create_subscription_discount',jsonb_build_object(
    'organization_id',p_organization_id,'subscription_id',p_subscription_id,'discount_id',new_id,
    'discount_type',p_discount_type,'discount_value',p_discount_value,'reason',p_reason));
  return new_id;
end;
$$;

create or replace function public.platform_create_manual_subscription_charge(
  p_organization_id uuid,
  p_subscription_id uuid,
  p_description text,
  p_item_code text,
  p_amount_ex_vat numeric,
  p_vat_rate numeric,
  p_service_period_starts_on date,
  p_service_period_ends_on date,
  p_invoice_date date,
  p_due_date date,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
  selected_agreement_id uuid;
begin
  if not private.is_platform_staff(array['platform_owner','platform_admin','finance']) then
    raise exception 'Platform invoice access required' using errcode = '42501';
  end if;
  select id into selected_agreement_id from public.subscription_agreements
  where organization_id=p_organization_id and subscription_id=p_subscription_id and status='active'
  order by created_at desc limit 1;
  if selected_agreement_id is null then raise exception 'Active subscription agreement required' using errcode='P0002'; end if;
  insert into public.platform_manual_subscription_charges (
    organization_id,subscription_id,agreement_id,description,item_code,amount_ex_vat,vat_rate,
    service_period_starts_on,service_period_ends_on,invoice_date,due_date,status,reason,
    created_by_user_id,approved_by_user_id,approved_at
  ) values (
    p_organization_id,p_subscription_id,selected_agreement_id,btrim(p_description),upper(coalesce(nullif(btrim(p_item_code),''),'BYNEX-MANUAL')),
    p_amount_ex_vat,p_vat_rate,p_service_period_starts_on,p_service_period_ends_on,p_invoice_date,p_due_date,
    'approved',btrim(p_reason),(select auth.uid()),(select auth.uid()),now()
  ) returning id into new_id;
  insert into public.platform_admin_audit_events (staff_user_id,action,metadata)
  values ((select auth.uid()),'create_manual_subscription_charge',jsonb_build_object(
    'organization_id',p_organization_id,'subscription_id',p_subscription_id,'charge_id',new_id,'amount_ex_vat',p_amount_ex_vat,'reason',p_reason));
  return new_id;
end;
$$;

create or replace function public.platform_issue_manual_subscription_charge(p_charge_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  charge public.platform_manual_subscription_charges;
  billing public.organization_billing_profiles;
  issuer private.billing_legal_entities;
  subscription public.organization_subscriptions;
  invoice_id uuid;
  accounting_event_id uuid;
  invoice_number text;
  vat_amount numeric(14,2);
  gross_amount numeric(14,2);
  invoice_hash text;
  channel text;
begin
  if not private.is_platform_staff(array['platform_owner','platform_admin','finance']) then
    raise exception 'Platform invoice access required' using errcode = '42501';
  end if;
  select * into charge from public.platform_manual_subscription_charges where id=p_charge_id for update;
  if charge.id is null then raise exception 'Manual charge not found' using errcode='P0002'; end if;
  if charge.status <> 'approved' then raise exception 'Manual charge must be approved' using errcode='23514'; end if;
  select * into billing from public.organization_billing_profiles where organization_id=charge.organization_id;
  select * into subscription from public.organization_subscriptions where id=charge.subscription_id and organization_id=charge.organization_id;
  select * into issuer from private.billing_legal_entities e
  where e.status='active' and e.effective_from<=charge.invoice_date and (e.effective_to is null or e.effective_to>=charge.invoice_date)
  order by e.effective_from desc limit 1;
  if billing.organization_id is null or subscription.id is null or issuer.id is null then
    raise exception 'Billing profile, subscription or issuer is missing' using errcode='P0002';
  end if;
  channel := coalesce(charge.delivery_channel,billing.delivery_channel);
  vat_amount := round(charge.amount_ex_vat * charge.vat_rate / 100,2);
  gross_amount := charge.amount_ex_vat + vat_amount;
  invoice_number := private.allocate_subscription_invoice_number(issuer.id);
  invoice_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'organization_id',charge.organization_id,'subscription_id',charge.subscription_id,
    'agreement_id',charge.agreement_id,'manual_charge_id',charge.id,'issuer_entity_id',issuer.id,
    'invoice_number',invoice_number,'invoice_date',charge.invoice_date,
    'service_period_starts_on',charge.service_period_starts_on,'service_period_ends_on',charge.service_period_ends_on,
    'amount_ex_vat',charge.amount_ex_vat,'vat_amount',vat_amount,'amount_inc_vat',gross_amount
  )::text,'UTF8'),'sha256'),'hex');

  insert into public.subscription_invoices (
    organization_id,subscription_id,agreement_id,schedule_id,issuer_entity_id,invoice_number,status,
    invoice_date,due_date,service_period_starts_on,service_period_ends_on,currency,
    amount_ex_vat,vat_amount,amount_inc_vat,seat_count_snapshot,delivery_channel,
    customer_snapshot,issuer_snapshot,content_hash,origin,manual_charge_id
  ) values (
    charge.organization_id,charge.subscription_id,charge.agreement_id,null,issuer.id,invoice_number,'queued',
    charge.invoice_date,charge.due_date,charge.service_period_starts_on,charge.service_period_ends_on,'SEK',
    charge.amount_ex_vat,vat_amount,gross_amount,subscription.seat_count,channel,
    jsonb_strip_nulls(jsonb_build_object(
      'customer_number',billing.customer_number,'legal_name',billing.legal_name,
      'organization_number',billing.organization_number,'vat_number',billing.vat_number,
      'billing_email',billing.billing_email,'peppol_id',billing.peppol_id,
      'address_line1',billing.address_line1,'address_line2',billing.address_line2,
      'postal_code',billing.postal_code,'city',billing.city,'country_code',billing.country_code,
      'buyer_reference',billing.buyer_reference,'purchase_order_reference',billing.purchase_order_reference,
      'invoice_language',billing.invoice_language,'hq_manual_reason',charge.reason
    )),
    jsonb_strip_nulls(jsonb_build_object(
      'legal_name',issuer.legal_name,'organization_number',issuer.organization_number,'vat_number',issuer.vat_number,
      'address_line1',issuer.address_line1,'address_line2',issuer.address_line2,'postal_code',issuer.postal_code,
      'city',issuer.city,'country_code',issuer.country_code,'email',issuer.email,'phone',issuer.phone,
      'bankgiro',issuer.bankgiro,'plusgiro',issuer.plusgiro,'iban',issuer.iban,'bic',issuer.bic
    )),invoice_hash,'manual',charge.id
  ) returning id into invoice_id;

  insert into public.subscription_invoice_lines (
    organization_id,invoice_id,line_number,item_code,description,quantity,unit,unit_price_ex_vat,
    discount_percent,line_amount_ex_vat,vat_rate,vat_amount
  ) values (
    charge.organization_id,invoice_id,1,charge.item_code,charge.description,1,'st',charge.amount_ex_vat,
    0,charge.amount_ex_vat,charge.vat_rate,vat_amount
  );

  insert into public.subscription_invoice_delivery_jobs (organization_id,invoice_id,channel,idempotency_key)
  values (charge.organization_id,invoice_id,channel,'subscription-invoice:'||invoice_id::text||':'||channel);

  insert into private.billing_accounting_events (issuer_entity_id,organization_id,invoice_id,event_type,event_date,reference)
  values (issuer.id,charge.organization_id,invoice_id,'invoice_issued',charge.invoice_date,invoice_number)
  returning id into accounting_event_id;
  insert into private.billing_accounting_lines (
    accounting_event_id,line_number,account_number,debit_amount,credit_amount,description
  ) values
    (accounting_event_id,1,issuer.accounts_receivable_account,gross_amount,0,'Kundfordran '||invoice_number),
    (accounting_event_id,2,issuer.revenue_account,0,charge.amount_ex_vat,'Manuell abonnemangsintäkt '||invoice_number),
    (accounting_event_id,3,issuer.output_vat_account,0,vat_amount,'Utgående moms '||invoice_number);

  update public.platform_manual_subscription_charges
  set status='invoiced',issued_invoice_id=invoice_id,invoiced_at=now(),updated_at=now()
  where id=charge.id;
  insert into public.platform_admin_audit_events (staff_user_id,action,metadata)
  values ((select auth.uid()),'issue_manual_subscription_invoice',jsonb_build_object(
    'organization_id',charge.organization_id,'charge_id',charge.id,'invoice_id',invoice_id,'invoice_number',invoice_number,'reason',charge.reason));
  return invoice_id;
end;
$$;

create or replace function public.platform_queue_subscription_invoice_resend(p_invoice_id uuid,p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare invoice public.subscription_invoices; job_id uuid;
begin
  if not private.is_platform_staff(array['platform_owner','platform_admin','finance','support']) then
    raise exception 'Platform invoice delivery access required' using errcode = '42501';
  end if;
  if char_length(btrim(p_reason)) < 3 then raise exception 'Reason required' using errcode='22023'; end if;
  select * into invoice from public.subscription_invoices where id=p_invoice_id;
  if invoice.id is null then raise exception 'Invoice not found' using errcode='P0002'; end if;
  if invoice.status in ('void','credited') then raise exception 'Invoice cannot be resent' using errcode='23514'; end if;
  insert into public.subscription_invoice_delivery_jobs (organization_id,invoice_id,channel,idempotency_key)
  values (invoice.organization_id,invoice.id,invoice.delivery_channel,'subscription-invoice-resend:'||invoice.id::text||':'||gen_random_uuid()::text)
  returning id into job_id;
  insert into public.platform_admin_audit_events (staff_user_id,action,metadata)
  values ((select auth.uid()),'resend_subscription_invoice',jsonb_build_object('invoice_id',invoice.id,'job_id',job_id,'reason',p_reason));
  return job_id;
end;
$$;

create or replace function public.platform_record_subscription_payment(p_invoice_id uuid,p_amount numeric,p_reason text)
returns public.subscription_invoices
language plpgsql
security definer
set search_path = ''
as $$
declare invoice public.subscription_invoices; updated_invoice public.subscription_invoices; new_paid numeric;
begin
  if not private.is_platform_staff(array['platform_owner','platform_admin','finance']) then
    raise exception 'Platform payment access required' using errcode = '42501';
  end if;
  if p_amount <= 0 or char_length(btrim(p_reason)) < 3 then raise exception 'Amount and reason required' using errcode='22023'; end if;
  select * into invoice from public.subscription_invoices where id=p_invoice_id for update;
  if invoice.id is null then raise exception 'Invoice not found' using errcode='P0002'; end if;
  if invoice.status in ('void','credited') then raise exception 'Invoice cannot receive payment' using errcode='23514'; end if;
  new_paid := invoice.amount_paid + p_amount;
  if new_paid > invoice.amount_inc_vat then raise exception 'Payment exceeds outstanding amount' using errcode='23514'; end if;
  update public.subscription_invoices set
    amount_paid=new_paid,status=case when new_paid=amount_inc_vat then 'paid' else status end,
    paid_at=case when new_paid=amount_inc_vat then now() else paid_at end,updated_at=now()
  where id=invoice.id returning * into updated_invoice;
  insert into public.platform_admin_audit_events (staff_user_id,action,metadata)
  values ((select auth.uid()),'record_subscription_payment',jsonb_build_object('invoice_id',invoice.id,'amount',p_amount,'reason',p_reason));
  return updated_invoice;
end;
$$;

create or replace function public.platform_void_subscription_invoice(p_invoice_id uuid,p_reason text)
returns public.subscription_invoices
language plpgsql
security definer
set search_path = ''
as $$
declare invoice public.subscription_invoices; updated_invoice public.subscription_invoices;
begin
  if not private.is_platform_staff(array['platform_owner','platform_admin','finance']) then
    raise exception 'Platform invoice access required' using errcode = '42501';
  end if;
  if char_length(btrim(p_reason)) < 3 then raise exception 'Reason required' using errcode='22023'; end if;
  select * into invoice from public.subscription_invoices where id=p_invoice_id for update;
  if invoice.id is null then raise exception 'Invoice not found' using errcode='P0002'; end if;
  if invoice.status not in ('queued') or invoice.amount_paid > 0 then
    raise exception 'Only unpaid queued invoices can be voided' using errcode='23514';
  end if;
  update public.subscription_invoices set status='void',updated_at=now() where id=invoice.id returning * into updated_invoice;
  update public.subscription_invoice_delivery_jobs set status='cancelled',updated_at=now()
  where invoice_id=invoice.id and status in ('pending','retry');
  insert into public.platform_admin_audit_events (staff_user_id,action,metadata)
  values ((select auth.uid()),'void_subscription_invoice',jsonb_build_object('invoice_id',invoice.id,'reason',p_reason));
  return updated_invoice;
end;
$$;

revoke all on function public.get_platform_hq_billing(uuid) from public, anon;
revoke all on function public.platform_create_subscription_discount(uuid,uuid,text,text,text,numeric,date,date,integer,integer,text) from public, anon;
revoke all on function public.platform_create_manual_subscription_charge(uuid,uuid,text,text,numeric,numeric,date,date,date,date,text) from public, anon;
revoke all on function public.platform_issue_manual_subscription_charge(uuid) from public, anon;
revoke all on function public.platform_queue_subscription_invoice_resend(uuid,text) from public, anon;
revoke all on function public.platform_record_subscription_payment(uuid,numeric,text) from public, anon;
revoke all on function public.platform_void_subscription_invoice(uuid,text) from public, anon;

grant execute on function public.get_platform_hq_billing(uuid) to authenticated;
grant execute on function public.platform_create_subscription_discount(uuid,uuid,text,text,text,numeric,date,date,integer,integer,text) to authenticated;
grant execute on function public.platform_create_manual_subscription_charge(uuid,uuid,text,text,numeric,numeric,date,date,date,date,text) to authenticated;
grant execute on function public.platform_issue_manual_subscription_charge(uuid) to authenticated;
grant execute on function public.platform_queue_subscription_invoice_resend(uuid,text) to authenticated;
grant execute on function public.platform_record_subscription_payment(uuid,numeric,text) to authenticated;
grant execute on function public.platform_void_subscription_invoice(uuid,text) to authenticated;

commit;
