begin;

create table public.invoice_issuer_profiles (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  legal_name text not null check (char_length(legal_name) between 2 and 200),
  organization_number text not null check (char_length(organization_number) between 6 and 32),
  vat_number text not null check (char_length(vat_number) between 4 and 32),
  approved_for_f_tax boolean not null default false,
  address_line1 text not null,
  address_line2 text,
  postal_code text not null,
  city text not null,
  country_code text not null default 'SE' check (country_code ~ '^[A-Z]{2}$'),
  email text not null check (char_length(email)<=254 and position('@' in email)>1),
  phone text,
  bankgiro text,
  plusgiro text,
  iban text,
  bic text,
  swish_number text,
  invoice_prefix text not null default 'F' check (invoice_prefix ~ '^[A-Z0-9-]{1,20}$'),
  next_invoice_number bigint not null default 1 check (next_invoice_number>0),
  default_payment_terms_days integer not null default 30 check (default_payment_terms_days between 0 and 120),
  default_currency text not null default 'SEK' check (default_currency='SEK'),
  default_revenue_account text not null default '3041',
  default_output_vat_account text not null default '2611',
  accounts_receivable_account text not null default '1510',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (bankgiro is not null or plusgiro is not null or iban is not null)
);

create table public.tax_deduction_rate_versions (
  deduction_type text not null check (deduction_type in ('rot','rut')),
  valid_from date not null,
  valid_to date,
  max_percent_of_eligible_labor_inc_vat numeric(5,2) not null
    check (max_percent_of_eligible_labor_inc_vat between 0 and 100),
  annual_person_limit_sek numeric(12,2) not null check (annual_person_limit_sek>0),
  combined_annual_limit_sek numeric(12,2) not null check (combined_annual_limit_sek>0),
  source_url text not null check (source_url ~ '^https://'),
  created_at timestamptz not null default now(),
  primary key(deduction_type,valid_from),
  check (valid_to is null or valid_to>=valid_from)
);

insert into public.tax_deduction_rate_versions(
  deduction_type,valid_from,valid_to,max_percent_of_eligible_labor_inc_vat,
  annual_person_limit_sek,combined_annual_limit_sek,source_url
) values
  ('rot','2026-01-01',null,30,50000,75000,
    'https://www.skatteverket.se/foretag/skatterochavdrag/rotochrut.4.2ef18e6a125660db8b080002674.html'),
  ('rut','2026-01-01',null,50,75000,75000,
    'https://www.skatteverket.se/foretag/skatterochavdrag/rotochrut.4.2ef18e6a125660db8b080002674.html')
on conflict(deduction_type,valid_from) do update set
  valid_to=excluded.valid_to,
  max_percent_of_eligible_labor_inc_vat=excluded.max_percent_of_eligible_labor_inc_vat,
  annual_person_limit_sek=excluded.annual_person_limit_sek,
  combined_annual_limit_sek=excluded.combined_annual_limit_sek,
  source_url=excluded.source_url;

create table public.project_billing_settings (
  organization_id uuid not null,
  project_id uuid primary key,
  default_hourly_rate_ex_vat numeric(12,2) not null default 0 check (default_hourly_rate_ex_vat>=0),
  material_markup_percent numeric(6,2) not null default 0 check (material_markup_percent between 0 and 1000),
  default_vat_rate numeric(5,2) not null default 25 check (default_vat_rate between 0 and 100),
  time_rounding_minutes integer not null default 15 check (time_rounding_minutes in (1,5,6,10,15,30,60)),
  invoice_cadence text not null default 'manual'
    check (invoice_cadence in ('manual','weekly','monthly','milestone')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(organization_id,project_id)
    references public.projects(organization_id,id) on delete cascade
);

create table public.customer_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null,
  project_id uuid,
  quote_id uuid,
  original_invoice_id uuid,
  invoice_number text,
  invoice_kind text not null default 'standard'
    check (invoice_kind in ('standard','credit','aconto','partial','final')),
  source_mode text not null default 'manual'
    check (source_mode in ('manual','project','quote','mixed')),
  status text not null default 'draft'
    check (status in ('draft','issued','queued','sent','delivered','part_paid','paid','overdue','credited','void')),
  accounting_status text not null default 'not_ready'
    check (accounting_status in ('not_ready','waiting_for_connection','queued','synced','failed')),
  factoring_status text not null default 'unavailable'
    check (factoring_status in ('unavailable','eligible','requested','offered','sold','rejected')),
  invoice_date date not null default current_date,
  due_date date not null default (current_date+30),
  currency text not null default 'SEK' check (currency='SEK'),
  language text not null default 'sv' check (language in ('sv','en')),
  delivery_channel text not null default 'email'
    check (delivery_channel in ('email','peppol','pdf')),
  buyer_reference text,
  purchase_order_reference text,
  tax_deduction_type text not null default 'none'
    check (tax_deduction_type in ('none','rot','rut')),
  tax_deduction_profile_id uuid,
  amount_ex_vat numeric(14,2) not null default 0,
  vat_amount numeric(14,2) not null default 0,
  amount_inc_vat numeric(14,2) not null default 0,
  requested_tax_deduction_amount numeric(14,2) not null default 0 check (requested_tax_deduction_amount>=0),
  amount_payable numeric(14,2) not null default 0,
  amount_paid numeric(14,2) not null default 0 check (amount_paid>=0),
  customer_snapshot jsonb not null default '{}',
  issuer_snapshot jsonb not null default '{}',
  note_to_customer text check (note_to_customer is null or char_length(note_to_customer)<=4000),
  payment_reference text,
  contains_sensitive_identity boolean not null default false,
  pdf_storage_path text,
  content_hash text check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  issued_by_user_id uuid references auth.users(id) on delete restrict,
  issued_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,id),
  unique(organization_id,invoice_number),
  foreign key(organization_id,customer_id)
    references public.customers(organization_id,id) on delete restrict,
  foreign key(organization_id,project_id)
    references public.projects(organization_id,id) on delete restrict,
  foreign key(organization_id,quote_id)
    references public.quotes(organization_id,id) on delete restrict,
  foreign key(organization_id,tax_deduction_profile_id)
    references public.customer_tax_deduction_profiles(organization_id,id) on delete restrict,
  foreign key(organization_id,original_invoice_id)
    references public.customer_invoices(organization_id,id) on delete restrict,
  check (due_date>=invoice_date),
  check ((tax_deduction_type='none')=(tax_deduction_profile_id is null)),
  check (amount_inc_vat=amount_ex_vat+vat_amount),
  check (amount_payable=amount_inc_vat-requested_tax_deduction_amount),
  check ((status='draft' and invoice_number is null and issued_at is null)
     or (status<>'draft' and invoice_number is not null and issued_at is not null and content_hash is not null)),
  check ((invoice_kind='credit' and amount_ex_vat<=0 and vat_amount<=0 and amount_inc_vat<=0
          and requested_tax_deduction_amount=0)
     or (invoice_kind<>'credit' and amount_ex_vat>=0 and vat_amount>=0 and amount_inc_vat>=0)),
  check (invoice_kind<>'credit' or original_invoice_id is not null)
);

