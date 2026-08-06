begin;

alter table public.platform_staff
  drop constraint if exists platform_staff_role_check;
alter table public.platform_staff
  add constraint platform_staff_role_check
  check (role in ('platform_owner','platform_admin','sales','support','finance','read_only'));

create table public.platform_crm_accounts (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  lifecycle_stage text not null default 'customer'
    check (lifecycle_stage in ('lead','qualified','proposal','negotiation','customer','paused','churned')),
  account_status text not null default 'active'
    check (account_status in ('active','watch','blocked','closed')),
  owner_staff_user_id uuid references public.platform_staff(user_id) on delete set null,
  source text,
  industry text,
  employee_count integer check (employee_count is null or employee_count >= 0),
  annual_revenue_estimate numeric(16,2) check (annual_revenue_estimate is null or annual_revenue_estimate >= 0),
  health_score integer not null default 70 check (health_score between 0 and 100),
  next_action_at timestamptz,
  internal_notes text not null default '' check (char_length(internal_notes) <= 10000),
  tags text[] not null default '{}',
  created_by_user_id uuid not null default auth.uid() references auth.users(id),
  updated_by_user_id uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.platform_crm_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 2 and 200),
  title text,
  email text check (email is null or (char_length(email) between 5 and 254 and position('@' in email) > 1)),
  phone text,
  contact_type text not null default 'general'
    check (contact_type in ('general','decision_maker','billing','technical','legal','signatory')),
  primary_contact boolean not null default false,
  active boolean not null default true,
  notes text not null default '' check (char_length(notes) <= 5000),
  created_by_user_id uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index platform_crm_contacts_one_primary_idx
  on public.platform_crm_contacts (organization_id)
  where primary_contact and active;
create index platform_crm_contacts_org_idx
  on public.platform_crm_contacts (organization_id, active desc, created_at desc);

create table public.platform_crm_activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid references public.platform_crm_contacts(id) on delete set null,
  activity_type text not null
    check (activity_type in ('note','call','email','meeting','task','proposal','contract','billing','support')),
  subject text not null check (char_length(btrim(subject)) between 2 and 240),
  body text not null default '' check (char_length(body) <= 10000),
  occurred_at timestamptz not null default now(),
  due_at timestamptz,
  completed_at timestamptz,
  created_by_user_id uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create index platform_crm_activities_org_occurred_idx
  on public.platform_crm_activities (organization_id, occurred_at desc, id desc);
create index platform_crm_activities_due_idx
  on public.platform_crm_activities (due_at, organization_id)
  where completed_at is null and due_at is not null;

create table public.platform_pricing_proposals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  plan_id uuid not null references public.plans(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 2 and 240),
  seat_count integer not null check (seat_count > 0),
  module_slugs text[] not null default '{}',
  term_months integer not null check (term_months in (12,24,36,48)),
  support_level text not null default 'standard'
    check (support_level in ('standard','priority','dedicated')),
  billing_interval_months integer not null default 1 check (billing_interval_months in (1,3,12)),
  list_monthly_price_ex_vat numeric(14,2) not null check (list_monthly_price_ex_vat >= 0),
  conservative_monthly_price_ex_vat numeric(14,2) not null check (conservative_monthly_price_ex_vat >= 0),
  recommended_monthly_price_ex_vat numeric(14,2) not null check (recommended_monthly_price_ex_vat >= 0),
  aggressive_monthly_price_ex_vat numeric(14,2) not null check (aggressive_monthly_price_ex_vat >= 0),
  recommended_discount_percent numeric(6,2) not null check (recommended_discount_percent between 0 and 100),
  estimated_monthly_cost numeric(14,2) not null default 0 check (estimated_monthly_cost >= 0),
  estimated_margin_percent numeric(6,2) check (estimated_margin_percent is null or estimated_margin_percent between -1000 and 100),
  assumptions jsonb not null default '{}'::jsonb,
  status text not null default 'draft'
    check (status in ('draft','internal_review','sent','accepted','declined','expired','superseded')),
  valid_until date,
  created_by_user_id uuid not null default auth.uid() references auth.users(id),
  approved_by_user_id uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index platform_pricing_proposals_org_status_idx
  on public.platform_pricing_proposals (organization_id, status, created_at desc);

