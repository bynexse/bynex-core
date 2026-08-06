begin;

-- A tightly scoped HQ context lets approved Bynex staff reuse the existing,
-- audited organization-seat engine without becoming members of the customer company.
create or replace function private.has_organization_role(
  requested_organization_id uuid,
  allowed_roles text[],
  requested_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members member
    where member.organization_id = requested_organization_id
      and member.user_id = requested_user_id
      and member.active
      and member.role = any(allowed_roles)
  )
  or (
    requested_user_id = (select auth.uid())
    and coalesce(
      current_setting('bynex.platform_organization_context', true),
      ''
    ) = requested_organization_id::text
    and private.is_platform_staff(array[
      'platform_owner','platform_admin','finance','support'
    ]::text[])
  );
$$;

create or replace function public.get_platform_organization_seat_overview(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_overview jsonb;
begin
  if not private.is_platform_staff(array[
    'platform_owner','platform_admin','sales','support','finance','read_only'
  ]::text[]) then
    raise exception 'Platform staff access required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.organizations organization
    where organization.id = p_organization_id
      and organization.status <> 'deleted'
  ) then
    raise exception 'Organization not found' using errcode = 'P0002';
  end if;

  perform set_config(
    'bynex.platform_organization_context',
    p_organization_id::text,
    true
  );

  base_overview := public.get_organization_seat_overview(p_organization_id);

  return base_overview || jsonb_build_object(
    'members', coalesce((
      select jsonb_agg(to_jsonb(member_row) order by member_row.full_name, member_row.email)
      from (
        select
          membership.user_id,
          membership.profile_id,
          membership.role,
          membership.active,
          membership.joined_at,
          profile.full_name,
          profile.email,
          worker.phone,
          worker.job_title,
          worker.employment_type,
          worker.company_name
        from public.organization_members membership
        left join public.profiles profile
          on profile.id = membership.profile_id
        left join lateral (
          select candidate.phone,
            candidate.job_title,
            candidate.employment_type,
            candidate.company_name
          from public.workers candidate
          where candidate.organization_id = membership.organization_id
            and (
              candidate.profile_id = membership.profile_id
              or (
                candidate.profile_id is null
                and lower(coalesce(candidate.email, '')) = lower(coalesce(profile.email, ''))
              )
            )
          order by candidate.active desc, candidate.updated_at desc
          limit 1
        ) worker on true
        where membership.organization_id = p_organization_id
          and membership.active
      ) member_row
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.platform_approve_organization_member_invite(
  p_organization_id uuid,
  p_full_name text,
  p_email text,
  p_role text,
  p_plain_token text,
  p_expires_at timestamptz,
  p_approve_extra_cost boolean,
  p_confirmation_text text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role text;
  seat_overview jsonb;
  invite_result jsonb;
begin
  select staff.role into actor_role
  from public.platform_staff staff
  where staff.user_id = (select auth.uid())
    and staff.active;

  if actor_role not in ('platform_owner','platform_admin','finance','support') then
    raise exception 'Platform personnel access required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.organizations organization
    where organization.id = p_organization_id
      and organization.status <> 'deleted'
  ) then
    raise exception 'Organization not found' using errcode = 'P0002';
  end if;

  perform set_config(
    'bynex.platform_organization_context',
    p_organization_id::text,
    true
  );

  seat_overview := public.get_organization_seat_overview(p_organization_id);

  if actor_role = 'support'
    and coalesce((seat_overview->>'next_seat_requires_payment')::boolean, false)
  then
    raise exception 'En betald användarplats måste godkännas av Bynex ägare, administration eller ekonomi'
      using errcode = '42501';
  end if;

  invite_result := public.approve_organization_member_invite(
    p_organization_id,
    p_full_name,
    p_email,
    p_role,
    p_plain_token,
    p_expires_at,
    p_approve_extra_cost,
    p_confirmation_text
  );

  insert into public.platform_admin_audit_events (
    staff_user_id,
    action,
    metadata
  ) values (
    (select auth.uid()),
    'platform_invite_customer_member',
    jsonb_build_object(
      'organization_id', p_organization_id,
      'invite_email', lower(btrim(p_email)),
      'invite_full_name', btrim(p_full_name),
      'invite_role', p_role,
      'seat_change_request_id', invite_result->>'request_id',
      'invoice_id', invite_result->>'invoice_id',
      'invoice_number', invite_result->>'invoice_number',
      'additional_billable_seats', invite_result->>'additional_billable_seats',
      'immediate_amount_inc_vat', invite_result->>'immediate_amount_inc_vat'
    )
  );

  return invite_result;
end;
$$;

revoke all on function public.get_platform_organization_seat_overview(uuid)
  from public, anon;
revoke all on function public.platform_approve_organization_member_invite(
  uuid,text,text,text,text,timestamptz,boolean,text
) from public, anon;

grant execute on function public.get_platform_organization_seat_overview(uuid)
  to authenticated;
grant execute on function public.platform_approve_organization_member_invite(
  uuid,text,text,text,text,timestamptz,boolean,text
) to authenticated;

select pg_notify('pgrst', 'reload schema');

commit;
