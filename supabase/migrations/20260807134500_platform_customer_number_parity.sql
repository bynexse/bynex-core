begin;

create sequence if not exists public.platform_customer_number_seq
  as bigint
  start with 100001
  increment by 1
  minvalue 1
  no maxvalue
  cache 1;

alter table public.organizations
  add column if not exists customer_number text;

create or replace function private.next_platform_customer_number()
returns text
language plpgsql
security definer
set search_path=''
as $$
declare
  candidate text;
begin
  loop
    candidate := 'BYX-' || lpad(nextval('public.platform_customer_number_seq')::text,6,'0');
    exit when not exists(
      select 1
      from public.organizations organization
      where organization.customer_number=candidate
    );
  end loop;
  return candidate;
end;
$$;

create or replace function private.assign_platform_customer_number()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if nullif(btrim(coalesce(new.customer_number,'')),'') is null then
    new.customer_number := private.next_platform_customer_number();
  else
    new.customer_number := upper(btrim(new.customer_number));
  end if;
  return new;
end;
$$;

revoke all on function private.next_platform_customer_number() from public,anon,authenticated;
revoke all on function private.assign_platform_customer_number() from public,anon,authenticated;

-- Existing organizations receive stable platform customer numbers in creation
-- order. This is deliberately done before NOT NULL and uniqueness are enforced.
do $$
declare
  organization_row record;
begin
  for organization_row in
    select id
    from public.organizations
    where nullif(btrim(coalesce(customer_number,'')),'') is null
    order by created_at,id
  loop
    update public.organizations
    set customer_number=private.next_platform_customer_number()
    where id=organization_row.id;
  end loop;
end;
$$;

update public.organizations
set customer_number=upper(btrim(customer_number))
where customer_number is distinct from upper(btrim(customer_number));

alter table public.organizations
  alter column customer_number set not null;

create unique index if not exists organizations_customer_number_key
  on public.organizations(customer_number);
create index if not exists organizations_customer_number_search_idx
  on public.organizations(lower(customer_number));

drop trigger if exists organizations_assign_platform_customer_number
  on public.organizations;
create trigger organizations_assign_platform_customer_number
before insert on public.organizations
for each row execute function private.assign_platform_customer_number();

comment on column public.organizations.customer_number is
  'Stable Bynex platform customer number used in HQ, support, supplier inboxes and cross-module references.';

select pg_notify('pgrst','reload schema');

commit;