create table public.platform_contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subscription_id uuid references public.organization_subscriptions(id) on delete set null,
  pricing_proposal_id uuid references public.platform_pricing_proposals(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 2 and 240),
  contract_type text not null default 'enterprise'
    check (contract_type in ('standard','enterprise','amendment','data_processing','support')),
  status text not null default 'draft'
    check (status in ('draft','internal_review','sent','viewed','signed','active','expired','terminated','superseded')),
  starts_on date,
  ends_on date,
  auto_renews boolean not null default false,
  custom_terms text not null default '' check (char_length(custom_terms) <= 30000),
  document_storage_path text,
  immutable_document_sha256 text check (immutable_document_sha256 is null or immutable_document_sha256 ~ '^[0-9a-f]{64}$'),
  sent_at timestamptz,
  viewed_at timestamptz,
  signed_at timestamptz,
  signed_by_name text,
  signed_by_email text,
  created_by_user_id uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create index platform_contracts_org_status_idx
  on public.platform_contracts (organization_id, status, created_at desc);

alter table public.platform_crm_accounts enable row level security;
alter table public.platform_crm_contacts enable row level security;
alter table public.platform_crm_activities enable row level security;
alter table public.platform_pricing_proposals enable row level security;
alter table public.platform_contracts enable row level security;

revoke all on public.platform_crm_accounts from public, anon, authenticated;
revoke all on public.platform_crm_contacts from public, anon, authenticated;
revoke all on public.platform_crm_activities from public, anon, authenticated;
revoke all on public.platform_pricing_proposals from public, anon, authenticated;
revoke all on public.platform_contracts from public, anon, authenticated;

