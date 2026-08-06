begin;

create or replace function public.get_platform_customer_assistance(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role text;
  selected_organization public.organizations;
begin
  select staff.role
  into actor_role
  from public.platform_staff staff
  where staff.user_id = (select auth.uid())
    and staff.active;

  if actor_role not in (
    'platform_owner','platform_admin','sales','support','finance','read_only'
  ) then
    raise exception 'Bynex internbehörighet krävs' using errcode = '42501';
  end if;

  select organization.*
  into selected_organization
  from public.organizations organization
  where organization.id = p_organization_id
    and organization.status <> 'deleted'
    and coalesce(organization.settings->>'platform_internal', 'false') <> 'true';

  if selected_organization.id is null then
    raise exception 'Kundföretaget hittades inte' using errcode = 'P0002';
  end if;

  insert into public.platform_admin_audit_events (
    staff_user_id,
    action,
    metadata
  ) values (
    (select auth.uid()),
    'view_platform_customer_assistance',
    jsonb_build_object('organization_id', p_organization_id)
  );

  return jsonb_build_object(
    'organization', jsonb_build_object(
      'id', selected_organization.id,
      'name', selected_organization.name,
      'customer_number', selected_organization.customer_number,
      'organization_number', selected_organization.organization_number,
      'business_form', selected_organization.business_form,
      'status', selected_organization.status,
      'created_at', selected_organization.created_at
    ),
    'subscription', coalesce((
      select jsonb_build_object(
        'id', subscription.id,
        'status', subscription.status,
        'seat_count', subscription.seat_count,
        'trial_ends_at', subscription.trial_ends_at,
        'plan_id', plan.id,
        'plan_name', plan.name,
        'included_users', coalesce(agreement.included_users, plan.included_users),
        'extra_user_price_ex_vat', coalesce(
          agreement.net_extra_user_price_ex_vat,
          plan.extra_user_price_ex_vat
        )
      )
      from public.organization_subscriptions subscription
      join public.plans plan on plan.id = subscription.plan_id
      left join lateral (
        select candidate.included_users, candidate.net_extra_user_price_ex_vat
        from public.subscription_agreements candidate
        where candidate.organization_id = subscription.organization_id
          and candidate.subscription_id = subscription.id
          and candidate.status = 'active'
        order by candidate.created_at desc
        limit 1
      ) agreement on true
      where subscription.organization_id = p_organization_id
      order by subscription.created_at desc
      limit 1
    ), '{}'::jsonb),
    'workers', coalesce((
      select jsonb_agg(to_jsonb(worker_item) order by worker_item.active desc, worker_item.full_name)
      from (
        select
          worker.id,
          worker.profile_id,
          worker.full_name,
          worker.email,
          worker.phone,
          worker.employment_type,
          worker.company_name,
          worker.job_title,
          worker.active,
          worker.gps_enabled,
          worker.created_at,
          worker.updated_at,
          membership.user_id as app_user_id,
          membership.role as app_role,
          membership.active as app_access_active
        from public.workers worker
        left join lateral (
          select member.user_id, member.role, member.active
          from public.organization_members member
          where member.organization_id = worker.organization_id
            and (
              (worker.profile_id is not null and member.profile_id = worker.profile_id)
              or (
                worker.email is not null
                and exists (
                  select 1
                  from public.profiles profile
                  where profile.id = member.profile_id
                    and lower(profile.email) = lower(worker.email)
                )
              )
            )
          order by member.active desc, member.joined_at desc
          limit 1
        ) membership on true
        where worker.organization_id = p_organization_id
      ) worker_item
    ), '[]'::jsonb),
    'app_members', coalesce((
      select jsonb_agg(to_jsonb(member_item) order by member_item.active desc, member_item.full_name)
      from (
        select
          member.user_id,
          member.role,
          member.active,
          member.joined_at,
          profile.full_name,
          profile.email,
          worker.id as worker_id
        from public.organization_members member
        left join public.profiles profile on profile.id = member.profile_id
        left join public.workers worker
          on worker.organization_id = member.organization_id
         and worker.profile_id = member.profile_id
        where member.organization_id = p_organization_id
      ) member_item
    ), '[]'::jsonb),
    'pending_invites', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', invite.id,
        'full_name', invite.full_name,
        'email', invite.email_normalized,
        'role', invite.role,
        'expires_at', invite.expires_at,
        'created_at', invite.created_at,
        'seat_change_request_id', invite.seat_change_request_id
      ) order by invite.created_at desc)
      from private.organization_invites invite
      where invite.organization_id = p_organization_id
        and invite.accepted_at is null
        and invite.expires_at > now()
    ), '[]'::jsonb),
    'permissions', jsonb_build_object(
      'can_manage_workers', actor_role in (
        'platform_owner','platform_admin','sales','support'
      ),
      'can_view_app_access', true,
      'can_manage_billing', actor_role in (
        'platform_owner','platform_admin','finance'
      )
    )
  );
