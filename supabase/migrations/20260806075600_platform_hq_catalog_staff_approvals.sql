begin;

create table public.platform_hq_approval_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  action_type text not null
    check (action_type in ('discount','credit_note','contract_price','manual_invoice')),
  target_table text not null check (char_length(target_table) between 2 and 120),
  target_id uuid not null,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','cancelled')),
  requested_reason text not null check (char_length(btrim(requested_reason)) between 3 and 2000),
  requested_by_user_id uuid not null default auth.uid() references auth.users(id),
  decided_by_user_id uuid references auth.users(id),
  decision_reason text,
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (action_type, target_table, target_id)
);

create index platform_hq_approval_requests_status_idx
  on public.platform_hq_approval_requests (status, requested_at desc);

alter table public.platform_hq_approval_requests enable row level security;
revoke all on public.platform_hq_approval_requests from public, anon, authenticated;

create or replace function public.get_platform_hq_management()
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
    'staff', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.active desc, item.role, item.full_name)
      from (
        select staff.user_id, staff.role, staff.active, staff.granted_at,
          staff.last_reviewed_at, profile.full_name, profile.email, profile.avatar_url
        from public.platform_staff staff
        left join public.profiles profile on profile.user_id = staff.user_id
      ) item
    ), '[]'::jsonb),
    'candidate_users', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.full_name, item.email)
      from (
        select profile.user_id, profile.full_name, profile.email
        from public.profiles profile
        where profile.user_id is not null
        order by profile.created_at desc
        limit 500
      ) item
    ), '[]'::jsonb),
    'approvals', coalesce((
      select jsonb_agg(to_jsonb(approval) order by approval.requested_at desc)
      from public.platform_hq_approval_requests approval
      where approval.status = 'pending'
         or approval.requested_at >= now() - interval '180 days'
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.platform_save_plan(
  p_plan_id uuid,
  p_slug text,
  p_name text,
  p_tagline text,
  p_description text,
  p_monthly_price_ex_vat numeric,
  p_included_users integer,
  p_extra_user_price_ex_vat numeric,
  p_trial_days integer,
  p_highlighted boolean,
  p_active boolean,
  p_sort_order integer,
  p_module_slugs text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_id uuid;
  invalid_modules text[];
begin
  if not private.is_platform_staff(array['platform_owner','platform_admin']) then
    raise exception 'Platform catalog write access required' using errcode = '42501';
  end if;

  select array_agg(requested.slug order by requested.slug)
  into invalid_modules
  from unnest(coalesce(p_module_slugs, '{}'::text[])) as requested(slug)
  where not exists (
    select 1 from public.product_modules module
    where module.slug = requested.slug
  );
  if coalesce(array_length(invalid_modules, 1), 0) > 0 then
    raise exception 'Unknown modules: %', array_to_string(invalid_modules, ', ')
      using errcode = '22023';
  end if;

  if p_plan_id is null then
    insert into public.plans (
      slug, name, tagline, description, monthly_price_ex_vat,
      included_users, extra_user_price_ex_vat, trial_days,
      highlighted, active, sort_order
    ) values (
      lower(btrim(p_slug)), btrim(p_name), btrim(p_tagline), btrim(p_description),
      p_monthly_price_ex_vat, p_included_users, p_extra_user_price_ex_vat,
      p_trial_days, p_highlighted, p_active, p_sort_order
    ) returning id into saved_id;
  else
    update public.plans
    set slug = lower(btrim(p_slug)),
        name = btrim(p_name),
        tagline = btrim(p_tagline),
        description = btrim(p_description),
        monthly_price_ex_vat = p_monthly_price_ex_vat,
        included_users = p_included_users,
        extra_user_price_ex_vat = p_extra_user_price_ex_vat,
        trial_days = p_trial_days,
        highlighted = p_highlighted,
        active = p_active,
        sort_order = p_sort_order,
        updated_at = now()
    where id = p_plan_id
    returning id into saved_id;
    if saved_id is null then
      raise exception 'Plan not found' using errcode = 'P0002';
    end if;
  end if;

  delete from public.plan_modules where plan_id = saved_id;
  insert into public.plan_modules (plan_id, module_slug, included)
  select saved_id, requested.slug, true
  from unnest(coalesce(p_module_slugs, '{}'::text[])) as requested(slug)
  on conflict (plan_id, module_slug) do update set included = true;

  insert into public.platform_admin_audit_events (staff_user_id, action, metadata)
  values ((select auth.uid()), 'save_platform_plan',
    jsonb_build_object(
      'plan_id', saved_id,
      'slug', p_slug,
      'monthly_price_ex_vat', p_monthly_price_ex_vat,
      'included_users', p_included_users,
      'extra_user_price_ex_vat', p_extra_user_price_ex_vat,
      'module_slugs', p_module_slugs
    ));
  return saved_id;
end;
$$;

create or replace function public.platform_save_product_module(
  p_slug text,
  p_name text,
  p_description text,
  p_product_area text,
  p_standalone_available boolean,
  p_beta_available boolean,
  p_active boolean,
  p_sort_order integer
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_slug text;
begin
  if not private.is_platform_staff(array['platform_owner','platform_admin']) then
    raise exception 'Platform module write access required' using errcode = '42501';
  end if;

  insert into public.product_modules (
    slug, name, description, product_area, standalone_available,
    beta_available, active, sort_order
  ) values (
    lower(btrim(p_slug)), btrim(p_name), btrim(p_description), p_product_area,
    p_standalone_available, p_beta_available, p_active, p_sort_order
  ) on conflict (slug) do update set
    name = excluded.name,
    description = excluded.description,
    product_area = excluded.product_area,
    standalone_available = excluded.standalone_available,
    beta_available = excluded.beta_available,
    active = excluded.active,
    sort_order = excluded.sort_order,
    updated_at = now()
  returning slug into saved_slug;

  insert into public.platform_admin_audit_events (staff_user_id, action, metadata)
  values ((select auth.uid()), 'save_platform_module',
    jsonb_build_object('module_slug', saved_slug, 'active', p_active));
  return saved_slug;
end;
$$;

create or replace function public.platform_set_staff_access(
  p_user_id uuid,
  p_role text,
  p_active boolean
)
returns public.platform_staff
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role text;
  saved public.platform_staff;
  active_owner_count integer;
begin
  select role into actor_role
  from public.platform_staff
  where user_id = (select auth.uid())
    and active;
  if actor_role <> 'platform_owner' then
    raise exception 'Platform owner access required' using errcode = '42501';
  end if;
  if p_role not in ('platform_owner','platform_admin','sales','support','finance','read_only') then
    raise exception 'Invalid platform role' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'User not found' using errcode = 'P0002';
  end if;
  if p_user_id = (select auth.uid()) and (not p_active or p_role <> 'platform_owner') then
    raise exception 'You cannot remove your own owner access' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.platform_staff
    where user_id = p_user_id and role = 'platform_owner' and active
  ) and (not p_active or p_role <> 'platform_owner') then
    select count(*) into active_owner_count
    from public.platform_staff
    where role = 'platform_owner' and active;
    if active_owner_count <= 1 then
      raise exception 'At least one active platform owner is required' using errcode = '23514';
    end if;
  end if;

  insert into public.platform_staff (
    user_id, role, active, granted_by_user_id, granted_at,
    last_reviewed_at, updated_at
  ) values (
    p_user_id, p_role, p_active, (select auth.uid()), now(), now(), now()
  ) on conflict (user_id) do update set
    role = excluded.role,
    active = excluded.active,
    granted_by_user_id = (select auth.uid()),
    granted_at = now(),
    last_reviewed_at = now(),
    updated_at = now()
  returning * into saved;

  insert into public.platform_admin_audit_events (staff_user_id, action, metadata)
  values ((select auth.uid()), 'set_platform_staff_access',
    jsonb_build_object('target_user_id', p_user_id, 'role', p_role, 'active', p_active));
  return saved;
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
  selected_agreement_id uuid;
  staff_role text;
  requires_approval boolean;
  initial_status text;
begin
  select role into staff_role
  from public.platform_staff
  where user_id = (select auth.uid()) and active;
  if staff_role not in ('platform_owner','platform_admin','finance') then
    raise exception 'Platform discount access required' using errcode = '42501';
  end if;

  select id into selected_agreement_id
  from public.subscription_agreements
  where organization_id = p_organization_id
    and subscription_id = p_subscription_id
    and status = 'active'
  order by created_at desc
  limit 1;
  if selected_agreement_id is null then
    raise exception 'Active subscription agreement required' using errcode = 'P0002';
  end if;

  requires_approval := staff_role <> 'platform_owner'
    and ((p_discount_type = 'percent' and p_discount_value > 25)
      or (p_discount_type = 'fixed' and p_discount_value > 5000));
  initial_status := case when requires_approval then 'draft' else 'active' end;

  insert into public.platform_subscription_discounts (
    organization_id, subscription_id, agreement_id, name, discount_type,
    applies_to, discount_value, starts_on, ends_on, max_cycles,
    priority, status, reason, created_by_user_id,
    approved_by_user_id, approved_at
  ) values (
    p_organization_id, p_subscription_id, selected_agreement_id,
    btrim(p_name), p_discount_type, p_applies_to, p_discount_value,
    p_starts_on, p_ends_on, p_max_cycles, p_priority, initial_status,
    btrim(p_reason), (select auth.uid()),
    case when requires_approval then null else (select auth.uid()) end,
    case when requires_approval then null else now() end
  ) returning id into new_id;

  if requires_approval then
    insert into public.platform_hq_approval_requests (
      organization_id, action_type, target_table, target_id,
      requested_reason, requested_by_user_id
    ) values (
      p_organization_id, 'discount', 'platform_subscription_discounts',
      new_id, btrim(p_reason), (select auth.uid())
    );
  end if;

  insert into public.platform_admin_audit_events (staff_user_id, action, metadata)
  values ((select auth.uid()), 'create_subscription_discount',
    jsonb_build_object(
      'organization_id', p_organization_id,
      'subscription_id', p_subscription_id,
      'discount_id', new_id,
      'discount_type', p_discount_type,
      'discount_value', p_discount_value,
      'status', initial_status,
      'reason', p_reason
    ));
  return new_id;
end;
$$;

create or replace function public.platform_decide_hq_approval(
  p_approval_id uuid,
  p_decision text,
  p_reason text
)
returns public.platform_hq_approval_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  staff_role text;
  approval public.platform_hq_approval_requests;
  saved public.platform_hq_approval_requests;
begin
  select role into staff_role
  from public.platform_staff
  where user_id = (select auth.uid()) and active;
  if staff_role not in ('platform_owner','platform_admin') then
    raise exception 'Platform approval access required' using errcode = '42501';
  end if;
  if p_decision not in ('approved','rejected')
    or char_length(btrim(p_reason)) < 3 then
    raise exception 'Decision and reason required' using errcode = '22023';
  end if;

  select * into approval
  from public.platform_hq_approval_requests
  where id = p_approval_id
  for update;
  if approval.id is null then
    raise exception 'Approval not found' using errcode = 'P0002';
  end if;
  if approval.status <> 'pending' then
    raise exception 'Approval is already decided' using errcode = '23514';
  end if;
  if approval.requested_by_user_id = (select auth.uid())
    and staff_role <> 'platform_owner' then
    raise exception 'A second administrator must approve this request' using errcode = '42501';
  end if;

  update public.platform_hq_approval_requests
  set status = p_decision,
      decided_by_user_id = (select auth.uid()),
      decision_reason = btrim(p_reason),
      decided_at = now()
  where id = approval.id
  returning * into saved;

  if approval.action_type = 'discount'
    and approval.target_table = 'platform_subscription_discounts' then
    update public.platform_subscription_discounts
    set status = case when p_decision = 'approved' then 'active' else 'cancelled' end,
        approved_by_user_id = case when p_decision = 'approved' then (select auth.uid()) else null end,
        approved_at = case when p_decision = 'approved' then now() else null end,
        updated_at = now()
    where id = approval.target_id;
  end if;

  insert into public.platform_admin_audit_events (staff_user_id, action, metadata)
  values ((select auth.uid()), 'decide_platform_hq_approval',
    jsonb_build_object(
      'approval_id', approval.id,
      'target_id', approval.target_id,
      'decision', p_decision,
      'reason', p_reason
    ));
  return saved;
end;
$$;

revoke all on function public.get_platform_hq_management() from public, anon;
revoke all on function public.platform_save_plan(uuid,text,text,text,text,numeric,integer,numeric,integer,boolean,boolean,integer,text[]) from public, anon;
revoke all on function public.platform_save_product_module(text,text,text,text,boolean,boolean,boolean,integer) from public, anon;
revoke all on function public.platform_set_staff_access(uuid,text,boolean) from public, anon;
revoke all on function public.platform_create_subscription_discount(uuid,uuid,text,text,text,numeric,date,date,integer,integer,text) from public, anon;
revoke all on function public.platform_decide_hq_approval(uuid,text,text) from public, anon;

grant execute on function public.get_platform_hq_management() to authenticated;
grant execute on function public.platform_save_plan(uuid,text,text,text,text,numeric,integer,numeric,integer,boolean,boolean,integer,text[]) to authenticated;
grant execute on function public.platform_save_product_module(text,text,text,text,boolean,boolean,boolean,integer) to authenticated;
grant execute on function public.platform_set_staff_access(uuid,text,boolean) to authenticated;
grant execute on function public.platform_create_subscription_discount(uuid,uuid,text,text,text,numeric,date,date,integer,integer,text) to authenticated;
grant execute on function public.platform_decide_hq_approval(uuid,text,text) to authenticated;

commit;