create or replace function public.get_platform_hq_workspace(requested_organization_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not private.is_platform_staff(array['platform_owner','platform_admin','sales','support','finance','read_only']) then
    raise exception 'Platform staff access required' using errcode = '42501';
  end if;

  insert into public.platform_admin_audit_events (staff_user_id, action, metadata)
  values ((select auth.uid()), 'view_platform_hq', jsonb_build_object('organization_id', requested_organization_id));

  select jsonb_build_object(
    'summary', jsonb_build_object(
      'customers', (select count(*) from public.organizations where status <> 'deleted'),
      'leads', (select count(*) from public.platform_crm_accounts where lifecycle_stage in ('lead','qualified','proposal','negotiation')),
      'enterprise_proposals', (select count(*) from public.platform_pricing_proposals where status in ('draft','internal_review','sent')),
      'active_contracts', (select count(*) from public.platform_contracts where status in ('signed','active')),
      'open_tasks', (select count(*) from public.platform_crm_activities where due_at is not null and completed_at is null)
    ),
    'organizations', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.created_at desc)
      from (
        select organization.id, organization.name, organization.organization_number,
          organization.business_form, organization.status, organization.created_at,
          crm.lifecycle_stage, crm.account_status, crm.health_score, crm.next_action_at,
          crm.tags, subscription.id as subscription_id, subscription.status as subscription_status,
          subscription.seat_count, subscription.trial_ends_at, plan.id as plan_id,
          plan.name as plan_name, billing.customer_number, billing.billing_email,
          billing.auto_invoice_enabled,
          coalesce(member_count.total, 0) as member_count,
          coalesce(invoice_stats.outstanding, 0) as outstanding_inc_vat,
          invoice_stats.last_invoice_date
        from public.organizations organization
        left join public.platform_crm_accounts crm on crm.organization_id = organization.id
        left join lateral (
          select candidate.* from public.organization_subscriptions candidate
          where candidate.organization_id = organization.id
          order by candidate.created_at desc limit 1
        ) subscription on true
        left join public.plans plan on plan.id = subscription.plan_id
        left join public.organization_billing_profiles billing on billing.organization_id = organization.id
        left join lateral (
          select count(*) as total from public.organization_members member
          where member.organization_id = organization.id and member.active
        ) member_count on true
        left join lateral (
          select coalesce(sum(greatest(invoice.amount_inc_vat - invoice.amount_paid, 0)), 0) as outstanding,
            max(invoice.invoice_date) as last_invoice_date
          from public.subscription_invoices invoice
          where invoice.organization_id = organization.id and invoice.status not in ('void','credited')
        ) invoice_stats on true
        where organization.status <> 'deleted'
        order by organization.created_at desc
        limit 500
      ) item
    ), '[]'::jsonb),
    'selected', case when requested_organization_id is null then null else jsonb_build_object(
      'organization', (select to_jsonb(o) from public.organizations o where o.id = requested_organization_id),
      'crm', (select to_jsonb(c) from public.platform_crm_accounts c where c.organization_id = requested_organization_id),
      'billing_profile', (select to_jsonb(b) from public.organization_billing_profiles b where b.organization_id = requested_organization_id),
      'subscription', (select to_jsonb(s) || jsonb_build_object('plan_name', p.name)
        from public.organization_subscriptions s join public.plans p on p.id = s.plan_id
        where s.organization_id = requested_organization_id order by s.created_at desc limit 1),
      'contacts', coalesce((select jsonb_agg(to_jsonb(c) order by c.primary_contact desc, c.created_at desc)
        from public.platform_crm_contacts c where c.organization_id = requested_organization_id), '[]'::jsonb),
      'activities', coalesce((select jsonb_agg(to_jsonb(a) order by a.occurred_at desc, a.id desc)
        from (select * from public.platform_crm_activities where organization_id = requested_organization_id order by occurred_at desc limit 200) a), '[]'::jsonb),
      'proposals', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc)
        from public.platform_pricing_proposals p where p.organization_id = requested_organization_id), '[]'::jsonb),
      'contracts', coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at desc)
        from public.platform_contracts c where c.organization_id = requested_organization_id), '[]'::jsonb),
      'agreements', coalesce((select jsonb_agg(to_jsonb(a) || jsonb_build_object('plan_name', p.name) order by a.created_at desc)
        from public.subscription_agreements a join public.plans p on p.id = a.plan_id
        where a.organization_id = requested_organization_id), '[]'::jsonb),
      'invoices', coalesce((select jsonb_agg(to_jsonb(i) order by i.invoice_date desc, i.created_at desc)
        from (select * from public.subscription_invoices where organization_id = requested_organization_id order by invoice_date desc, created_at desc limit 200) i), '[]'::jsonb),
      'support_cases', coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at desc)
        from public.platform_support_cases s where s.organization_id = requested_organization_id), '[]'::jsonb)
    ) end,
    'catalog', jsonb_build_object(
      'plans', coalesce((select jsonb_agg(to_jsonb(p) || jsonb_build_object(
        'module_slugs', coalesce((select jsonb_agg(pm.module_slug order by pm.module_slug) from public.plan_modules pm where pm.plan_id = p.id and pm.included), '[]'::jsonb)
      ) order by p.sort_order, p.name) from public.plans p where p.active), '[]'::jsonb),
      'modules', coalesce((select jsonb_agg(to_jsonb(m) order by m.sort_order, m.name) from public.product_modules m where m.active), '[]'::jsonb),
      'terms', coalesce((select jsonb_agg(to_jsonb(t) order by t.sort_order) from public.subscription_term_options t where t.active), '[]'::jsonb)
    ),
    'recent_audit', coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc, e.id desc)
      from (select * from public.platform_admin_audit_events order by created_at desc, id desc limit 100) e), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

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
begin
  if not private.is_platform_staff(array['platform_owner','platform_admin','sales','finance']) then
    raise exception 'Platform customer write access required' using errcode = '42501';
  end if;
  if char_length(btrim(p_name)) < 2 or char_length(btrim(p_legal_name)) < 2
    or position('@' in p_billing_email) <= 1 or p_payment_terms_days not between 0 and 90 then
    raise exception 'Invalid customer data' using errcode = '22023';
  end if;

  insert into public.organizations (name, organization_number, business_form, status, created_by_user_id)
  values (btrim(p_name), nullif(btrim(p_organization_number), ''), coalesce(nullif(p_business_form,''), 'unknown'), 'active', (select auth.uid()))
  returning id into new_organization_id;

  customer_number := 'BYX-' || upper(substr(replace(new_organization_id::text, '-', ''), 1, 10));
  insert into public.organization_billing_profiles (
    organization_id, customer_number, legal_name, organization_number, billing_email,
    address_line1, postal_code, city, country_code, payment_terms_days
  ) values (
    new_organization_id, customer_number, btrim(p_legal_name), coalesce(nullif(btrim(p_organization_number), ''), 'SAKNAS'),
    lower(btrim(p_billing_email)), btrim(p_address_line1), btrim(p_postal_code), btrim(p_city), upper(p_country_code), p_payment_terms_days
  );

  insert into public.platform_crm_accounts (organization_id, lifecycle_stage, created_by_user_id, updated_by_user_id)
  values (new_organization_id, 'customer', (select auth.uid()), (select auth.uid()));

  insert into public.platform_admin_audit_events (staff_user_id, action, metadata)
  values ((select auth.uid()), 'create_platform_customer', jsonb_build_object('organization_id', new_organization_id, 'name', p_name));
  return new_organization_id;
