begin;

create table public.platform_team_directory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  full_name text not null check (char_length(btrim(full_name)) between 2 and 160),
  email text not null unique check (
    email = lower(btrim(email))
    and char_length(email) between 5 and 254
  ),
  department text not null default 'operations'
    check (char_length(btrim(department)) between 2 and 80),
  intended_role text not null default 'read_only'
    check (intended_role in (
      'platform_owner','platform_admin','sales','finance','support','read_only'
    )),
  status text not null default 'invited'
    check (status in ('invited','active','inactive')),
  added_by_user_id uuid references auth.users(id) on delete set null,
  invited_at timestamptz not null default now(),
  linked_at timestamptz,
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index platform_team_directory_status_idx
  on public.platform_team_directory(status, full_name);

create trigger platform_team_directory_set_updated_at
before update on public.platform_team_directory
for each row execute function public.set_updated_at();

alter table public.platform_team_directory enable row level security;
alter table public.platform_team_directory force row level security;
revoke all on public.platform_team_directory from public,anon,authenticated;

insert into public.platform_team_directory (
  user_id, full_name, email, department, intended_role, status,
  added_by_user_id, linked_at, last_reviewed_at
)
select
  staff.user_id,
  coalesce(nullif(btrim(profile.full_name), ''), split_part(lower(account.email), '@', 1)),
  lower(account.email),
  'operations',
  staff.role,
  case when staff.active then 'active' else 'inactive' end,
  staff.granted_by_user_id,
  staff.granted_at,
  staff.last_reviewed_at
from public.platform_staff staff
join auth.users account on account.id = staff.user_id
left join public.profiles profile on profile.user_id = staff.user_id
where account.email is not null
on conflict (email) do update set
  user_id = excluded.user_id,
  full_name = excluded.full_name,
  intended_role = excluded.intended_role,
  status = excluded.status,
  linked_at = coalesce(public.platform_team_directory.linked_at, excluded.linked_at),
  last_reviewed_at = excluded.last_reviewed_at,
  updated_at = now();

create or replace function private.guard_platform_staff_directory()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.platform_team_directory team
    where team.user_id = new.user_id
      and team.status in ('invited','active')
  ) then
    raise exception 'HQ-behörighet kan bara ges till en registrerad Bynex-medarbetare'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_platform_staff_directory()
  from public,anon,authenticated;

drop trigger if exists guard_platform_staff_directory on public.platform_staff;
create trigger guard_platform_staff_directory
before insert or update of user_id,role,active on public.platform_staff
for each row execute function private.guard_platform_staff_directory();

create or replace function public.get_platform_internal_team()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_staff(array['platform_owner','platform_admin']) then
    raise exception 'Bynex team access required' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(to_jsonb(item) order by item.status, item.full_name)
    from (
      select
        team.id,
        team.user_id,
        team.full_name,
        team.email,
        team.department,
        team.intended_role,
        team.status,
        team.invited_at,
        team.linked_at,
        team.last_reviewed_at,
        staff.role as active_role,
        coalesce(staff.active, false) as hq_access_active,
        profile.avatar_url,
        (team.user_id is not null) as account_ready
      from public.platform_team_directory team
      left join public.platform_staff staff on staff.user_id = team.user_id
      left join public.profiles profile on profile.user_id = team.user_id
      order by team.status, team.full_name
    ) item
  ), '[]'::jsonb);
end;
$$;