create table public.customer_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  invoice_id uuid not null,
  line_number integer not null check (line_number>0),
  item_code text,
  description text not null check (char_length(description) between 1 and 1000),
  quantity numeric(14,4) not null check (quantity<>0),
  unit text not null default 'st' check (char_length(unit) between 1 and 20),
  unit_price_ex_vat numeric(14,4) not null,
  discount_percent numeric(6,2) not null default 0 check (discount_percent between 0 and 100),
  line_amount_ex_vat numeric(14,2) not null default 0,
  vat_rate numeric(5,2) not null default 25 check (vat_rate between 0 and 100),
  vat_amount numeric(14,2) not null default 0,
  line_amount_inc_vat numeric(14,2) not null default 0,
  cost_category text not null default 'other'
    check (cost_category in ('labor','material','travel','equipment','subcontractor','other')),
  tax_deduction_eligible boolean not null default false,
  revenue_account text,
  project_dimension text,
  source_type text check (source_type is null or source_type in (
    'quote_estimate_item','change_order','time_entry','material_item','manual'
  )),
  source_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,id),
  unique(organization_id,invoice_id,line_number),
  foreign key(organization_id,invoice_id)
    references public.customer_invoices(organization_id,id) on delete cascade,
  check ((source_type is null)=(source_id is null)),
  check (not tax_deduction_eligible or cost_category='labor'),
  check (line_amount_inc_vat=line_amount_ex_vat+vat_amount)
);

create table public.customer_invoice_source_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  invoice_id uuid not null,
  source_type text not null check (source_type in (
    'quote_estimate_item','change_order','time_entry','material_item'
  )),
  source_id uuid not null,
  amount_ex_vat_snapshot numeric(14,2) not null,
  created_at timestamptz not null default now(),
  unique(organization_id,id),
  unique(organization_id,source_type,source_id),
  foreign key(organization_id,invoice_id)
    references public.customer_invoices(organization_id,id) on delete cascade
);

create table public.customer_invoice_tax_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  invoice_id uuid not null,
  tax_profile_id uuid not null,
  claimant_id uuid not null,
  requested_amount numeric(14,2) not null check (requested_amount>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,id),
  unique(organization_id,invoice_id,claimant_id),
  foreign key(organization_id,invoice_id)
    references public.customer_invoices(organization_id,id) on delete cascade,
  foreign key(organization_id,tax_profile_id)
    references public.customer_tax_deduction_profiles(organization_id,id) on delete restrict,
  foreign key(organization_id,claimant_id)
    references private.customer_tax_deduction_claimants(organization_id,id) on delete restrict
);

create table public.customer_invoice_delivery_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  invoice_id uuid not null,
  channel text not null check (channel in ('email','peppol','pdf')),
  idempotency_key text not null unique,
  status text not null default 'pending'
    check (status in ('pending','processing','sent','delivered','retry','failed','cancelled')),
  attempt_count integer not null default 0 check (attempt_count>=0),
  next_attempt_at timestamptz not null default now(),
  provider_message_id text,
  last_error_code text,
  last_error_message text,
  locked_at timestamptz,
  locked_by text,
  sent_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,id),
  foreign key(organization_id,invoice_id)
    references public.customer_invoices(organization_id,id) on delete cascade
);

create table public.customer_invoice_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  invoice_id uuid not null,
  event_type text not null check (event_type in (
    'draft_created','source_added','issued','delivery_queued','sent','delivered',
    'accounting_queued','accounting_synced','payment_recorded','credited','voided',
    'factoring_requested','factoring_offer_received','factoring_sold'
  )),
  actor_user_id uuid references auth.users(id) on delete set null,
  safe_summary text not null check (char_length(safe_summary) between 1 and 1000),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique(organization_id,id),
  foreign key(organization_id,invoice_id)
    references public.customer_invoices(organization_id,id) on delete cascade
);

create or replace function private.calculate_customer_invoice_line()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare invoice_status text;
begin
  select status into invoice_status from public.customer_invoices
  where organization_id=new.organization_id and id=new.invoice_id;
  if invoice_status is distinct from 'draft' then
    raise exception 'Endast utkast kan ändras' using errcode='42501';
  end if;
  new.line_amount_ex_vat:=round(new.quantity*new.unit_price_ex_vat*(1-new.discount_percent/100),2);
  new.vat_amount:=round(new.line_amount_ex_vat*new.vat_rate/100,2);
  new.line_amount_inc_vat:=new.line_amount_ex_vat+new.vat_amount;
  return new;