end;
$$;

create or replace function public.platform_save_crm_account(
  p_organization_id uuid,
  p_lifecycle_stage text,
  p_account_status text,
  p_owner_staff_user_id uuid,
  p_industry text,
  p_employee_count integer,
  p_health_score integer,
  p_next_action_at timestamptz,
  p_internal_notes text,
  p_tags text[]
)
returns public.platform_crm_accounts
language plpgsql
security definer
set search_path = ''
as $$
declare saved public.platform_crm_accounts;
begin
  if not private.is_platform_staff(array['platform_owner','platform_admin','sales','support','finance']) then
    raise exception 'Platform CRM write access required' using errcode = '42501';
  end if;
  insert into public.platform_crm_accounts (
    organization_id,lifecycle_stage,account_status,owner_staff_user_id,industry,employee_count,
    health_score,next_action_at,internal_notes,tags,created_by_user_id,updated_by_user_id
  ) values (
    p_organization_id,p_lifecycle_stage,p_account_status,p_owner_staff_user_id,nullif(btrim(p_industry),''),p_employee_count,
    p_health_score,p_next_action_at,coalesce(p_internal_notes,''),coalesce(p_tags,'{}'),(select auth.uid()),(select auth.uid())
  ) on conflict (organization_id) do update set
    lifecycle_stage=excluded.lifecycle_stage, account_status=excluded.account_status,
    owner_staff_user_id=excluded.owner_staff_user_id, industry=excluded.industry,
    employee_count=excluded.employee_count, health_score=excluded.health_score,
    next_action_at=excluded.next_action_at, internal_notes=excluded.internal_notes,
    tags=excluded.tags, updated_by_user_id=(select auth.uid()), updated_at=now()
  returning * into saved;
  insert into public.platform_admin_audit_events (staff_user_id,action,metadata)
  values ((select auth.uid()),'update_crm_account',jsonb_build_object('organization_id',p_organization_id));
  return saved;
end;
$$;

create or replace function public.platform_add_crm_contact(
  p_organization_id uuid,
  p_full_name text,
  p_title text,
  p_email text,
  p_phone text,
  p_contact_type text,
  p_primary_contact boolean,
  p_notes text default ''
)
returns public.platform_crm_contacts
language plpgsql
security definer
set search_path = ''
as $$
declare saved public.platform_crm_contacts;
begin
  if not private.is_platform_staff(array['platform_owner','platform_admin','sales','support','finance']) then
    raise exception 'Platform CRM write access required' using errcode = '42501';
  end if;
  if p_primary_contact then
    update public.platform_crm_contacts set primary_contact=false,updated_at=now()
    where organization_id=p_organization_id and primary_contact;
  end if;
  insert into public.platform_crm_contacts (
    organization_id,full_name,title,email,phone,contact_type,primary_contact,notes,created_by_user_id
  ) values (
    p_organization_id,btrim(p_full_name),nullif(btrim(p_title),''),nullif(lower(btrim(p_email)),''),
    nullif(btrim(p_phone),''),p_contact_type,p_primary_contact,coalesce(p_notes,''),(select auth.uid())
  ) returning * into saved;
  insert into public.platform_admin_audit_events (staff_user_id,action,metadata)
  values ((select auth.uid()),'add_crm_contact',jsonb_build_object('organization_id',p_organization_id,'contact_id',saved.id));
  return saved;