end;
$$;

create or replace function public.platform_add_customer_worker(
  p_organization_id uuid,
  p_full_name text,
  p_email text default null,
  p_phone text default null,
  p_job_title text default null,
  p_employment_type text default 'employee',
  p_company_name text default null,
  p_customer_authorization_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role text;
  new_worker_id uuid;
  normalized_email text := lower(nullif(btrim(coalesce(p_email, '')), ''));
  normalized_company_name text := nullif(btrim(coalesce(p_company_name, '')), '');
begin
  select staff.role
  into actor_role
  from public.platform_staff staff
  where staff.user_id = (select auth.uid())
    and staff.active;

  if actor_role not in ('platform_owner','platform_admin','sales','support') then
    raise exception 'Du saknar behörighet att hjälpa kunden med personalregistret'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.organizations organization
    where organization.id = p_organization_id
      and organization.status <> 'deleted'
      and coalesce(organization.settings->>'platform_internal', 'false') <> 'true'
  ) then
    raise exception 'Kundföretaget hittades inte' using errcode = 'P0002';
  end if;

  if char_length(btrim(coalesce(p_full_name, ''))) not between 2 and 160
    or p_employment_type not in ('employee','contractor','subcontractor','temporary')
    or char_length(btrim(coalesce(p_customer_authorization_reference, ''))) not between 5 and 500
    or (normalized_email is not null and (
      char_length(normalized_email) > 254
      or normalized_email !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$'
    ))
    or char_length(btrim(coalesce(p_phone, ''))) > 40
    or char_length(btrim(coalesce(p_job_title, ''))) > 120
    or char_length(coalesce(normalized_company_name, '')) > 180
    or (
      p_employment_type in ('contractor','subcontractor')
      and char_length(coalesce(normalized_company_name, '')) < 2
    )
  then
    raise exception 'Kontrollera personuppgifter, anställningsform och kundens beställningsreferens'
      using errcode = '22023';
  end if;

  if normalized_email is not null and exists (
    select 1
    from public.workers worker
    where worker.organization_id = p_organization_id
      and lower(coalesce(worker.email, '')) = normalized_email
      and worker.active
  ) then
    raise exception 'En aktiv person med samma e-post finns redan hos kunden'
      using errcode = '23505';
  end if;

  insert into public.workers (
    organization_id,
    full_name,
    email,
    phone,
    employment_type,
    company_name,
    job_title,
    active,
    gps_enabled
  ) values (
    p_organization_id,
    btrim(p_full_name),
    normalized_email,
    nullif(btrim(coalesce(p_phone, '')), ''),
    p_employment_type,
    normalized_company_name,
    nullif(btrim(coalesce(p_job_title, '')), ''),
    true,
    true
  ) returning id into new_worker_id;

  insert into public.platform_admin_audit_events (
    staff_user_id,
    action,
    metadata
  ) values (
    (select auth.uid()),
    'add_customer_worker_from_hq',
    jsonb_build_object(
      'organization_id', p_organization_id,
      'worker_id', new_worker_id,
      'employment_type', p_employment_type,
      'customer_authorization_reference', btrim(p_customer_authorization_reference)
    )
  );

  return new_worker_id;