end;
$$;
revoke all on function private.calculate_customer_invoice_line()
  from public,anon,authenticated;
create trigger calculate_customer_invoice_line
  before insert or update on public.customer_invoice_lines
  for each row execute function private.calculate_customer_invoice_line();

create or replace function private.guard_customer_invoice_line_delete()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if not exists(select 1 from public.customer_invoices i
    where i.organization_id=old.organization_id and i.id=old.invoice_id and i.status='draft') then
    raise exception 'Utställda fakturarader är låsta' using errcode='42501';
  end if;
  return old;
end;
$$;
revoke all on function private.guard_customer_invoice_line_delete()
  from public,anon,authenticated;
create trigger guard_customer_invoice_line_delete
  before delete on public.customer_invoice_lines
  for each row execute function private.guard_customer_invoice_line_delete();

create or replace function private.guard_customer_invoice_child_draft()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare selected_org_id uuid:=coalesce(new.organization_id,old.organization_id);
declare selected_invoice_id uuid:=coalesce(new.invoice_id,old.invoice_id);
begin
  if not exists(select 1 from public.customer_invoices i
    where i.organization_id=selected_org_id and i.id=selected_invoice_id and i.status='draft') then
    raise exception 'Utställda fakturaunderlag är låsta' using errcode='42501';
  end if;
  return coalesce(new,old);
end;
$$;
revoke all on function private.guard_customer_invoice_child_draft()
  from public,anon,authenticated;
create trigger guard_customer_invoice_source_link_draft
  before insert or update or delete on public.customer_invoice_source_links
  for each row execute function private.guard_customer_invoice_child_draft();
create trigger guard_customer_invoice_tax_allocation_draft
  before insert or update or delete on public.customer_invoice_tax_allocations
  for each row execute function private.guard_customer_invoice_child_draft();

create or replace function private.recalculate_customer_invoice()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare selected_invoice_id uuid:=coalesce(new.invoice_id,old.invoice_id);
declare selected_org_id uuid:=coalesce(new.organization_id,old.organization_id);
declare deduction_total numeric(14,2);
begin
  select coalesce(sum(a.requested_amount),0) into deduction_total
  from public.customer_invoice_tax_allocations a
  where a.organization_id=selected_org_id and a.invoice_id=selected_invoice_id;
  update public.customer_invoices i set
    amount_ex_vat=coalesce((select sum(l.line_amount_ex_vat)
      from public.customer_invoice_lines l where l.organization_id=selected_org_id and l.invoice_id=selected_invoice_id),0),
    vat_amount=coalesce((select sum(l.vat_amount)
      from public.customer_invoice_lines l where l.organization_id=selected_org_id and l.invoice_id=selected_invoice_id),0),
    amount_inc_vat=coalesce((select sum(l.line_amount_inc_vat)
      from public.customer_invoice_lines l where l.organization_id=selected_org_id and l.invoice_id=selected_invoice_id),0),
    requested_tax_deduction_amount=deduction_total,
    amount_payable=coalesce((select sum(l.line_amount_inc_vat)
      from public.customer_invoice_lines l where l.organization_id=selected_org_id and l.invoice_id=selected_invoice_id),0)-deduction_total,
    updated_at=now()
  where i.organization_id=selected_org_id and i.id=selected_invoice_id and i.status='draft';
  return coalesce(new,old);
end;
$$;
revoke all on function private.recalculate_customer_invoice()
  from public,anon,authenticated;
create trigger recalculate_customer_invoice_from_lines
  after insert or update or delete on public.customer_invoice_lines
  for each row execute function private.recalculate_customer_invoice();
create trigger recalculate_customer_invoice_from_allocations
  after insert or update or delete on public.customer_invoice_tax_allocations
  for each row execute function private.recalculate_customer_invoice();

create or replace function private.guard_customer_invoice_core()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if old.status<>'draft' and row(
    new.organization_id,new.customer_id,new.project_id,new.quote_id,new.original_invoice_id,
    new.invoice_number,new.invoice_kind,new.source_mode,new.invoice_date,new.due_date,
    new.currency,new.language,new.delivery_channel,new.buyer_reference,
    new.purchase_order_reference,new.tax_deduction_type,new.tax_deduction_profile_id,
    new.amount_ex_vat,new.vat_amount,new.amount_inc_vat,new.requested_tax_deduction_amount,
    new.amount_payable,new.customer_snapshot,new.issuer_snapshot,new.payment_reference,
    new.contains_sensitive_identity,new.content_hash,new.issued_by_user_id,new.issued_at,
    new.created_by_user_id,new.created_at
  ) is distinct from row(
    old.organization_id,old.customer_id,old.project_id,old.quote_id,old.original_invoice_id,
    old.invoice_number,old.invoice_kind,old.source_mode,old.invoice_date,old.due_date,
    old.currency,old.language,old.delivery_channel,old.buyer_reference,
    old.purchase_order_reference,old.tax_deduction_type,old.tax_deduction_profile_id,
    old.amount_ex_vat,old.vat_amount,old.amount_inc_vat,old.requested_tax_deduction_amount,
    old.amount_payable,old.customer_snapshot,old.issuer_snapshot,old.payment_reference,
    old.contains_sensitive_identity,old.content_hash,old.issued_by_user_id,old.issued_at,
    old.created_by_user_id,old.created_at
  ) then
    raise exception 'En utställd fakturas ekonomiska innehåll är låst'
      using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_customer_invoice_core()
  from public,anon,authenticated;
create trigger guard_customer_invoice_core
  before update on public.customer_invoices
  for each row execute function private.guard_customer_invoice_core();

