begin;

create table if not exists public.platform_hq_approval_requests (
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

create index if not exists platform_hq_approval_requests_status_idx
  on public.platform_hq_approval_requests (status, requested_at desc);

alter table public.platform_hq_approval_requests enable row level security;
revoke all on public.platform_hq_approval_requests from public, anon, authenticated;

create table if not exists public.platform_team_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  full_name text not null check (char_length(btrim(full_name)) between 2 and 160),
  email text not null check (
    char_length(email) between 5 and 254 and position('@' in email) > 1
  ),
  email_normalized text generated always as (lower(btrim(email))) stored,
  job_title text,
  department text not null default 'operations'
    check (department in ('management','sales','finance','support','product','engineering','operations','other')),
  active boolean not null default true,
  can_receive_hq_access boolean not null default true,
  invited_at timestamptz,
  linked_at timestamptz,
  created_by_user_id uuid references auth.users(id),
  updated_by_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (email_normalized)
);

create index if not exists platform_team_members_active_idx
  on public.platform_team_members (active, can_receive_hq_access, full_name);

alter table public.platform_team_members enable row level security;
revoke all on public.platform_team_members from public, anon, authenticated;

insert into public.platform_team_members (
  user_id,
  full_name,
  email,
  job_title,
  department,
  active,
  can_receive_hq_access,
  linked_at,
  created_by_user_id,
  updated_by_user_id
)
select
  staff.user_id,
  coalesce(nullif(btrim(profile.full_name), ''), split_part(account.email, '@', 1)),
  lower(account.email),
  case staff.role
    when 'platform_owner' then 'HQ-ägare'
    when 'platform_admin' then 'HQ-administratör'
    when 'sales' then 'Försäljning'
    when 'finance' then 'Ekonomi'
    when 'support' then 'Support'
    else 'Bynex-medarbetare'
  end,
  case staff.role
    when 'platform_owner' then 'management'
    when 'platform_admin' then 'management'
    when 'sales' then 'sales'
    when 'finance' then 'finance'
    when 'support' then 'support'
    else 'operations'
  end,
  staff.active,
  true,
  now(),
  staff.granted_by_user_id,
  staff.granted_by_user_id
from public.platform_staff staff
join auth.users account on account.id = staff.user_id
left join public.profiles profile on profile.user_id = staff.user_id
where account.email is not null
on conflict (email_normalized) do update set
  user_id = coalesce(public.platform_team_members.user_id, excluded.user_id),
  full_name = excluded.full_name,
  active = public.platform_team_members.active or excluded.active,
  can_receive_hq_access = true,
  linked_at = coalesce(public.platform_team_members.linked_at, excluded.linked_at),
  updated_at = now();

create or replace function private.link_platform_team_member_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is not null and nullif(btrim(coalesce(new.email, '')), '') is not null then
    update public.platform_team_members member
    set user_id = new.user_id,
        linked_at = coalesce(member.linked_at, now()),
        updated_at = now()
    where member.email_normalized = lower(btrim(new.email))
      and (member.user_id is null or member.user_id = new.user_id);
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_link_platform_team_member on public.profiles;
create trigger profiles_link_platform_team_member
after insert or update of user_id, email on public.profiles
for each row execute function private.link_platform_team_member_profile();