end;
$$;

create or replace function public.platform_update_customer_worker(
  p_organization_id uuid,
  p_worker_id uuid,
  p_full_name text,
  p_email text default null,
  p_phone text default null,
  p_job_title text default null,
  p_employment_type text default 'employee',
  p_company_name text default null,
  p_active boolean default true,
  p_customer_authorization_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role text;
  normalized_email text := lower(nullif(btrim(coalesce(p_email, '')), ''));
  normalized_company_name text := nullif(btrim(coalesce(p_company_name, '')), '');
  saved_worker_id uuid;
begin
  select staff.role
  into actor_role
  from public.platform_staff staff
  where staff.user_id = (select auth.uid())
    and staff.active;

  if actor_role not in ('platform_owner','platform_admin','sales','support') then
    raise exception 'Du saknar behörighet att hjälpa kunden med personalregistret'
      using errcode = '42501';
  end if;

  if char_length(btrim(coalesce(p_full_name, ''))) not between 2 and 160
    or p_employment_type not in ('employee','contractor','subcontractor','temporary')
    or char_length(btrim(coalesce(p_customer_authorization_reference, ''))) not between 5 and 500
    or (normalized_email is not null and (
      char_length(normalized_email) > 254
      or normalized_email !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$'
    ))
    or char_length(btrim(coalesce(p_phone, ''))) > 40
    or char_length(btrim(coalesce(p_job_title, ''))) > 120
    or char_length(coalesce(normalized_company_name, '')) > 180
    or (
      p_employment_type in ('contractor','subcontractor')
      and char_length(coalesce(normalized_company_name, '')) < 2
    )
  then
    raise exception 'Kontrollera personuppgifter, anställningsform och kundens beställningsreferens'
      using errcode = '22023';
  end if;

  if normalized_email is not null and exists (
    select 1
    from public.workers worker
    where worker.organization_id = p_organization_id
      and worker.id <> p_worker_id
      and lower(coalesce(worker.email, '')) = normalized_email
      and worker.active
  ) then
    raise exception 'En annan aktiv person med samma e-post finns redan hos kunden'
      using errcode = '23505';
  end if;

  update public.workers worker
  set full_name = btrim(p_full_name),
      email = normalized_email,
      phone = nullif(btrim(coalesce(p_phone, '')), ''),
      job_title = nullif(btrim(coalesce(p_job_title, '')), ''),
      employment_type = p_employment_type,
      company_name = normalized_company_name,
      active = p_active,
      updated_at = now()
  where worker.organization_id = p_organization_id
    and worker.id = p_worker_id
  returning worker.id into saved_worker_id;

  if saved_worker_id is null then
    raise exception 'Personen hittades inte hos kunden' using errcode = 'P0002';
  end if;

  insert into public.platform_admin_audit_events (
    staff_user_id,
    action,
    metadata
  ) values (
    (select auth.uid()),
    'update_customer_worker_from_hq',
    jsonb_build_object(
      'organization_id', p_organization_id,
      'worker_id', saved_worker_id,
      'active', p_active,
      'employment_type', p_employment_type,
      'customer_authorization_reference', btrim(p_customer_authorization_reference)
    )
  );

  return saved_worker_id;
end;
$$;

revoke all on function public.get_platform_customer_assistance(uuid)
  from public, anon;
revoke all on function public.platform_add_customer_worker(
  uuid,text,text,text,text,text,text,text
) from public, anon;
revoke all on function public.platform_update_customer_worker(
  uuid,uuid,text,text,text,text,text,text,boolean,text
) from public, anon;

grant execute on function public.get_platform_customer_assistance(uuid)
  to authenticated;
grant execute on function public.platform_add_customer_worker(
  uuid,text,text,text,text,text,text,text
) to authenticated;
grant execute on function public.platform_update_customer_worker(
  uuid,uuid,text,text,text,text,text,text,boolean,text
) to authenticated;

select pg_notify('pgrst', 'reload schema');

commit;