create or replace function private.block_customer_invoice_event_change()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  raise exception 'Fakturahistorik är oföränderlig' using errcode='42501';
end;
$$;
revoke all on function private.block_customer_invoice_event_change()
  from public,anon,authenticated;
create trigger block_customer_invoice_event_change
  before update or delete on public.customer_invoice_events
  for each row execute function private.block_customer_invoice_event_change();

create or replace function private.allocate_customer_invoice_number(p_organization_id uuid)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare issuer record;
begin
  select invoice_prefix,next_invoice_number into issuer
  from public.invoice_issuer_profiles
  where organization_id=p_organization_id and active for update;
  if issuer.invoice_prefix is null then
    raise exception 'Aktiv fakturautställare saknas' using errcode='P0002';
  end if;
  update public.invoice_issuer_profiles set next_invoice_number=next_invoice_number+1,
    updated_at=now() where organization_id=p_organization_id;
  return issuer.invoice_prefix||lpad(issuer.next_invoice_number::text,8,'0');
end;
$$;
revoke all on function private.allocate_customer_invoice_number(uuid)
  from public,anon,authenticated;

create or replace function public.create_customer_invoice_draft(
  p_organization_id uuid,
  p_customer_id uuid,
  p_project_id uuid default null,
  p_quote_id uuid default null,
  p_invoice_kind text default 'standard',
  p_source_mode text default 'manual'
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare invoice_id uuid;
declare payment_days integer;
declare delivery text;
begin
  if not private.has_organization_role(
    p_organization_id,array['owner','admin','office']::text[],(select auth.uid())
  ) then
    raise exception 'Behörighet saknas' using errcode='42501';
  end if;
  select default_payment_terms_days,default_delivery_channel
    into payment_days,delivery from public.customers
  where organization_id=p_organization_id and id=p_customer_id and active;
  if payment_days is null then
    raise exception 'Aktiv kund saknas' using errcode='P0002';
  end if;
  if p_project_id is not null and not exists(select 1 from public.projects
    where organization_id=p_organization_id and id=p_project_id) then
    raise exception 'Projektet tillhör inte företaget' using errcode='42501';
  end if;
  if p_quote_id is not null and not exists(select 1 from public.quotes
    where organization_id=p_organization_id and id=p_quote_id) then
    raise exception 'Offerten tillhör inte företaget' using errcode='42501';
  end if;
  insert into public.customer_invoices(
    organization_id,customer_id,project_id,quote_id,invoice_kind,source_mode,
    due_date,delivery_channel,created_by_user_id
  ) values(
    p_organization_id,p_customer_id,p_project_id,p_quote_id,p_invoice_kind,p_source_mode,
    current_date+payment_days,delivery,(select auth.uid())
  ) returning id into invoice_id;
  insert into public.customer_invoice_events(
    organization_id,invoice_id,event_type,actor_user_id,safe_summary
  ) values(p_organization_id,invoice_id,'draft_created',(select auth.uid()),'Fakturautkast skapat');
  return invoice_id;
end;
$$;
revoke all on function public.create_customer_invoice_draft(uuid,uuid,uuid,uuid,text,text)
  from public,anon;
grant execute on function public.create_customer_invoice_draft(uuid,uuid,uuid,uuid,text,text)
  to authenticated;

create or replace function public.populate_invoice_from_project(
  p_organization_id uuid,
  p_invoice_id uuid,
  p_include_change_orders boolean default true,
  p_include_approved_time boolean default true,
  p_include_delivered_material boolean default true
)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare inv record;
declare settings record;
declare item record;
declare next_line integer;
declare added integer:=0;
declare quantity_hours numeric(14,4);
declare unit_price numeric(14,4);
declare amount_snapshot numeric(14,2);
begin
  if not private.has_organization_role(
    p_organization_id,array['owner','admin','office']::text[],(select auth.uid())
  ) then raise exception 'Behörighet saknas' using errcode='42501'; end if;
  select * into inv from public.customer_invoices
  where organization_id=p_organization_id and id=p_invoice_id and status='draft' for update;
  if inv.id is null or inv.project_id is null then
    raise exception 'Fakturautkast med projekt krävs' using errcode='P0002';
  end if;
  select * into settings from public.project_billing_settings
  where organization_id=p_organization_id and project_id=inv.project_id;
  select coalesce(max(line_number),0)+1 into next_line from public.customer_invoice_lines
  where organization_id=p_organization_id and invoice_id=p_invoice_id;

  if p_include_change_orders then
    for item in select c.* from public.change_orders c
      where c.organization_id=p_organization_id and c.project_id=inv.project_id
        and c.status in ('approved','in_progress','completed','invoice_ready')
        and c.price_status='customer_approved' and c.price_amount>0
        and not exists(select 1 from public.customer_invoice_source_links l
          where l.organization_id=p_organization_id and l.source_type='change_order' and l.source_id=c.id)
      order by c.change_order_number
    loop
      insert into public.customer_invoice_lines(
        organization_id,invoice_id,line_number,item_code,description,quantity,unit,
        unit_price_ex_vat,vat_rate,cost_category,source_type,source_id
      ) values(
        p_organization_id,p_invoice_id,next_line,'ATA-'||item.change_order_number,
        'ÄTA: '||item.title,1,'st',item.price_amount,coalesce(settings.default_vat_rate,25),
        'other','change_order',item.id
      );
      insert into public.customer_invoice_source_links(
        organization_id,invoice_id,source_type,source_id,amount_ex_vat_snapshot
      ) values(p_organization_id,p_invoice_id,'change_order',item.id,item.price_amount);
      next_line:=next_line+1; added:=added+1;
    end loop;
  end if;

  if p_include_approved_time then
    if settings.default_hourly_rate_ex_vat is null or settings.default_hourly_rate_ex_vat<=0 then
      raise exception 'Timpris måste anges innan godkänd tid kan faktureras'
        using errcode='23514';
    end if;
    for item in select t.*,w.full_name from public.time_entries t
      join public.workers w on w.organization_id=t.organization_id and w.id=t.worker_id
      where t.organization_id=p_organization_id and t.project_id=inv.project_id
        and t.status='approved' and t.clock_out is not null
        and not exists(select 1 from public.customer_invoice_source_links l
          where l.organization_id=p_organization_id and l.source_type='time_entry' and l.source_id=t.id)
      order by t.clock_in
    loop
      quantity_hours:=ceil((extract(epoch from (item.clock_out-item.clock_in))/60)
        /settings.time_rounding_minutes)*settings.time_rounding_minutes/60;
      amount_snapshot:=round(quantity_hours*settings.default_hourly_rate_ex_vat,2);
      insert into public.customer_invoice_lines(
        organization_id,invoice_id,line_number,description,quantity,unit,
        unit_price_ex_vat,vat_rate,cost_category,tax_deduction_eligible,source_type,source_id
      ) values(
        p_organization_id,p_invoice_id,next_line,
        'Arbete '||item.full_name||' '||to_char(item.clock_in,'YYYY-MM-DD'),
        quantity_hours,'tim',settings.default_hourly_rate_ex_vat,settings.default_vat_rate,
        'labor',true,'time_entry',item.id
      );
      insert into public.customer_invoice_source_links(
        organization_id,invoice_id,source_type,source_id,amount_ex_vat_snapshot
      ) values(p_organization_id,p_invoice_id,'time_entry',item.id,amount_snapshot);
      next_line:=next_line+1; added:=added+1;
    end loop;
  end if;

  if p_include_delivered_material then
    for item in select m.* from public.material_items m
      where m.organization_id=p_organization_id and m.project_id=inv.project_id
        and m.status='delivered' and m.quantity>0 and m.unit_price>=0
        and not exists(select 1 from public.customer_invoice_source_links l
          where l.organization_id=p_organization_id and l.source_type='material_item' and l.source_id=m.id)
      order by m.created_at
    loop
      unit_price:=round(item.unit_price*(1+coalesce(settings.material_markup_percent,0)/100),4);
      amount_snapshot:=round(item.quantity*unit_price,2);
      insert into public.customer_invoice_lines(
        organization_id,invoice_id,line_number,item_code,description,quantity,unit,
        unit_price_ex_vat,vat_rate,cost_category,source_type,source_id
      ) values(
        p_organization_id,p_invoice_id,next_line,item.article_number,item.name,
        item.quantity,item.unit,unit_price,coalesce(settings.default_vat_rate,25),
        'material','material_item',item.id
      );
      insert into public.customer_invoice_source_links(
        organization_id,invoice_id,source_type,source_id,amount_ex_vat_snapshot
      ) values(p_organization_id,p_invoice_id,'material_item',item.id,amount_snapshot);
      next_line:=next_line+1; added:=added+1;
    end loop;
  end if;
  if added>0 then
    update public.customer_invoices set source_mode='project',updated_at=now()
    where id=p_invoice_id and organization_id=p_organization_id;
    insert into public.customer_invoice_events(
      organization_id,invoice_id,event_type,actor_user_id,safe_summary,metadata
    ) values(p_organization_id,p_invoice_id,'source_added',(select auth.uid()),
      'Godkända projektunderlag tillagda',jsonb_build_object('source_count',added));
  end if;
  return added;
end;
$$;
revoke all on function public.populate_invoice_from_project(uuid,uuid,boolean,boolean,boolean)
  from public,anon;
grant execute on function public.populate_invoice_from_project(uuid,uuid,boolean,boolean,boolean)
  to authenticated;

create or replace function public.populate_invoice_from_quote(
  p_organization_id uuid,
  p_invoice_id uuid,
  p_quote_id uuid
)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare version_id uuid;
declare item record;
declare next_line integer;
declare added integer:=0;
begin
  if not private.has_organization_role(
    p_organization_id,array['owner','admin','office']::text[],(select auth.uid())
  ) then raise exception 'Behörighet saknas' using errcode='42501'; end if;
  if not exists(select 1 from public.customer_invoices i
    where i.organization_id=p_organization_id and i.id=p_invoice_id and i.status='draft') then
    raise exception 'Fakturautkast saknas' using errcode='P0002';
  end if;
  select v.id into version_id from public.quote_estimate_versions v
  join public.quotes q on q.organization_id=v.organization_id and q.id=v.quote_id
  where v.organization_id=p_organization_id and v.quote_id=p_quote_id
    and q.status in ('signed','converted') and v.status='approved'
  order by v.version desc limit 1;
  if version_id is null then
    raise exception 'Godkänd och signerad offertkalkyl saknas' using errcode='23514';
  end if;
  select coalesce(max(line_number),0)+1 into next_line from public.customer_invoice_lines
  where organization_id=p_organization_id and invoice_id=p_invoice_id;
  for item in select e.* from public.quote_estimate_items e
    where e.organization_id=p_organization_id and e.estimate_version_id=version_id
      and e.sell_amount>0 and e.parent_item_id is not null
      and not exists(select 1 from public.customer_invoice_source_links l
        where l.organization_id=p_organization_id and l.source_type='quote_estimate_item' and l.source_id=e.id)
    order by e.sort_order,e.created_at
  loop
    insert into public.customer_invoice_lines(
      organization_id,invoice_id,line_number,item_code,description,quantity,unit,
      unit_price_ex_vat,vat_rate,cost_category,tax_deduction_eligible,source_type,source_id
    ) values(
      p_organization_id,p_invoice_id,next_line,item.item_code,item.description,
      1,'post',item.sell_amount,25,
      case when item.item_type='labor' then 'labor' when item.item_type='material' then 'material' else 'other' end,
      item.item_type='labor','quote_estimate_item',item.id
    );
    insert into public.customer_invoice_source_links(
      organization_id,invoice_id,source_type,source_id,amount_ex_vat_snapshot
    ) values(p_organization_id,p_invoice_id,'quote_estimate_item',item.id,item.sell_amount);
    next_line:=next_line+1; added:=added+1;
  end loop;
  update public.customer_invoices set quote_id=p_quote_id,
    source_mode=case when source_mode='manual' then 'quote' else 'mixed' end,updated_at=now()
  where id=p_invoice_id and organization_id=p_organization_id;
  return added;
end;
$$;
revoke all on function public.populate_invoice_from_quote(uuid,uuid,uuid)
  from public,anon;
grant execute on function public.populate_invoice_from_quote(uuid,uuid,uuid)
  to authenticated;

create or replace function public.issue_customer_invoice(
  p_organization_id uuid,
  p_invoice_id uuid
)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare inv record;
declare customer record;
declare issuer record;
declare rate record;
declare eligible_labor_inc_vat numeric(14,2);
declare max_deduction numeric(14,2);
declare new_number text;
declare invoice_hash text;
declare queued_count integer:=0;
declare connection_id uuid;
begin
  if not private.has_organization_role(
    p_organization_id,array['owner','admin','office']::text[],(select auth.uid())
  ) then raise exception 'Behörighet saknas' using errcode='42501'; end if;
  select * into inv from public.customer_invoices
  where organization_id=p_organization_id and id=p_invoice_id and status='draft' for update;
  if inv.id is null then raise exception 'Fakturautkast saknas' using errcode='P0002'; end if;
  if not exists(select 1 from public.customer_invoice_lines l
    where l.organization_id=p_organization_id and l.invoice_id=p_invoice_id) then
    raise exception 'Fakturan måste ha minst en rad' using errcode='23514';
  end if;
  if inv.invoice_kind<>'credit' and inv.amount_inc_vat<=0 then
    raise exception 'Fakturabeloppet måste vara större än noll' using errcode='23514';
  end if;
  if inv.invoice_kind='credit' and inv.amount_inc_vat>=0 then
    raise exception 'Kreditfakturan måste ha negativt belopp' using errcode='23514';
  end if;
  select * into customer from public.customers c
  where c.organization_id=p_organization_id and c.id=inv.customer_id and c.active;
  if customer.id is null or customer.address_line1 is null or customer.postal_code is null
     or customer.city is null then
    raise exception 'Kompletta kund- och adressuppgifter krävs' using errcode='23514';
  end if;
  if inv.delivery_channel='email' and customer.email is null then
    raise exception 'Kundens e-postadress saknas' using errcode='23514';
  end if;
  if inv.delivery_channel='peppol' and customer.peppol_id is null then
    raise exception 'Kundens Peppol-id saknas' using errcode='23514';
  end if;
  select * into issuer from public.invoice_issuer_profiles i
  where i.organization_id=p_organization_id and i.active;
  if issuer.organization_id is null then
    raise exception 'Företagets fakturauppgifter är inte kompletta' using errcode='P0002';
  end if;
  if inv.tax_deduction_type<>'none' then
    if customer.customer_type<>'private_person' or not exists(
      select 1 from private.customer_person_identifiers p
      where p.organization_id=p_organization_id and p.customer_id=customer.id
    ) then
      raise exception 'Personnummer krävs för ROT/RUT' using errcode='23514';
    end if;
    if not exists(select 1 from public.customer_tax_deduction_profiles p
      where p.organization_id=p_organization_id and p.id=inv.tax_deduction_profile_id
        and p.customer_id=customer.id and p.deduction_type=inv.tax_deduction_type and p.active) then
      raise exception 'Giltigt ROT/RUT-underlag saknas' using errcode='23514';
    end if;
    select * into rate from public.tax_deduction_rate_versions r
    where r.deduction_type=inv.tax_deduction_type and r.valid_from<=inv.invoice_date
      and (r.valid_to is null or r.valid_to>=inv.invoice_date)
    order by r.valid_from desc limit 1;
    if rate.deduction_type is null then
      raise exception 'Aktuell ROT/RUT-regel saknas' using errcode='P0002';
    end if;
    select coalesce(sum(l.line_amount_inc_vat),0) into eligible_labor_inc_vat
    from public.customer_invoice_lines l
    where l.organization_id=p_organization_id and l.invoice_id=p_invoice_id
      and l.cost_category='labor' and l.tax_deduction_eligible;
    max_deduction:=round(eligible_labor_inc_vat*rate.max_percent_of_eligible_labor_inc_vat/100,2);
    if inv.requested_tax_deduction_amount<=0 or inv.requested_tax_deduction_amount>max_deduction then
      raise exception 'Begärt ROT/RUT-avdrag överstiger tillåtet arbetskostnadsunderlag'
        using errcode='23514';
    end if;
    if abs((select coalesce(sum(a.requested_amount),0)
      from public.customer_invoice_tax_allocations a
      where a.organization_id=p_organization_id and a.invoice_id=p_invoice_id)
      -inv.requested_tax_deduction_amount)>0.01 then
      raise exception 'ROT/RUT-fördelningen stämmer inte' using errcode='23514';
    end if;
  elsif inv.requested_tax_deduction_amount<>0 then
    raise exception 'Skatteavdrag kräver ROT- eller RUT-val' using errcode='23514';
  end if;

  new_number:=private.allocate_customer_invoice_number(p_organization_id);
  invoice_hash:=encode(extensions.digest(convert_to(jsonb_build_object(
    'organization_id',p_organization_id,'invoice_id',p_invoice_id,
    'invoice_number',new_number,'customer_id',inv.customer_id,'project_id',inv.project_id,
    'quote_id',inv.quote_id,'invoice_kind',inv.invoice_kind,'invoice_date',inv.invoice_date,
    'due_date',inv.due_date,'amount_ex_vat',inv.amount_ex_vat,'vat_amount',inv.vat_amount,
    'amount_inc_vat',inv.amount_inc_vat,'tax_deduction_type',inv.tax_deduction_type,
    'requested_tax_deduction_amount',inv.requested_tax_deduction_amount,
    'lines',(select jsonb_agg(jsonb_build_object(
      'line_number',l.line_number,'description',l.description,'quantity',l.quantity,
      'unit_price_ex_vat',l.unit_price_ex_vat,'line_amount_ex_vat',l.line_amount_ex_vat,
      'vat_rate',l.vat_rate,'vat_amount',l.vat_amount
    ) order by l.line_number) from public.customer_invoice_lines l
      where l.organization_id=p_organization_id and l.invoice_id=p_invoice_id)
  )::text,'UTF8'),'sha256'),'hex');

  update public.customer_invoices set
    invoice_number=new_number,status='issued',accounting_status='waiting_for_connection',
    factoring_status=case when invoice_kind<>'credit' and amount_payable>0 then 'eligible' else 'unavailable' end,
    customer_snapshot=jsonb_strip_nulls(jsonb_build_object(
      'customer_number',customer.customer_number,'customer_type',customer.customer_type,
      'legal_name',customer.legal_name,'contact_name',customer.contact_name,
      'email',customer.email,'phone',customer.phone,'organization_number',customer.organization_number,
      'vat_number',customer.vat_number,'address_line1',customer.address_line1,
      'address_line2',customer.address_line2,'postal_code',customer.postal_code,
      'city',customer.city,'country_code',customer.country_code,'peppol_id',customer.peppol_id,
      'person_identifier_masked',(select p.masked_identifier
        from private.customer_person_identifiers p where p.organization_id=p_organization_id and p.customer_id=customer.id)
    )),
    issuer_snapshot=jsonb_strip_nulls(jsonb_build_object(
      'legal_name',issuer.legal_name,'organization_number',issuer.organization_number,
      'vat_number',issuer.vat_number,'approved_for_f_tax',issuer.approved_for_f_tax,
      'address_line1',issuer.address_line1,'address_line2',issuer.address_line2,
      'postal_code',issuer.postal_code,'city',issuer.city,'country_code',issuer.country_code,
      'email',issuer.email,'phone',issuer.phone,'bankgiro',issuer.bankgiro,
      'plusgiro',issuer.plusgiro,'iban',issuer.iban,'bic',issuer.bic,'swish_number',issuer.swish_number
    )),
    payment_reference=new_number,contains_sensitive_identity=tax_deduction_type<>'none',
    content_hash=invoice_hash,issued_by_user_id=(select auth.uid()),issued_at=now(),updated_at=now()
  where organization_id=p_organization_id and id=p_invoice_id;

  insert into public.customer_invoice_events(
    organization_id,invoice_id,event_type,actor_user_id,safe_summary
  ) values(p_organization_id,p_invoice_id,'issued',(select auth.uid()),'Faktura '||new_number||' utställd');
  insert into public.customer_invoice_delivery_jobs(
    organization_id,invoice_id,channel,idempotency_key
  ) values(p_organization_id,p_invoice_id,inv.delivery_channel,
    'customer-invoice:'||p_invoice_id::text||':'||inv.delivery_channel);
  insert into public.customer_invoice_events(
    organization_id,invoice_id,event_type,actor_user_id,safe_summary
  ) values(p_organization_id,p_invoice_id,'delivery_queued',(select auth.uid()),'Fakturaleverans köad');

  for connection_id in select c.id from public.organization_accounting_connections c
    where c.organization_id=p_organization_id and c.status='active'
      and c.export_customer_invoices and c.auto_export_customer_invoices
  loop
    perform private.queue_accounting_job(
      p_organization_id,connection_id,
      case when inv.invoice_kind='credit' then 'credit_invoice' else 'customer_invoice' end,
      p_invoice_id,'create',1,'approved',(select auth.uid()),(select auth.uid())
    );
    queued_count:=queued_count+1;
  end loop;
  if queued_count>0 then
    update public.customer_invoices set accounting_status='queued',updated_at=now()
    where organization_id=p_organization_id and id=p_invoice_id;
    insert into public.customer_invoice_events(
      organization_id,invoice_id,event_type,actor_user_id,safe_summary,metadata
    ) values(p_organization_id,p_invoice_id,'accounting_queued',(select auth.uid()),
      'Överföring till bokföringsprogram köad',jsonb_build_object('connection_count',queued_count));
  end if;
  return new_number;
end;
$$;
revoke all on function public.issue_customer_invoice(uuid,uuid) from public,anon;
grant execute on function public.issue_customer_invoice(uuid,uuid) to authenticated;

create or replace function private.queue_waiting_customer_invoices()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare inv record;
begin
  if new.status='active' and new.export_customer_invoices and new.auto_export_customer_invoices
     and (tg_op='INSERT' or old.status is distinct from new.status or old.auto_export_customer_invoices is distinct from new.auto_export_customer_invoices) then
    for inv in select i.* from public.customer_invoices i
      where i.organization_id=new.organization_id and i.status<>'draft'
        and i.accounting_status='waiting_for_connection'
      order by i.issued_at limit 1000
    loop
      perform private.queue_accounting_job(
        new.organization_id,new.id,
        case when inv.invoice_kind='credit' then 'credit_invoice' else 'customer_invoice' end,
        inv.id,'create',1,'approved',inv.issued_by_user_id,inv.issued_by_user_id
      );
      update public.customer_invoices set accounting_status='queued',updated_at=now()
      where id=inv.id;
    end loop;
  end if;
  return new;
end;
$$;
revoke all on function private.queue_waiting_customer_invoices()
  from public,anon,authenticated;
create trigger queue_waiting_customer_invoices
  after insert or update of status,auto_export_customer_invoices
  on public.organization_accounting_connections
  for each row execute function private.queue_waiting_customer_invoices();

do $$
declare t text;
begin
  foreach t in array array[
    'invoice_issuer_profiles','tax_deduction_rate_versions','project_billing_settings',
    'customer_invoices','customer_invoice_lines','customer_invoice_source_links',
    'customer_invoice_tax_allocations','customer_invoice_delivery_jobs',
    'customer_invoice_events'
  ] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('alter table public.%I force row level security',t);
  end loop;
end $$;

create policy tax_deduction_rate_versions_read on public.tax_deduction_rate_versions
  for select to anon,authenticated using(valid_from<=current_date);

do $$
declare t text;
begin
  foreach t in array array[
    'invoice_issuer_profiles','project_billing_settings','customer_invoices',
    'customer_invoice_lines','customer_invoice_source_links','customer_invoice_tax_allocations',
    'customer_invoice_delivery_jobs','customer_invoice_events'
  ] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (private.has_organization_role(organization_id,array[''owner'',''admin'',''office'']::text[],(select auth.uid())))',
      t||'_finance_select',t
    );
  end loop;