end;
$$;

create or replace function public.platform_add_crm_activity(
  p_organization_id uuid,
  p_contact_id uuid,
  p_activity_type text,
  p_subject text,
  p_body text default '',
  p_occurred_at timestamptz default now(),
  p_due_at timestamptz default null
)
returns public.platform_crm_activities
language plpgsql
security definer
set search_path = ''
as $$
declare saved public.platform_crm_activities;
begin
  if not private.is_platform_staff(array['platform_owner','platform_admin','sales','support','finance']) then
    raise exception 'Platform CRM write access required' using errcode = '42501';
  end if;
  insert into public.platform_crm_activities (
    organization_id,contact_id,activity_type,subject,body,occurred_at,due_at,created_by_user_id
  ) values (
    p_organization_id,p_contact_id,p_activity_type,btrim(p_subject),coalesce(p_body,''),coalesce(p_occurred_at,now()),p_due_at,(select auth.uid())
  ) returning * into saved;
  insert into public.platform_admin_audit_events (staff_user_id,action,metadata)
  values ((select auth.uid()),'add_crm_activity',jsonb_build_object('organization_id',p_organization_id,'activity_id',saved.id));
  return saved;
end;
$$;

create or replace function public.platform_save_pricing_proposal(
  p_organization_id uuid,
  p_plan_id uuid,
  p_title text,
  p_seat_count integer,
  p_module_slugs text[],
  p_term_months integer,
  p_support_level text,
  p_billing_interval_months integer,
  p_list_monthly_price_ex_vat numeric,
  p_conservative_monthly_price_ex_vat numeric,
  p_recommended_monthly_price_ex_vat numeric,
  p_aggressive_monthly_price_ex_vat numeric,
  p_recommended_discount_percent numeric,
  p_estimated_monthly_cost numeric,
  p_estimated_margin_percent numeric,
  p_assumptions jsonb,
  p_valid_until date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare new_id uuid;
begin
  if not private.is_platform_staff(array['platform_owner','platform_admin','sales','finance']) then
    raise exception 'Platform pricing access required' using errcode = '42501';
  end if;
  insert into public.platform_pricing_proposals (
    organization_id,plan_id,title,seat_count,module_slugs,term_months,support_level,billing_interval_months,
    list_monthly_price_ex_vat,conservative_monthly_price_ex_vat,recommended_monthly_price_ex_vat,
    aggressive_monthly_price_ex_vat,recommended_discount_percent,estimated_monthly_cost,
    estimated_margin_percent,assumptions,valid_until,created_by_user_id
  ) values (
    p_organization_id,p_plan_id,btrim(p_title),p_seat_count,coalesce(p_module_slugs,'{}'),p_term_months,p_support_level,p_billing_interval_months,
    p_list_monthly_price_ex_vat,p_conservative_monthly_price_ex_vat,p_recommended_monthly_price_ex_vat,
    p_aggressive_monthly_price_ex_vat,p_recommended_discount_percent,p_estimated_monthly_cost,
    p_estimated_margin_percent,coalesce(p_assumptions,'{}'::jsonb),p_valid_until,(select auth.uid())
  ) returning id into new_id;
  insert into public.platform_admin_audit_events (staff_user_id,action,metadata)
  values ((select auth.uid()),'create_pricing_proposal',jsonb_build_object('organization_id',p_organization_id,'proposal_id',new_id));
  return new_id;
end;
$$;

create or replace function public.platform_create_contract(
  p_organization_id uuid,
  p_subscription_id uuid,
  p_pricing_proposal_id uuid,
  p_title text,
  p_contract_type text,
  p_starts_on date,
  p_ends_on date,
  p_auto_renews boolean,
  p_custom_terms text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare new_id uuid;
begin
  if not private.is_platform_staff(array['platform_owner','platform_admin','sales','finance']) then
    raise exception 'Platform contract access required' using errcode = '42501';
  end if;
  insert into public.platform_contracts (
    organization_id,subscription_id,pricing_proposal_id,title,contract_type,starts_on,ends_on,auto_renews,custom_terms,created_by_user_id
  ) values (
    p_organization_id,p_subscription_id,p_pricing_proposal_id,btrim(p_title),p_contract_type,p_starts_on,p_ends_on,p_auto_renews,coalesce(p_custom_terms,''),(select auth.uid())
  ) returning id into new_id;
  insert into public.platform_admin_audit_events (staff_user_id,action,metadata)
  values ((select auth.uid()),'create_platform_contract',jsonb_build_object('organization_id',p_organization_id,'contract_id',new_id));
  return new_id;
end;
$$;

create or replace function public.platform_update_billing_profile(
  p_organization_id uuid,
  p_billing_email text,
  p_delivery_channel text,
  p_peppol_id text,
  p_buyer_reference text,
  p_purchase_order_reference text,
  p_payment_terms_days integer,
  p_auto_invoice_enabled boolean
)
returns public.organization_billing_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare saved public.organization_billing_profiles;
begin
  if not private.is_platform_staff(array['platform_owner','platform_admin','finance']) then
    raise exception 'Platform billing access required' using errcode = '42501';
  end if;
  update public.organization_billing_profiles set
    billing_email=lower(btrim(p_billing_email)),delivery_channel=p_delivery_channel,
    peppol_id=nullif(btrim(p_peppol_id),''),buyer_reference=nullif(btrim(p_buyer_reference),''),
    purchase_order_reference=nullif(btrim(p_purchase_order_reference),''),
    payment_terms_days=p_payment_terms_days,auto_invoice_enabled=p_auto_invoice_enabled,updated_at=now()
  where organization_id=p_organization_id returning * into saved;
  if saved.organization_id is null then raise exception 'Billing profile not found' using errcode='P0002'; end if;
  insert into public.platform_admin_audit_events (staff_user_id,action,metadata)
  values ((select auth.uid()),'update_platform_billing_profile',jsonb_build_object('organization_id',p_organization_id,'auto_invoice_enabled',p_auto_invoice_enabled));
  return saved;
end;
$$;

revoke all on function public.get_platform_hq_workspace(uuid) from public, anon;
revoke all on function public.platform_create_customer(text,text,text,text,text,text,text,text,text,integer) from public, anon;
revoke all on function public.platform_save_crm_account(uuid,text,text,uuid,text,integer,integer,timestamptz,text,text[]) from public, anon;
revoke all on function public.platform_add_crm_contact(uuid,text,text,text,text,text,boolean,text) from public, anon;
revoke all on function public.platform_add_crm_activity(uuid,uuid,text,text,text,timestamptz,timestamptz) from public, anon;
revoke all on function public.platform_save_pricing_proposal(uuid,uuid,text,integer,text[],integer,text,integer,numeric,numeric,numeric,numeric,numeric,numeric,numeric,jsonb,date) from public, anon;
revoke all on function public.platform_create_contract(uuid,uuid,uuid,text,text,date,date,boolean,text) from public, anon;
revoke all on function public.platform_update_billing_profile(uuid,text,text,text,text,text,integer,boolean) from public, anon;

grant execute on function public.get_platform_hq_workspace(uuid) to authenticated;
grant execute on function public.platform_create_customer(text,text,text,text,text,text,text,text,text,integer) to authenticated;
grant execute on function public.platform_save_crm_account(uuid,text,text,uuid,text,integer,integer,timestamptz,text,text[]) to authenticated;
grant execute on function public.platform_add_crm_contact(uuid,text,text,text,text,text,boolean,text) to authenticated;
grant execute on function public.platform_add_crm_activity(uuid,uuid,text,text,text,timestamptz,timestamptz) to authenticated;
grant execute on function public.platform_save_pricing_proposal(uuid,uuid,text,integer,text[],integer,text,integer,numeric,numeric,numeric,numeric,numeric,numeric,numeric,jsonb,date) to authenticated;
grant execute on function public.platform_create_contract(uuid,uuid,uuid,text,text,date,date,boolean,text) to authenticated;
grant execute on function public.platform_update_billing_profile(uuid,text,text,text,text,text,integer,boolean) to authenticated;

commit;
