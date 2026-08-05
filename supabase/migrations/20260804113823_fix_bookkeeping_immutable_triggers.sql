begin;

drop trigger if exists guard_posted_voucher_lines on public.bookkeeping_voucher_lines;

create or replace function private.guard_posted_voucher()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if old.status in ('posted','reversed') then
    raise exception 'Bokförd verifikation är oföränderlig; skapa en rättelse'
      using errcode='42501';
  end if;
  return coalesce(new,old);
end;
$$;
revoke all on function private.guard_posted_voucher()
  from public,anon,authenticated;

create or replace function private.guard_posted_voucher_line()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if exists(
    select 1 from public.bookkeeping_vouchers v
    where v.organization_id=coalesce(new.organization_id,old.organization_id)
      and v.id=coalesce(new.voucher_id,old.voucher_id)
      and v.status in ('posted','reversed')
  ) then
    raise exception 'Bokförda rader är oföränderliga; skapa en rättelse'
      using errcode='42501';
  end if;
  return coalesce(new,old);
end;
$$;
revoke all on function private.guard_posted_voucher_line()
  from public,anon,authenticated;

create trigger guard_posted_voucher_lines
  before insert or update or delete on public.bookkeeping_voucher_lines
  for each row execute function private.guard_posted_voucher_line();

commit;