end $$;

create policy invoice_issuer_profiles_admin_insert on public.invoice_issuer_profiles
  for insert to authenticated with check(private.has_organization_role(
    organization_id,array['owner','admin']::text[],(select auth.uid())
  ));
create policy invoice_issuer_profiles_admin_update on public.invoice_issuer_profiles
  for update to authenticated using(private.has_organization_role(
    organization_id,array['owner','admin']::text[],(select auth.uid())
  )) with check(private.has_organization_role(
    organization_id,array['owner','admin']::text[],(select auth.uid())
  ));

do $$
declare t text;
begin
  foreach t in array array[
    'project_billing_settings','customer_invoice_lines',
    'customer_invoice_source_links','customer_invoice_tax_allocations'
  ] loop
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (private.has_organization_role(organization_id,array[''owner'',''admin'',''office'']::text[],(select auth.uid())))',
      t||'_finance_insert',t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (private.has_organization_role(organization_id,array[''owner'',''admin'',''office'']::text[],(select auth.uid()))) with check (private.has_organization_role(organization_id,array[''owner'',''admin'',''office'']::text[],(select auth.uid())))',
      t||'_finance_update',t
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (private.has_organization_role(organization_id,array[''owner'',''admin'',''office'']::text[],(select auth.uid())))',
      t||'_finance_delete',t
    );
  end loop;
