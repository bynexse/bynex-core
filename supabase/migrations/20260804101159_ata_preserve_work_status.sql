begin;

create or replace function private.preserve_started_change_order_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.work_started_at is not null
     and old.status in ('in_progress','completed')
     and new.status in ('awaiting_signature','approved') then
    new.status := old.status;
  end if;
  return new;
end;
$$;

revoke all on function private.preserve_started_change_order_status()
  from public,anon,authenticated;

commit;
