begin;

create or replace function public.accept_organization_invite_internal(
  p_user_id uuid,
  p_plain_token text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_user_email text;
  selected_profile_id uuid;
  selected_profile_name text;
  selected_invite record;
  linked_worker_id uuid;
begin
  select lower(account.email), profile.id, profile.full_name
  into selected_user_email, selected_profile_id, selected_profile_name
  from auth.users account
  join public.profiles profile on profile.user_id = account.id
  where account.id = p_user_id
    and account.email_confirmed_at is not null;

  select invite.* into selected_invite
  from private.organization_invites invite
  where invite.token_hash = encode(extensions.digest(p_plain_token, 'sha256'), 'hex')
    and invite.accepted_at is null
    and invite.expires_at > now()
  limit 1
  for update;

  if selected_user_email is null
    or selected_profile_id is null
    or selected_invite.id is null
    or selected_invite.email_normalized <> selected_user_email
  then
    raise exception 'Invitation is invalid or expired' using errcode = '42501';
  end if;

  insert into public.organization_members (
    organization_id,
    profile_id,
    user_id,
    role,
    active,
    invited_by_user_id
  ) values (
    selected_invite.organization_id,
    selected_profile_id,
    p_user_id,
    selected_invite.role,
    true,
    selected_invite.invited_by_user_id
  )
  on conflict (organization_id, user_id) do update
    set active = true,
        role = excluded.role,
        profile_id = excluded.profile_id,
        invited_by_user_id = excluded.invited_by_user_id,
        joined_at = now();

  update public.profiles profile
  set current_organization_id = coalesce(
        profile.current_organization_id,
        selected_invite.organization_id
      ),
      full_name = case
        when nullif(btrim(coalesce(profile.full_name, '')), '') is null
          then coalesce(selected_invite.full_name, selected_profile_name)
        else profile.full_name
      end,
      updated_at = now()
  where profile.id = selected_profile_id;

  update public.workers worker
  set profile_id = selected_profile_id,
      full_name = coalesce(
        selected_invite.full_name,
        selected_profile_name,
        worker.full_name
      ),
      active = true,
      updated_at = now()
  where worker.organization_id = selected_invite.organization_id
    and lower(coalesce(worker.email, '')) = selected_user_email
  returning worker.id into linked_worker_id;

  if linked_worker_id is null then
    insert into public.workers (
      organization_id,
      profile_id,
      full_name,
      email,
      employment_type,
      active,
      gps_enabled
    ) values (
      selected_invite.organization_id,
      selected_profile_id,
      coalesce(
        selected_invite.full_name,
        selected_profile_name,
        selected_user_email
      ),
      selected_user_email,
      case
        when selected_invite.role = 'contractor' then 'contractor'
        else 'employee'
      end,
      true,
      true
    );
  end if;

  update private.organization_invites invite
  set accepted_at = now(),
      accepted_by_user_id = p_user_id
  where invite.id = selected_invite.id;

  if selected_invite.seat_change_request_id is not null then
    update public.organization_seat_change_requests request
    set status = 'accepted',
        accepted_at = now(),
        updated_at = now()
    where request.id = selected_invite.seat_change_request_id;
  end if;

  return selected_invite.organization_id;
end;
$$;

revoke all on function public.accept_organization_invite_internal(uuid,text)
  from public, anon;
grant execute on function public.accept_organization_invite_internal(uuid,text)
  to authenticated;

select pg_notify('pgrst', 'reload schema');

commit;