create or replace function public.platform_add_internal_team_member(
  p_full_name text,
  p_email text,
  p_department text,
  p_role text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  normalized_email text := lower(btrim(coalesce(p_email, '')));
  matched_user_id uuid;
  saved public.platform_team_directory;
begin
  if not private.is_platform_staff(array['platform_owner','platform_admin']) then
    raise exception 'Only Bynex owners and administrators can add team members'
      using errcode = '42501';
  end if;

  if char_length(btrim(coalesce(p_full_name, ''))) not between 2 and 160
    or char_length(normalized_email) not between 5 and 254
    or normalized_email !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$'
    or char_length(btrim(coalesce(p_department, ''))) not between 2 and 80
    or p_role not in ('platform_owner','platform_admin','sales','finance','support','read_only')
  then
    raise exception 'Kontrollera Bynex-medarbetarens uppgifter' using errcode = '22023';
  end if;

  select profile.user_id into matched_user_id
  from public.profiles profile
  where profile.user_id is not null
    and lower(profile.email) = normalized_email
  order by profile.created_at desc
  limit 1;

  insert into public.platform_team_directory (
    user_id, full_name, email, department, intended_role, status,
    added_by_user_id, linked_at, last_reviewed_at
  ) values (
    matched_user_id,
    btrim(p_full_name),
    normalized_email,
    btrim(p_department),
    p_role,
    case when matched_user_id is null then 'invited' else 'active' end,
    actor_user_id,
    case when matched_user_id is null then null else now() end,
    case when matched_user_id is null then null else now() end
  )
  on conflict (email) do update set
    user_id = coalesce(public.platform_team_directory.user_id, excluded.user_id),
    full_name = excluded.full_name,
    department = excluded.department,
    intended_role = excluded.intended_role,
    status = case
      when coalesce(public.platform_team_directory.user_id, excluded.user_id) is null
        then 'invited'
      else 'active'
    end,
    added_by_user_id = excluded.added_by_user_id,
    linked_at = case
      when coalesce(public.platform_team_directory.user_id, excluded.user_id) is null
        then public.platform_team_directory.linked_at
      else coalesce(public.platform_team_directory.linked_at, now())
    end,
    last_reviewed_at = case
      when coalesce(public.platform_team_directory.user_id, excluded.user_id) is null
        then public.platform_team_directory.last_reviewed_at
      else now()
    end,
    updated_at = now()
  returning * into saved;

  if saved.user_id is not null then
    insert into public.platform_staff (
      user_id, role, active, granted_by_user_id, granted_at, last_reviewed_at
    ) values (
      saved.user_id, p_role, true, actor_user_id, now(), now()
    )
    on conflict (user_id) do update set
      role = excluded.role,
      active = true,
      granted_by_user_id = excluded.granted_by_user_id,
      last_reviewed_at = now(),
      updated_at = now();
  end if;

  insert into public.platform_admin_audit_events (staff_user_id, action, metadata)
  values (
    actor_user_id,
    'add_platform_team_member',
    jsonb_build_object(
      'team_member_id', saved.id,
      'email', saved.email,
      'role', saved.intended_role,
      'status', saved.status
    )
  );

  return jsonb_build_object(
    'id', saved.id,
    'user_id', saved.user_id,
    'status', saved.status,
    'account_ready', saved.user_id is not null
  );
end;
$$;

create or replace function public.platform_update_internal_team_member(
  p_team_member_id uuid,
  p_role text,
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  selected public.platform_team_directory;
  matched_user_id uuid;
begin
  if not private.is_platform_staff(array['platform_owner','platform_admin']) then
    raise exception 'Only Bynex owners and administrators can update team members'
      using errcode = '42501';
  end if;
  if p_role not in ('platform_owner','platform_admin','sales','finance','support','read_only') then
    raise exception 'Ogiltig HQ-roll' using errcode = '22023';
  end if;

  select * into selected
  from public.platform_team_directory
  where id = p_team_member_id
  for update;
  if selected.id is null then
    raise exception 'Bynex-medarbetaren hittades inte' using errcode = 'P0002';
  end if;

  matched_user_id := selected.user_id;
  if matched_user_id is null then
    select profile.user_id into matched_user_id
    from public.profiles profile
    where profile.user_id is not null
      and lower(profile.email) = selected.email
    order by profile.created_at desc
    limit 1;
  end if;

  if p_active and matched_user_id is null then
    raise exception 'Medarbetaren behöver först skapa och bekräfta sitt Bynex-konto'
      using errcode = 'P0002';
  end if;

  if p_active then
    update public.platform_team_directory
    set user_id = matched_user_id,
        intended_role = p_role,
        status = 'active',
        linked_at = coalesce(linked_at, now()),
        last_reviewed_at = now(),
        updated_at = now()
    where id = selected.id;

    insert into public.platform_staff (
      user_id, role, active, granted_by_user_id, granted_at, last_reviewed_at
    ) values (
      matched_user_id, p_role, true, actor_user_id, now(), now()
    )
    on conflict (user_id) do update set
      role = excluded.role,
      active = true,
      granted_by_user_id = excluded.granted_by_user_id,
      last_reviewed_at = now(),
      updated_at = now();
  else
    if matched_user_id is not null then
      update public.platform_staff
      set active = false,
          last_reviewed_at = now(),
          updated_at = now()
      where user_id = matched_user_id;
    end if;
    update public.platform_team_directory
    set intended_role = p_role,
        status = 'inactive',
        last_reviewed_at = now(),
        updated_at = now()
    where id = selected.id;
  end if;

  insert into public.platform_admin_audit_events (staff_user_id, action, metadata)
  values (
    actor_user_id,
    'update_platform_team_member',
    jsonb_build_object(
      'team_member_id', selected.id,
      'role', p_role,
      'active', p_active
    )
  );

  return jsonb_build_object(
    'id', selected.id,
    'user_id', matched_user_id,
    'active', p_active,
    'role', p_role
  );
end;
$$;

-- Clone the existing, tested seat calculations while replacing only the actor guard.
do $$
declare
  source_sql text;
  target_sql text;
  old_guard text := $old$
  if not private.has_organization_role(
    p_organization_id,
    array['owner','admin']::text[],
    (select auth.uid())
  ) then
    raise exception 'Endast ägare och administratör kan hantera användarplatser'
      using errcode = '42501';
  end if;
$old$;
  new_guard text := $new$
  if not private.is_platform_staff(
    array['platform_owner','platform_admin','sales','support','finance','read_only']::text[]
  ) then
    raise exception 'Bynex HQ-behörighet krävs för att läsa kundens användarplatser'
      using errcode = '42501';
  end if;
$new$;
begin
  select pg_get_functiondef('public.get_organization_seat_overview(uuid)'::regprocedure)
  into source_sql;
  target_sql := replace(
    source_sql,
    'CREATE OR REPLACE FUNCTION public.get_organization_seat_overview(p_organization_id uuid)',
    'CREATE OR REPLACE FUNCTION public.platform_get_customer_seat_overview(p_organization_id uuid)'
  );
  target_sql := replace(target_sql, old_guard, new_guard);
  if position('platform_get_customer_seat_overview' in target_sql) = 0
     or position('Bynex HQ-behörighet krävs' in target_sql) = 0 then
    raise exception 'Kunde inte skapa HQ-vy för kundens användarplatser';
  end if;
  execute target_sql;
end;
$$;

do $$
declare
  source_sql text;
  target_sql text;
  old_guard text := $old$
  if not private.has_organization_role(
    p_organization_id,
    array['owner','admin']::text[],
    actor_user_id
  ) then
    raise exception 'Endast ägare och administratör kan bjuda in användare'
      using errcode = '42501';
  end if;
$old$;
  new_guard text := $new$
  if not private.is_platform_staff(
    array['platform_owner','platform_admin','finance']::text[]
  ) then
    raise exception 'Endast behörig Bynex-medarbetare kan bjuda in kundpersonal'
      using errcode = '42501';
  end if;
$new$;
begin
  select pg_get_functiondef(
    'public.approve_organization_member_invite(uuid,text,text,text,text,timestamp with time zone,boolean,text)'::regprocedure
  ) into source_sql;
  target_sql := replace(
    source_sql,
    'CREATE OR REPLACE FUNCTION public.approve_organization_member_invite(p_organization_id uuid, p_full_name text, p_email text, p_role text, p_plain_token text, p_expires_at timestamp with time zone, p_approve_extra_cost boolean, p_confirmation_text text)',
    'CREATE OR REPLACE FUNCTION public.platform_invite_customer_member(p_organization_id uuid, p_full_name text, p_email text, p_role text, p_plain_token text, p_expires_at timestamp with time zone, p_approve_extra_cost boolean, p_confirmation_text text)'
  );
  target_sql := replace(target_sql, old_guard, new_guard);
  if position('platform_invite_customer_member' in target_sql) = 0
     or position('Endast behörig Bynex-medarbetare' in target_sql) = 0 then
    raise exception 'Kunde inte skapa HQ-funktion för kundpersonal';
  end if;
  execute target_sql;
end;
$$;

create or replace function public.platform_create_customer_member_invite(
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
  actor_user_id uuid := (select auth.uid());
  normalized_email text := lower(btrim(coalesce(p_email, '')));
  has_active_billing boolean;
  invite_id uuid;
  invitation_url text;
  result jsonb;
begin
  if not private.is_platform_staff(array['platform_owner','platform_admin','finance']) then
    raise exception 'Endast behörig Bynex-medarbetare kan lägga till kundpersonal'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.organizations organization
    where organization.id = p_organization_id
      and organization.status <> 'deleted'
  ) then
    raise exception 'Kundföretaget hittades inte' using errcode = 'P0002';
  end if;

  select exists (
    select 1
    from public.organization_subscriptions subscription
    join public.subscription_agreements agreement
      on agreement.organization_id = subscription.organization_id
     and agreement.subscription_id = subscription.id
     and agreement.status = 'active'
    where subscription.organization_id = p_organization_id
      and subscription.status = 'active'
  ) into has_active_billing;

  if has_active_billing then
    select public.platform_invite_customer_member(
      p_organization_id,
      p_full_name,
      p_email,
      p_role,
      p_plain_token,
      p_expires_at,
      p_approve_extra_cost,
      p_confirmation_text
    ) into result;
  else
    if char_length(btrim(coalesce(p_full_name, ''))) not between 2 and 160
      or char_length(normalized_email) not between 5 and 254
      or normalized_email !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$'
      or p_role not in ('admin','office','manager','supervisor','employee','contractor')
      or char_length(coalesce(p_plain_token, '')) < 32
      or p_expires_at <= now()
      or p_expires_at > now() + interval '30 days'
    then
      raise exception 'Kontrollera medarbetarens inbjudan' using errcode = '22023';
    end if;

    if exists (
      select 1
      from public.organization_members member
      join auth.users account on account.id = member.user_id
      where member.organization_id = p_organization_id
        and member.active
        and lower(account.email) = normalized_email
    ) or exists (
      select 1 from private.organization_invites invite
      where invite.organization_id = p_organization_id
        and invite.email_normalized = normalized_email
        and invite.accepted_at is null
        and invite.expires_at > now()
    ) then
      raise exception 'Personen är redan medlem eller har en aktiv inbjudan'
        using errcode = '23505';
    end if;

    insert into private.organization_invites (
      organization_id,
      email_normalized,
      full_name,
      role,
      token_hash,
      invited_by_user_id,
      expires_at,
      seat_change_request_id
    ) values (
      p_organization_id,
      normalized_email,
      btrim(p_full_name),
      p_role,
      encode(extensions.digest(p_plain_token, 'sha256'), 'hex'),
      actor_user_id,
      p_expires_at,
      null
    ) returning id into invite_id;

    invitation_url := 'https://bynex.se/inbjudan/foretag?token=' || p_plain_token;

    insert into private.transactional_email_queue (
      recipient_email,
      template_key,
      payload,
      idempotency_key
    ) values (
      normalized_email,
      'organization-invitation',
      jsonb_build_object(
        'organization_id', p_organization_id,
        'full_name', btrim(p_full_name),
        'role', p_role,
        'token', p_plain_token,
        'invitation_url', invitation_url,
        'expires_at', p_expires_at,
        'trial_or_prebilling_invite', true
      ),
      'organization-invitation:' || invite_id::text
    );

    result := jsonb_build_object(
      'invite_id', invite_id,
      'invitation_url', invitation_url,
      'additional_billable_seats', 0,
      'immediate_amount_ex_vat', 0,
      'vat_amount', 0,
      'immediate_amount_inc_vat', 0,
      'billing_required', false
    );
  end if;

  insert into public.platform_admin_audit_events (staff_user_id, action, metadata)
  values (
    actor_user_id,
    'invite_customer_member_from_hq',
    jsonb_build_object(
      'organization_id', p_organization_id,
      'email', normalized_email,
      'role', p_role,
      'active_billing', has_active_billing,
      'invite_id', result ->> 'invite_id',
      'invoice_number', result ->> 'invoice_number'
    )
  );

  return result;
end;
$$;

create or replace function public.platform_get_customer_member_workspace(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  overview jsonb;
  organization_name text;
  active_member_count integer;
  pending_invite_count integer;
begin
  if not private.is_platform_staff(
    array['platform_owner','platform_admin','sales','support','finance','read_only']::text[]
  ) then
    raise exception 'Bynex HQ-behörighet krävs' using errcode = '42501';
  end if;

  select organization.name into organization_name
  from public.organizations organization
  where organization.id = p_organization_id
    and organization.status <> 'deleted';
  if organization_name is null then
    raise exception 'Kundföretaget hittades inte' using errcode = 'P0002';
  end if;

  select public.platform_get_customer_seat_overview(p_organization_id)
  into overview;

  select count(*) into active_member_count
  from public.organization_members member
  where member.organization_id = p_organization_id
    and member.active;

  select count(*) into pending_invite_count
  from private.organization_invites invite
  where invite.organization_id = p_organization_id
    and invite.accepted_at is null
    and invite.expires_at > now();

  return coalesce(overview, '{}'::jsonb) || jsonb_build_object(
    'organization_id', p_organization_id,
    'organization_name', organization_name,
    'active_members', active_member_count,
    'pending_invites', pending_invite_count,
    'members', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.full_name, item.email)
      from (
        select
          member.id,
          member.user_id,
          member.role,
          member.active,
          member.joined_at,
          profile.full_name,
          profile.email,
          profile.phone,
          profile.avatar_url
        from public.organization_members member
        join public.profiles profile on profile.id = member.profile_id
        where member.organization_id = p_organization_id
        order by profile.full_name, profile.email
      ) item
    ), '[]'::jsonb),
    'pending', coalesce((
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
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_platform_internal_team() from public,anon;
revoke all on function public.platform_add_internal_team_member(text,text,text,text) from public,anon;
revoke all on function public.platform_update_internal_team_member(uuid,text,boolean) from public,anon;
revoke all on function public.platform_get_customer_seat_overview(uuid) from public,anon;
revoke all on function public.platform_invite_customer_member(uuid,text,text,text,text,timestamptz,boolean,text) from public,anon;
revoke all on function public.platform_create_customer_member_invite(uuid,text,text,text,text,timestamptz,boolean,text) from public,anon;
revoke all on function public.platform_get_customer_member_workspace(uuid) from public,anon;

grant execute on function public.get_platform_internal_team() to authenticated;
grant execute on function public.platform_add_internal_team_member(text,text,text,text) to authenticated;
grant execute on function public.platform_update_internal_team_member(uuid,text,boolean) to authenticated;
grant execute on function public.platform_get_customer_seat_overview(uuid) to authenticated;
grant execute on function public.platform_invite_customer_member(uuid,text,text,text,text,timestamptz,boolean,text) to authenticated;
grant execute on function public.platform_create_customer_member_invite(uuid,text,text,text,text,timestamptz,boolean,text) to authenticated;
grant execute on function public.platform_get_customer_member_workspace(uuid) to authenticated;

select pg_notify('pgrst','reload schema');

commit;
