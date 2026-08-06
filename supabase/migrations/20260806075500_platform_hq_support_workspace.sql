begin;

create table public.platform_support_case_messages (
  id uuid primary key default gen_random_uuid(),
  support_case_id uuid not null references public.platform_support_cases(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  visibility text not null default 'customer'
    check (visibility in ('customer','internal')),
  body text not null check (char_length(btrim(body)) between 2 and 10000),
  author_user_id uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create index platform_support_case_messages_case_idx
  on public.platform_support_case_messages (support_case_id, created_at, id);

alter table public.platform_support_case_messages enable row level security;
revoke all on public.platform_support_case_messages from public, anon, authenticated;

create or replace function public.get_platform_hq_support_messages(
  requested_organization_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_staff(array['platform_owner','platform_admin','support','finance','read_only']) then
    raise exception 'Platform support access required' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(to_jsonb(message) order by message.created_at, message.id)
    from public.platform_support_case_messages message
    where requested_organization_id is null
      or message.organization_id = requested_organization_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.platform_create_support_case(
  p_organization_id uuid,
  p_category text,
  p_subject text,
  p_description text,
  p_priority text default 'normal'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  if not private.is_platform_staff(array['platform_owner','platform_admin','support','finance']) then
    raise exception 'Platform support write access required' using errcode = '42501';
  end if;

  insert into public.platform_support_cases (
    organization_id, created_by_user_id, category, subject, description,
    priority, status, first_response_due_at, resolution_due_at
  ) values (
    p_organization_id, (select auth.uid()), p_category, btrim(p_subject),
    btrim(p_description), p_priority, 'open',
    case p_priority
      when 'urgent' then now() + interval '30 minutes'
      when 'high' then now() + interval '2 hours'
      else now() + interval '1 day'
    end,
    case p_priority
      when 'urgent' then now() + interval '4 hours'
      when 'high' then now() + interval '1 day'
      else now() + interval '3 days'
    end
  ) returning id into new_id;

  insert into public.platform_support_case_messages (
    support_case_id, organization_id, visibility, body, author_user_id
  ) values (
    new_id, p_organization_id, 'internal',
    'Ärendet skapades från Bynex HQ: ' || btrim(p_description),
    (select auth.uid())
  );

  insert into public.platform_admin_audit_events (staff_user_id, action, metadata)
  values ((select auth.uid()), 'create_platform_support_case',
    jsonb_build_object('organization_id', p_organization_id, 'case_id', new_id));
  return new_id;
end;
$$;

create or replace function public.platform_manage_support_case(
  p_case_id uuid,
  p_status text,
  p_priority text,
  p_assigned_to_user_id uuid default null
)
returns public.platform_support_cases
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved public.platform_support_cases;
begin
  if not private.is_platform_staff(array['platform_owner','platform_admin','support','finance']) then
    raise exception 'Platform support write access required' using errcode = '42501';
  end if;

  update public.platform_support_cases
  set status = p_status,
      priority = p_priority,
      assigned_to_user_id = p_assigned_to_user_id,
      first_responded_at = case
        when first_responded_at is null and p_status <> 'new' then now()
        else first_responded_at
      end,
      resolved_at = case
        when p_status in ('resolved','closed') then coalesce(resolved_at, now())
        else null
      end,
      updated_at = now()
  where id = p_case_id
  returning * into saved;

  if saved.id is null then
    raise exception 'Support case not found' using errcode = 'P0002';
  end if;

  insert into public.platform_admin_audit_events (staff_user_id, action, metadata)
  values ((select auth.uid()), 'update_platform_support_case',
    jsonb_build_object(
      'organization_id', saved.organization_id,
      'case_id', saved.id,
      'status', p_status,
      'priority', p_priority,
      'assigned_to_user_id', p_assigned_to_user_id
    ));
  return saved;
end;
$$;

create or replace function public.platform_add_support_message(
  p_case_id uuid,
  p_visibility text,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  support_case public.platform_support_cases;
  new_id uuid;
begin
  if not private.is_platform_staff(array['platform_owner','platform_admin','support','finance']) then
    raise exception 'Platform support write access required' using errcode = '42501';
  end if;

  select * into support_case
  from public.platform_support_cases
  where id = p_case_id;
  if support_case.id is null then
    raise exception 'Support case not found' using errcode = 'P0002';
  end if;

  insert into public.platform_support_case_messages (
    support_case_id, organization_id, visibility, body, author_user_id
  ) values (
    support_case.id, support_case.organization_id, p_visibility,
    btrim(p_body), (select auth.uid())
  ) returning id into new_id;

  update public.platform_support_cases
  set first_responded_at = coalesce(first_responded_at, now()),
      status = case when status = 'new' then 'open' else status end,
      updated_at = now()
  where id = support_case.id;

  insert into public.platform_admin_audit_events (staff_user_id, action, metadata)
  values ((select auth.uid()), 'add_platform_support_message',
    jsonb_build_object(
      'organization_id', support_case.organization_id,
      'case_id', support_case.id,
      'message_id', new_id,
      'visibility', p_visibility
    ));
  return new_id;
end;
$$;

revoke all on function public.get_platform_hq_support_messages(uuid) from public, anon;
revoke all on function public.platform_create_support_case(uuid,text,text,text,text) from public, anon;
revoke all on function public.platform_manage_support_case(uuid,text,text,uuid) from public, anon;
revoke all on function public.platform_add_support_message(uuid,text,text) from public, anon;

grant execute on function public.get_platform_hq_support_messages(uuid) to authenticated;
grant execute on function public.platform_create_support_case(uuid,text,text,text,text) to authenticated;
grant execute on function public.platform_manage_support_case(uuid,text,text,uuid) to authenticated;
grant execute on function public.platform_add_support_message(uuid,text,text) to authenticated;

commit;
