begin;

-- Portal invitations are capability links; only a SHA-256 digest is stored.
-- the plaintext token is returned once to the authorized issuer.
alter table private.project_portal_invites
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists revocation_reason text,
  add column if not exists superseded_by_invite_id uuid references private.project_portal_invites(id) on delete set null,
  add column if not exists delivery_status text not null default 'link_ready',
  add column if not exists last_delivery_at timestamptz,
  add column if not exists delivery_attempts integer not null default 0;

alter table private.project_portal_invites
  drop constraint if exists project_portal_invites_delivery_status_check,
  add constraint project_portal_invites_delivery_status_check
    check (delivery_status in ('link_ready','queued','sent','failed','cancelled')),
  drop constraint if exists project_portal_invites_delivery_attempts_check,
  add constraint project_portal_invites_delivery_attempts_check
    check (delivery_attempts between 0 and 100),
  drop constraint if exists project_portal_invites_revocation_reason_check,
  add constraint project_portal_invites_revocation_reason_check
    check (revocation_reason is null or char_length(btrim(revocation_reason)) between 2 and 500);

create index if not exists project_portal_invites_pending_idx
  on private.project_portal_invites (portal_member_id,expires_at desc)
  where used_at is null and revoked_at is null;

create unique index if not exists project_portal_members_active_user_unique
  on public.project_portal_members (organization_id,project_id,user_id)
  where status='active' and user_id is not null;

create table if not exists private.project_portal_invite_audit_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  project_id uuid not null,
  portal_member_id uuid not null,
  invite_id uuid,
  event_type text not null check (event_type in (
    'issued','resent','revoked','accepted','expired','delivery_queued','delivery_sent','delivery_failed'
  )),
  actor_user_id uuid references auth.users(id) on delete set null,
  subject_user_id uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  foreign key (organization_id,project_id,portal_member_id)
    references public.project_portal_members(organization_id,project_id,id) on delete cascade,
  foreign key (invite_id) references private.project_portal_invites(id) on delete set null,
  check (jsonb_typeof(metadata)='object')
);

create index if not exists project_portal_invite_audit_member_idx
  on private.project_portal_invite_audit_events (portal_member_id,occurred_at desc);

revoke all on private.project_portal_invites,private.project_portal_invite_audit_events
  from public,anon,authenticated;

create or replace function private.guard_project_portal_member_write()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if current_setting('app.project_portal_invite_rpc',true)='1' then
    return coalesce(new,old);
  end if;
  raise exception using errcode='42501',message='Portalmedlemskap ändras endast genom den säkra inbjudningskedjan';
end;
$$;

revoke all on function private.guard_project_portal_member_write() from public,anon,authenticated;

drop trigger if exists guard_project_portal_member_write on public.project_portal_members;
create trigger guard_project_portal_member_write
  before insert or update or delete on public.project_portal_members
  for each row execute function private.guard_project_portal_member_write();

drop policy if exists project_portal_members_management_all on public.project_portal_members;
drop policy if exists project_portal_members_management_select on public.project_portal_members;
create policy project_portal_members_management_select
  on public.project_portal_members for select to authenticated
  using (private.has_organization_role(
    organization_id,array['owner','admin','office','manager']::text[],(select auth.uid())
  ));

revoke insert,update,delete on public.project_portal_members from authenticated;