end $$;

create policy customer_invoices_finance_insert on public.customer_invoices
  for insert to authenticated with check(
    status='draft' and created_by_user_id=(select auth.uid())
    and private.has_organization_role(
      organization_id,array['owner','admin','office']::text[],(select auth.uid())
    )
  );
create policy customer_invoices_finance_update_draft on public.customer_invoices
  for update to authenticated using(
    status='draft' and private.has_organization_role(
      organization_id,array['owner','admin','office']::text[],(select auth.uid())
    )
  ) with check(
    status='draft' and private.has_organization_role(
      organization_id,array['owner','admin','office']::text[],(select auth.uid())
    )
  );
create policy customer_invoices_finance_delete_draft on public.customer_invoices
  for delete to authenticated using(
    status='draft' and private.has_organization_role(
      organization_id,array['owner','admin','office']::text[],(select auth.uid())
    )
  );

revoke all on public.invoice_issuer_profiles,public.tax_deduction_rate_versions,
  public.project_billing_settings,public.customer_invoices,public.customer_invoice_lines,
  public.customer_invoice_source_links,public.customer_invoice_tax_allocations,
  public.customer_invoice_delivery_jobs,public.customer_invoice_events
from anon,authenticated;
grant select on public.tax_deduction_rate_versions to anon,authenticated;
grant select,insert,update on public.invoice_issuer_profiles to authenticated;
grant select,insert,update,delete on public.project_billing_settings,
  public.customer_invoices,public.customer_invoice_lines,
  public.customer_invoice_source_links,public.customer_invoice_tax_allocations