create or replace function public.platform_save_team_member(
  p_member_id uuid,
  p_full_name text,
  p_email text,
  p_job_title text,
  p_department text,
  p_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  saved_id uuid;
  linked_user_id uuid;
  normalized_email text := lower(btrim(coalesce(p_email, '')));
begin
  if not private.is_platform_staff(array['platform_owner']) then
    raise exception 'Endast HQ-ägare kan hantera Bynex medarbetare'
      using errcode = '42501';
  end if;

  if char_length(btrim(coalesce(p_full_name, ''))) not between 2 and 160
    or char_length(normalized_email) not between 5 and 254
    or normalized_email !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$'
    or p_department not in ('management','sales','finance','support','product','engineering','operations','other')
    or char_length(coalesce(p_job_title, '')) > 160
  then
    raise exception 'Kontrollera uppgifterna för Bynex-medarbetaren'
      using errcode = '22023';
  end if;

  select account.id into linked_user_id
  from auth.users account
  where lower(account.email) = normalized_email
  order by account.created_at
  limit 1;

  if p_member_id is null then
    insert into public.platform_team_members (
      user_id,
      full_name,
      email,
      job_title,
      department,
      active,
      can_receive_hq_access,
      invited_at,
      linked_at,
      created_by_user_id,
      updated_by_user_id
    ) values (
      linked_user_id,
      btrim(p_full_name),
      normalized_email,
      nullif(btrim(coalesce(p_job_title, '')), ''),
      p_department,
      p_active,
      true,
      case when linked_user_id is null then now() else null end,
      case when linked_user_id is not null then now() else null end,
      actor_user_id,
      actor_user_id
    )
    on conflict (email_normalized) do update set
      user_id = coalesce(public.platform_team_members.user_id, excluded.user_id),
      full_name = excluded.full_name,
      job_title = excluded.job_title,
      department = excluded.department,
      active = excluded.active,
      can_receive_hq_access = true,
      linked_at = case
        when coalesce(public.platform_team_members.user_id, excluded.user_id) is not null
          then coalesce(public.platform_team_members.linked_at, now())
        else public.platform_team_members.linked_at
      end,
      updated_by_user_id = actor_user_id,
      updated_at = now()
    returning id into saved_id;
  else
    update public.platform_team_members member
    set user_id = coalesce(member.user_id, linked_user_id),
        full_name = btrim(p_full_name),
        email = normalized_email,
        job_title = nullif(btrim(coalesce(p_job_title, '')), ''),
        department = p_department,
        active = p_active,
        can_receive_hq_access = true,
        linked_at = case
          when coalesce(member.user_id, linked_user_id) is not null
            then coalesce(member.linked_at, now())
          else member.linked_at
        end,
        updated_by_user_id = actor_user_id,
        updated_at = now()
    where member.id = p_member_id
    returning member.id into saved_id;

    if saved_id is null then
      raise exception 'Bynex-medarbetaren hittades inte' using errcode = 'P0002';
    end if;
  end if;

  insert into public.platform_admin_audit_events (staff_user_id, action, metadata)
  values (
    actor_user_id,
    'save_platform_team_member',
    jsonb_build_object(
      'team_member_id', saved_id,
      'email', normalized_email,
      'linked_user_id', linked_user_id,
      'department', p_department,
      'active', p_active
    )
  );

  return saved_id;
end;
$$;

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
        select
          staff.user_id,
          staff.role,
          staff.active,
          staff.granted_at,
          staff.last_reviewed_at,
          coalesce(team.full_name, profile.full_name) as full_name,
          coalesce(team.email, profile.email) as email,
          profile.avatar_url,
          team.id as team_member_id,
          team.job_title,
          team.department
        from public.platform_staff staff
        left join public.platform_team_members team on team.user_id = staff.user_id
        left join public.profiles profile on profile.user_id = staff.user_id
      ) item
    ), '[]'::jsonb),
    'team_members', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.active desc, item.full_name, item.email)
      from (
        select
          member.id,
          member.user_id,
          member.full_name,
          member.email,
          member.job_title,
          member.department,
          member.active,
          member.can_receive_hq_access,
          member.invited_at,
          member.linked_at,
          member.created_at,
          member.updated_at,
          staff.role as hq_role,
          staff.active as hq_active
        from public.platform_team_members member
        left join public.platform_staff staff on staff.user_id = member.user_id
      ) item
    ), '[]'::jsonb),
    'candidate_users', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.full_name, item.email)
      from (
        select
          member.user_id,
          member.id as team_member_id,
          member.full_name,
          member.email,
          member.job_title,
          member.department
        from public.platform_team_members member
        where member.user_id is not null
          and member.active
          and member.can_receive_hq_access
        order by member.full_name, member.email
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
  selected_team_member public.platform_team_members;
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

  select * into selected_team_member
  from public.platform_team_members member
  where member.user_id = p_user_id
    and member.active
    and member.can_receive_hq_access;

  if selected_team_member.id is null then
    raise exception 'HQ-behörighet kan endast ges till en aktiv Bynex-medarbetare'
      using errcode = '42501';
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
  values (
    (select auth.uid()),
    'set_platform_staff_access',
    jsonb_build_object(
      'target_user_id', p_user_id,
      'team_member_id', selected_team_member.id,
      'role', p_role,
      'active', p_active
    )
  );

  return saved;
end;
$$;

revoke all on function public.platform_save_team_member(uuid,text,text,text,text,boolean)
  from public, anon;
revoke all on function public.get_platform_hq_management() from public, anon;
revoke all on function public.platform_set_staff_access(uuid,text,boolean)
  from public, anon;

grant execute on function public.platform_save_team_member(uuid,text,text,text,text,boolean)
  to authenticated;
grant execute on function public.get_platform_hq_management() to authenticated;
grant execute on function public.platform_set_staff_access(uuid,text,boolean)
  to authenticated;

select pg_notify('pgrst', 'reload schema');

commit;