create or replace function private.write_project_portal_invite_audit(
  requested_organization_id uuid,
  requested_project_id uuid,
  requested_member_id uuid,
  requested_invite_id uuid,
  requested_event_type text,
  requested_actor_user_id uuid,
  requested_subject_user_id uuid default null,
  requested_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  insert into private.project_portal_invite_audit_events (
    organization_id,project_id,portal_member_id,invite_id,event_type,
    actor_user_id,subject_user_id,metadata
  ) values (
    requested_organization_id,requested_project_id,requested_member_id,requested_invite_id,
    requested_event_type,requested_actor_user_id,requested_subject_user_id,
    coalesce(requested_metadata,'{}'::jsonb)
  );
end;
$$;

revoke all on function private.write_project_portal_invite_audit(uuid,uuid,uuid,uuid,text,uuid,uuid,jsonb)
  from public,anon,authenticated;

create or replace function public.create_project_portal_invite(
  requested_project_id uuid,
  requested_email text,
  requested_full_name text,
  requested_portal_role text default 'customer_contact',
  requested_expires_in_hours integer default 72,
  requested_can_view_timeline boolean default true,
  requested_can_view_documents boolean default true,
  requested_can_view_installations boolean default true,
  requested_can_view_checkins boolean default false,
  requested_can_comment boolean default true,
  requested_can_acknowledge boolean default true,
  requested_can_approve boolean default false
)
returns table(portal_member_id uuid,invite_id uuid,invite_token text,expires_at timestamptz)
language plpgsql
security definer
set search_path=''
as $$
declare
  current_user_id uuid := auth.uid();
  selected_organization_id uuid;
  normalized_email text := lower(btrim(requested_email));
  selected_member public.project_portal_members%rowtype;
  generated_token text;
  generated_invite_id uuid;
  generated_expiry timestamptz;
begin
  if current_user_id is null then raise exception using errcode='42501',message='Inloggning krävs'; end if;
  if requested_project_id is null then raise exception using errcode='22023',message='Projekt krävs'; end if;
  if normalized_email !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$' or char_length(normalized_email)>254 then
    raise exception using errcode='22023',message='E-postadressen är ogiltig';
  end if;
  if char_length(btrim(requested_full_name)) not between 2 and 160 then
    raise exception using errcode='22023',message='Namn krävs';
  end if;
  if requested_portal_role not in ('customer_owner','customer_contact','architect','engineer','inspector','property_manager','tenant','other') then
    raise exception using errcode='22023',message='Portalrollen är ogiltig';
  end if;
  if requested_expires_in_hours not between 1 and 168 then
    raise exception using errcode='22023',message='Giltighetstiden måste vara mellan 1 och 168 timmar';
  end if;

  select project.organization_id into selected_organization_id
  from public.projects project
  where project.id=requested_project_id;
  if selected_organization_id is null or not private.has_organization_role(
    selected_organization_id,array['owner','admin','office','manager']::text[],current_user_id
  ) then
    raise exception using errcode='42501',message='Du får inte bjuda in till det här projektet';
  end if;

  select member.* into selected_member
  from public.project_portal_members member
  where member.organization_id=selected_organization_id
    and member.project_id=requested_project_id
    and member.email_normalized=normalized_email
    and member.status in ('invited','active','suspended')
  for update;

  if selected_member.status='active' then
    raise exception using errcode='23505',message='E-postadressen har redan aktiv åtkomst';
  elsif selected_member.status='suspended' then
    raise exception using errcode='42501',message='Medlemskapet är spärrat och måste hanteras separat';
  end if;

  perform set_config('app.project_portal_invite_rpc','1',true);
  if selected_member.id is null then
    insert into public.project_portal_members (
      organization_id,project_id,email_normalized,full_name,portal_role,status,
      can_view_timeline,can_view_documents,can_view_installations,can_view_checkins,
      can_comment,can_acknowledge,can_approve,invited_by_user_id
    ) values (
      selected_organization_id,requested_project_id,normalized_email,btrim(requested_full_name),
      requested_portal_role,'invited',requested_can_view_timeline,requested_can_view_documents,
      requested_can_view_installations,requested_can_view_checkins,requested_can_comment,
      requested_can_acknowledge,requested_can_approve,current_user_id
    ) returning * into selected_member;
  else
    update public.project_portal_members member set
      full_name=btrim(requested_full_name),portal_role=requested_portal_role,
      can_view_timeline=requested_can_view_timeline,
      can_view_documents=requested_can_view_documents,
      can_view_installations=requested_can_view_installations,
      can_view_checkins=requested_can_view_checkins,can_comment=requested_can_comment,
      can_acknowledge=requested_can_acknowledge,can_approve=requested_can_approve,
      invited_by_user_id=current_user_id,invited_at=now(),user_id=null,accepted_at=null,status='invited'
    where member.id=selected_member.id returning * into selected_member;
  end if;

  update private.project_portal_invites invite set
    revoked_at=now(),revoked_by_user_id=current_user_id,
    revocation_reason='Ersatt av en ny inbjudan',delivery_status='cancelled'
  where invite.portal_member_id=selected_member.id
    and invite.used_at is null and invite.revoked_at is null;

  generated_token := encode(extensions.gen_random_bytes(32),'hex');
  generated_expiry := now()+make_interval(hours=>requested_expires_in_hours);
  insert into private.project_portal_invites (
    organization_id,project_id,portal_member_id,token_hash,email_normalized,
    expires_at,created_by_user_id,delivery_status
  ) values (
    selected_organization_id,requested_project_id,selected_member.id,
    encode(extensions.digest(convert_to(generated_token,'UTF8'),'sha256'),'hex'),
    normalized_email,generated_expiry,current_user_id,'link_ready'
  ) returning id into generated_invite_id;

  perform private.write_project_portal_invite_audit(
    selected_organization_id,requested_project_id,selected_member.id,generated_invite_id,
    'issued',current_user_id,null,jsonb_build_object('expires_at',generated_expiry)
  );
  return query select selected_member.id,generated_invite_id,generated_token,generated_expiry;
end;
$$;

revoke all on function public.create_project_portal_invite(uuid,text,text,text,integer,boolean,boolean,boolean,boolean,boolean,boolean,boolean)
  from public,anon;
grant execute on function public.create_project_portal_invite(uuid,text,text,text,integer,boolean,boolean,boolean,boolean,boolean,boolean,boolean)
  to authenticated;

create or replace function public.resend_project_portal_invite(
  requested_portal_member_id uuid,
  requested_expires_in_hours integer default 72
)
returns table(portal_member_id uuid,invite_id uuid,invite_token text,expires_at timestamptz)
language plpgsql
security definer
set search_path=''
as $$
declare
  current_user_id uuid := auth.uid();
  selected_member public.project_portal_members%rowtype;
  generated_token text;
  generated_invite_id uuid;
  generated_expiry timestamptz;
begin
  if current_user_id is null then raise exception using errcode='42501',message='Inloggning krävs'; end if;
  if requested_expires_in_hours not between 1 and 168 then raise exception using errcode='22023',message='Giltighetstiden är ogiltig'; end if;
  select member.* into selected_member from public.project_portal_members member
    where member.id=requested_portal_member_id for update;
  if selected_member.id is null or not private.has_organization_role(
    selected_member.organization_id,array['owner','admin','office','manager']::text[],current_user_id
  ) then raise exception using errcode='42501',message='Du får inte skicka om den här inbjudan'; end if;
  if selected_member.status<>'invited' then raise exception using errcode='23514',message='Endast väntande inbjudningar kan skickas om'; end if;

  update private.project_portal_invites invite set
    revoked_at=now(),revoked_by_user_id=current_user_id,
    revocation_reason='Ersatt vid återsändning',delivery_status='cancelled'
  where invite.portal_member_id=selected_member.id
    and invite.used_at is null and invite.revoked_at is null;

  generated_token := encode(extensions.gen_random_bytes(32),'hex');
  generated_expiry := now()+make_interval(hours=>requested_expires_in_hours);
  insert into private.project_portal_invites (
    organization_id,project_id,portal_member_id,token_hash,email_normalized,
    expires_at,created_by_user_id,delivery_status
  ) values (
    selected_member.organization_id,selected_member.project_id,selected_member.id,
    encode(extensions.digest(convert_to(generated_token,'UTF8'),'sha256'),'hex'),
    selected_member.email_normalized,generated_expiry,current_user_id,'link_ready'
  ) returning id into generated_invite_id;
  perform private.write_project_portal_invite_audit(
    selected_member.organization_id,selected_member.project_id,selected_member.id,generated_invite_id,
    'resent',current_user_id,null,jsonb_build_object('expires_at',generated_expiry)
  );
  return query select selected_member.id,generated_invite_id,generated_token,generated_expiry;
end;
$$;

revoke all on function public.resend_project_portal_invite(uuid,integer) from public,anon;
grant execute on function public.resend_project_portal_invite(uuid,integer) to authenticated;

create or replace function public.revoke_project_portal_invite(
  requested_portal_member_id uuid,
  requested_reason text default 'Återkallad av behörig användare'
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  current_user_id uuid := auth.uid();
  selected_member public.project_portal_members%rowtype;
  selected_invite_id uuid;
begin
  if current_user_id is null then raise exception using errcode='42501',message='Inloggning krävs'; end if;
  if char_length(btrim(requested_reason)) not between 2 and 500 then raise exception using errcode='22023',message='Skäl krävs'; end if;
  select member.* into selected_member from public.project_portal_members member
    where member.id=requested_portal_member_id for update;
  if selected_member.id is null or not private.has_organization_role(
    selected_member.organization_id,array['owner','admin','office','manager']::text[],current_user_id
  ) then raise exception using errcode='42501',message='Du får inte återkalla den här åtkomsten'; end if;

  select invite.id into selected_invite_id from private.project_portal_invites invite
    where invite.portal_member_id=selected_member.id and invite.used_at is null and invite.revoked_at is null
    order by invite.created_at desc limit 1;
  update private.project_portal_invites invite set
    revoked_at=now(),revoked_by_user_id=current_user_id,
    revocation_reason=btrim(requested_reason),delivery_status='cancelled'
  where invite.portal_member_id=selected_member.id and invite.used_at is null and invite.revoked_at is null;
  perform set_config('app.project_portal_invite_rpc','1',true);
  update public.project_portal_members member set status='revoked'
    where member.id=selected_member.id;
  perform private.write_project_portal_invite_audit(
    selected_member.organization_id,selected_member.project_id,selected_member.id,selected_invite_id,
    'revoked',current_user_id,selected_member.user_id,jsonb_build_object('reason',btrim(requested_reason))
  );
end;
$$;

revoke all on function public.revoke_project_portal_invite(uuid,text) from public,anon;
grant execute on function public.revoke_project_portal_invite(uuid,text) to authenticated;

create or replace function public.validate_project_portal_invite(
  requested_token text,
  requested_email text
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select case
    when requested_token !~ '^[0-9a-f]{64}$' or char_length(requested_email)>254 then false
    else exists (
      select 1
      from private.project_portal_invites invite
      join public.project_portal_members member
        on member.organization_id=invite.organization_id
       and member.project_id=invite.project_id
       and member.id=invite.portal_member_id
      where invite.token_hash=encode(extensions.digest(convert_to(requested_token,'UTF8'),'sha256'),'hex')
        and invite.email_normalized=lower(btrim(requested_email))
        and member.email_normalized=invite.email_normalized
        and member.status='invited'
        and invite.used_at is null and invite.revoked_at is null and invite.expires_at>now()
    )
  end
$$;

revoke all on function public.validate_project_portal_invite(text,text) from public;
grant execute on function public.validate_project_portal_invite(text,text) to anon,authenticated;

create or replace function public.accept_project_portal_invite(requested_token text)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text;
  current_email_confirmed_at timestamptz;
  selected_invite private.project_portal_invites%rowtype;
  selected_member public.project_portal_members%rowtype;
begin
  if current_user_id is null then raise exception using errcode='42501',message='Inloggning krävs'; end if;
  if requested_token !~ '^[0-9a-f]{64}$' then raise exception using errcode='22023',message='Inbjudan är ogiltig eller inte längre giltig'; end if;
  select lower(btrim(auth_user.email)),auth_user.email_confirmed_at
    into current_email,current_email_confirmed_at
  from auth.users auth_user where auth_user.id=current_user_id;
  if current_email is null or current_email_confirmed_at is null then
    raise exception using errcode='42501',message='E-postadressen måste vara verifierad';
  end if;
  select invite.* into selected_invite
  from private.project_portal_invites invite
  where invite.token_hash=encode(extensions.digest(convert_to(requested_token,'UTF8'),'sha256'),'hex')
  for update;
  if selected_invite.id is null or selected_invite.used_at is not null
     or selected_invite.revoked_at is not null or selected_invite.expires_at<=now()
     or selected_invite.email_normalized<>current_email then
    raise exception using errcode='42501',message='Inbjudan är ogiltig eller inte längre giltig';
  end if;
  select member.* into selected_member from public.project_portal_members member
    where member.organization_id=selected_invite.organization_id
      and member.project_id=selected_invite.project_id
      and member.id=selected_invite.portal_member_id
    for update;
  if selected_member.id is null or selected_member.status<>'invited'
     or selected_member.email_normalized<>current_email then
    raise exception using errcode='42501',message='Inbjudan är ogiltig eller inte längre giltig';
  end if;
  if exists (
    select 1 from public.project_portal_members other
    where other.organization_id=selected_member.organization_id
      and other.project_id=selected_member.project_id
      and other.user_id=current_user_id and other.status='active'
      and other.id<>selected_member.id
  ) then raise exception using errcode='23505',message='Kontot har redan åtkomst till projektet'; end if;

  perform set_config('app.project_portal_invite_rpc','1',true);
  update public.project_portal_members member set
    user_id=current_user_id,status='active',accepted_at=now(),last_seen_at=now()
  where member.id=selected_member.id;
  update private.project_portal_invites invite set used_at=now(),delivery_status='sent'
    where invite.id=selected_invite.id;
  update private.project_portal_invites invite set
    revoked_at=now(),revocation_reason='Medlemskapet accepterades via en annan inbjudan',delivery_status='cancelled'
  where invite.portal_member_id=selected_member.id and invite.id<>selected_invite.id
    and invite.used_at is null and invite.revoked_at is null;
  perform private.write_project_portal_invite_audit(
    selected_member.organization_id,selected_member.project_id,selected_member.id,selected_invite.id,
    'accepted',current_user_id,current_user_id,'{}'::jsonb
  );
  return selected_member.project_id;
end;
$$;

revoke all on function public.accept_project_portal_invite(text) from public,anon;
grant execute on function public.accept_project_portal_invite(text) to authenticated;

create or replace function public.list_project_portal_invites(requested_project_id uuid)
returns table(
  portal_member_id uuid,email_normalized text,full_name text,portal_role text,member_status text,
  can_view_timeline boolean,can_view_documents boolean,can_view_installations boolean,
  can_view_checkins boolean,can_comment boolean,can_acknowledge boolean,can_approve boolean,
  invited_at timestamptz,accepted_at timestamptz,last_seen_at timestamptz,
  latest_invite_id uuid,invite_expires_at timestamptz,invite_used_at timestamptz,
  invite_revoked_at timestamptz,delivery_status text
)
language plpgsql
stable
security definer
set search_path=''
as $$
declare selected_organization_id uuid;
begin
  select project.organization_id into selected_organization_id from public.projects project
    where project.id=requested_project_id;
  if auth.uid() is null or selected_organization_id is null or not private.has_organization_role(
    selected_organization_id,array['owner','admin','office','manager']::text[],auth.uid()
  ) then raise exception using errcode='42501',message='Du får inte läsa projektets portalmedlemmar'; end if;
  return query
  select member.id,member.email_normalized,member.full_name,member.portal_role,member.status,
    member.can_view_timeline,member.can_view_documents,member.can_view_installations,
    member.can_view_checkins,member.can_comment,member.can_acknowledge,member.can_approve,
    member.invited_at,member.accepted_at,member.last_seen_at,
    latest.id,latest.expires_at,latest.used_at,latest.revoked_at,latest.delivery_status
  from public.project_portal_members member
  left join lateral (
    select invite.id,invite.expires_at,invite.used_at,invite.revoked_at,invite.delivery_status
    from private.project_portal_invites invite where invite.portal_member_id=member.id
    order by invite.created_at desc limit 1
  ) latest on true
  where member.organization_id=selected_organization_id and member.project_id=requested_project_id
  order by member.created_at desc;
end;
$$;

revoke all on function public.list_project_portal_invites(uuid) from public,anon;
grant execute on function public.list_project_portal_invites(uuid) to authenticated;

commit;
