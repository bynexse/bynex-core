begin;

alter table public.platform_admin_audit_events
  alter column staff_user_id drop not null;

alter table public.platform_admin_audit_events
  add constraint platform_admin_audit_events_external_actor_check check (
    staff_user_id is not null
    or action in ('sign_platform_contract')
  );

create or replace function private.guard_subscription_invoice_void_with_credits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.document_type = 'invoice'
    and new.status = 'void'
    and old.status is distinct from 'void'
    and exists (
      select 1
      from public.subscription_invoices credit_note
      where credit_note.document_type = 'credit_note'
        and credit_note.credited_invoice_id = old.id
        and credit_note.status <> 'void'
    ) then
    raise exception 'En faktura med aktiva kreditfakturor kan inte makuleras'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_subscription_invoice_void_with_credits()
  from public, anon, authenticated;
create trigger guard_subscription_invoice_void_with_credits
  before update on public.subscription_invoices
  for each row execute function private.guard_subscription_invoice_void_with_credits();

commit;