to authenticated;
grant select on public.customer_invoice_delivery_jobs,public.customer_invoice_events
  to authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'invoice_issuer_profiles','project_billing_settings','customer_invoices',
    'customer_invoice_lines','customer_invoice_tax_allocations',
    'customer_invoice_delivery_jobs'
  ] loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',t
    );
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'invoice_issuer_profiles','project_billing_settings','customer_invoices',
    'customer_invoice_lines','customer_invoice_source_links',
    'customer_invoice_tax_allocations','customer_invoice_delivery_jobs',
    'customer_invoice_events'
  ] loop
    execute format(
      'create trigger write_audit_log after insert or update or delete on public.%I for each row execute function private.write_audit_log()',t
    );
  end loop;
end $$;

create index customer_invoices_org_date_status_idx
  on public.customer_invoices(organization_id,invoice_date desc,status);
create index customer_invoices_project_idx
  on public.customer_invoices(organization_id,project_id,invoice_date desc)
  where project_id is not null;
create index customer_invoice_lines_invoice_idx
  on public.customer_invoice_lines(organization_id,invoice_id,line_number);
create index customer_invoice_delivery_queue_idx
  on public.customer_invoice_delivery_jobs(status,next_attempt_at)
  where status in ('pending','retry');
create index customer_invoice_events_invoice_idx
  on public.customer_invoice_events(organization_id,invoice_id,created_at);

commit;
