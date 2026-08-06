begin;

create or replace function private.sync_seat_change_invoice_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.seat_change_request_id is not null then
    update public.organization_seat_change_requests request
    set invoice_id = new.id,
        invoice_number = new.invoice_number,
        status = case when request.status = 'approved' then 'invoiced' else request.status end,
        updated_at = now()
    where request.id = new.seat_change_request_id;
  end if;
  return new;
end;
$$;

drop trigger if exists subscription_invoice_sync_seat_change_link
  on public.subscription_invoices;
create trigger subscription_invoice_sync_seat_change_link
after insert or update of seat_change_request_id, invoice_number
on public.subscription_invoices
for each row
execute function private.sync_seat_change_invoice_link();

create or replace function private.sync_organization_invite_seat_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.seat_change_request_id is not null then
    update public.organization_seat_change_requests request
    set invite_id = new.id,
        updated_at = now()
    where request.id = new.seat_change_request_id;
  end if;
  return new;
end;
$$;

drop trigger if exists organization_invite_sync_seat_change_link
  on private.organization_invites;
create trigger organization_invite_sync_seat_change_link
after insert or update of seat_change_request_id
on private.organization_invites
for each row
execute function private.sync_organization_invite_seat_link();

create or replace function private.sync_accepted_organization_invite_worker()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  accepted_profile_id uuid;
  accepted_profile_name text;
begin
  if new.accepted_at is null or new.accepted_by_user_id is null then
    return new;
  end if;
  if old.accepted_at is not null and old.accepted_by_user_id is not distinct from new.accepted_by_user_id then
    return new;
  end if;

  select profile.id, profile.full_name
  into accepted_profile_id, accepted_profile_name
  from public.profiles profile
  where profile.user_id = new.accepted_by_user_id;

  if accepted_profile_id is null then
    return new;
  end if;

  update public.workers worker
  set profile_id = accepted_profile_id,
      full_name = coalesce(new.full_name, accepted_profile_name, worker.full_name),
      active = true,
      updated_at = now()
  where worker.organization_id = new.organization_id
    and lower(coalesce(worker.email, '')) = new.email_normalized;

  return new;
end;
$$;

drop trigger if exists organization_invite_sync_accepted_worker
  on private.organization_invites;
create trigger organization_invite_sync_accepted_worker
after update of accepted_at, accepted_by_user_id
on private.organization_invites
for each row
execute function private.sync_accepted_organization_invite_worker();

-- Repair any links created before the integrity triggers were installed.
update public.organization_seat_change_requests request
set invoice_id = invoice.id,
    invoice_number = invoice.invoice_number,
    status = case when request.status = 'approved' then 'invoiced' else request.status end,
    updated_at = now()
from public.subscription_invoices invoice
where invoice.seat_change_request_id = request.id
  and (
    request.invoice_id is distinct from invoice.id
    or request.invoice_number is distinct from invoice.invoice_number
  );

update public.organization_seat_change_requests request
set invite_id = invite.id,
    updated_at = now()
from private.organization_invites invite
where invite.seat_change_request_id = request.id
  and request.invite_id is distinct from invite.id;

select pg_notify('pgrst', 'reload schema');

commit;
