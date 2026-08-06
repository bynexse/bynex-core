begin;

create table private.platform_team_invites (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid not null references public.platform_team_directory(id) on delete cascade,
  email_normalized text not null,
  token_hash text not null unique,
  invited_by_user_id uuid not null references auth.users(id) on delete restrict,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (email_normalized = lower(btrim(email_normalized)))
);

create unique index platform_team_invites_active_email_idx
  on private.platform_team_invites(email_normalized)
  where accepted_at is null;

revoke all on private.platform_team_invites from public,anon,authenticated;

create or replace function public.platform_add_internal_team_member_v2(
  p_full_name text,
  p_email text,
  p_department text,
  p_role text,
  p_plain_token text,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  normalized_email text := lower(btrim(coalesce(p_email, '')));
  result jsonb;
  team_member_id uuid;
  account_ready boolean;
  invite_id uuid;
  invitation_url text;
begin
  if not private.is_platform_staff(array['platform_owner','platform_admin']) then
    raise exception 'Only Bynex owners and administrators can add team members'
      using errcode = '42501';
  end if;

  if char_length(coalesce(p_plain_token, '')) < 32
     or p_expires_at <= now()
     or p_expires_at > now() + interval '30 days'
  then
    raise exception 'Kontrollera Bynex-inbjudan' using errcode = '22023';
  end if;

  select public.platform_add_internal_team_member(
    p_full_name,
    normalized_email,
    p_department,
    p_role
  ) into result;

  team_member_id := (result ->> 'id')::uuid;
  account_ready := coalesce((result ->> 'account_ready')::boolean, false);

  if not account_ready then
    update private.platform_team_invites
    set expires_at = now(),
        accepted_at = coalesce(accepted_at, now())
    where email_normalized = normalized_email
      and accepted_at is null;

    insert into private.platform_team_invites (
      team_member_id,
      email_normalized,
      token_hash,
      invited_by_user_id,
      expires_at
    ) values (
      team_member_id,
      normalized_email,
      encode(extensions.digest(p_plain_token, 'sha256'), 'hex'),
      actor_user_id,
      p_expires_at
    ) returning id into invite_id;

    invitation_url := 'https://bynex.se/inbjudan/bynex-team?token=' || p_plain_token;

    insert into private.transactional_email_queue (
      recipient_email,
      template_key,
      payload,
      idempotency_key
    ) values (
      normalized_email,
      'platform-team-invitation',
      jsonb_build_object(
        'full_name', btrim(p_full_name),
        'department', btrim(p_department),
        'role', p_role,
        'token', p_plain_token,
        'invitation_url', invitation_url,
        'expires_at', p_expires_at,
        'team_member_id', team_member_id
      ),
      'platform-team-invitation:' || invite_id::text
    );
  end if;

  return result || jsonb_build_object(
    'invite_id', invite_id,
    'invitation_url', invitation_url,
    'invitation_required', not account_ready
  );
end;
$$;

create or replace function public.accept_platform_team_invite(
  p_user_id uuid,
  p_plain_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_user_email text;
  selected_invite record;
  selected_team public.platform_team_directory;
begin
  if p_user_id is distinct from (select auth.uid()) then
    raise exception 'The authenticated user must accept their own invitation'
      using errcode = '42501';
  end if;

  select lower(account.email)
  into selected_user_email
  from auth.users account
  where account.id = p_user_id
    and account.email_confirmed_at is not null;

  select invite.* into selected_invite
  from private.platform_team_invites invite
  where invite.token_hash = encode(extensions.digest(p_plain_token, 'sha256'), 'hex')
    and invite.accepted_at is null
    and invite.expires_at > now()
  limit 1
  for update;

  if selected_user_email is null
     or selected_invite.id is null
     or selected_invite.email_normalized <> selected_user_email
  then
    raise exception 'Invitation is invalid or expired' using errcode = '42501';
  end if;

  select * into selected_team
  from public.platform_team_directory
  where id = selected_invite.team_member_id
  for update;

  if selected_team.id is null
     or selected_team.email <> selected_user_email
     or selected_team.status = 'inactive'
  then
    raise exception 'Bynex team member is not available' using errcode = '42501';
  end if;

  update public.platform_team_directory
  set user_id = p_user_id,
      status = 'active',
      linked_at = coalesce(linked_at, now()),
      last_reviewed_at = now(),
      updated_at = now()
  where id = selected_team.id;

  insert into public.platform_staff (
    user_id,
    role,
    active,
    granted_by_user_id,
    granted_at,
    last_reviewed_at
  ) values (
    p_user_id,
    selected_team.intended_role,
    true,
    selected_invite.invited_by_user_id,
    now(),
    now()
  )
  on conflict (user_id) do update set
    role = excluded.role,
    active = true,
    granted_by_user_id = excluded.granted_by_user_id,
    last_reviewed_at = now(),
    updated_at = now();

  update private.platform_team_invites
  set accepted_at = now(),
      accepted_by_user_id = p_user_id
  where id = selected_invite.id;

  insert into public.platform_admin_audit_events (staff_user_id, action, metadata)
  values (
    p_user_id,
    'accept_platform_team_invite',
    jsonb_build_object(
      'team_member_id', selected_team.id,
      'role', selected_team.intended_role
    )
  );

  return jsonb_build_object(
    'team_member_id', selected_team.id,
    'role', selected_team.intended_role,
    'accepted', true
  );
end;
$$;

revoke all on function public.platform_add_internal_team_member_v2(
  text,text,text,text,text,timestamptz
) from public,anon;
revoke all on function public.accept_platform_team_invite(uuid,text)
  from public,anon;

grant execute on function public.platform_add_internal_team_member_v2(
  text,text,text,text,text,timestamptz
) to authenticated;
grant execute on function public.accept_platform_team_invite(uuid,text)
  to authenticated;

select pg_notify('pgrst','reload schema');

commit;
