begin;

create table if not exists public.organization_number_sequences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sequence_type text not null,
  scope_key text not null default 'global',
  last_value bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, sequence_type, scope_key),
  check (sequence_type in ('quote','project','change_order')),
  check (char_length(scope_key) between 1 and 200),
  check (last_value >= 0)
);

alter table public.organization_number_sequences enable row level security;
alter table public.organization_number_sequences force row level security;
revoke all on public.organization_number_sequences from public, anon, authenticated;

alter table public.projects
  add column if not exists source_quote_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.projects'::regclass
      and conname = 'projects_source_quote_tenant_fkey'
  ) then
    alter table public.projects
      add constraint projects_source_quote_tenant_fkey
      foreign key (organization_id, source_quote_id)
      references public.quotes (organization_id, id)
      on delete set null (source_quote_id);
  end if;
end $$;

create unique index if not exists projects_source_quote_unique
  on public.projects (organization_id, source_quote_id)
  where source_quote_id is not null;

create index if not exists projects_source_quote_lookup
  on public.projects (organization_id, source_quote_id, created_at desc)
  where source_quote_id is not null;

create or replace function private.next_bynex_sequence(
  requested_organization_id uuid,
  requested_sequence_type text,
  requested_scope_key text,
  existing_maximum bigint default 0
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  allocated_value bigint;
begin
  if requested_organization_id is null
    or requested_sequence_type not in ('quote','project','change_order')
    or char_length(coalesce(requested_scope_key, '')) not between 1 and 200
    or coalesce(existing_maximum, 0) < 0
  then
    raise exception 'Ogiltig nummerserie' using errcode = '22023';
  end if;

  insert into public.organization_number_sequences (
    organization_id,
    sequence_type,
    scope_key,
    last_value
  ) values (
    requested_organization_id,
    requested_sequence_type,
    requested_scope_key,
    coalesce(existing_maximum, 0) + 1
  )
  on conflict (organization_id, sequence_type, scope_key) do update
  set last_value = greatest(
        public.organization_number_sequences.last_value,
        coalesce(existing_maximum, 0)
      ) + 1,
      updated_at = now()
  returning last_value into allocated_value;

  return allocated_value;
end;
$$;

revoke all on function private.next_bynex_sequence(uuid, text, text, bigint)
  from public, anon, authenticated;

create or replace function private.format_bynex_sequence(
  requested_value bigint,
  requested_minimum_digits integer
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when requested_value < power(10::numeric, requested_minimum_digits)
      then lpad(requested_value::text, requested_minimum_digits, '0')
    else requested_value::text
  end
$$;

revoke all on function private.format_bynex_sequence(bigint, integer)
  from public, anon, authenticated;

create or replace function public.create_bynex_quote_draft(
  p_title text,
  p_customer_name text,
  p_contact_name text default null,
  p_contact_email text default null,
  p_location text default null,
  p_description text default null,
  p_price_amount numeric default 0,
  p_valid_until date default null
)
returns public.quotes
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  selected_organization_id uuid;
  existing_maximum bigint := 0;
  sequence_value bigint;
  quote_number_value text;
  created_quote public.quotes;
begin
  select profile.current_organization_id
  into selected_organization_id
  from public.profiles profile
  where profile.user_id = actor_user_id;

  if actor_user_id is null
    or selected_organization_id is null
    or not private.has_organization_role(
      selected_organization_id,
      array['owner','admin','office','manager']::text[],
      actor_user_id
    )
  then
    raise exception 'Behörighet att skapa offert saknas' using errcode = '42501';
  end if;

  if char_length(btrim(coalesce(p_title, ''))) not between 2 and 240
    or char_length(btrim(coalesce(p_customer_name, ''))) not between 2 and 200
    or (p_contact_name is not null and char_length(btrim(p_contact_name)) > 200)
    or (p_contact_email is not null and (
      char_length(btrim(p_contact_email)) > 254
      or btrim(p_contact_email) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ))
    or (p_location is not null and char_length(btrim(p_location)) > 300)
    or (p_description is not null and char_length(btrim(p_description)) > 4000)
    or coalesce(p_price_amount, 0) < 0
    or coalesce(p_price_amount, 0) > 10000000000
  then
    raise exception 'Kontrollera offertuppgifterna' using errcode = '22023';
  end if;

  select coalesce(max((substring(quote.quote_number from '^BY-O([0-9]+)$'))::bigint), 0)
  into existing_maximum
  from public.quotes quote
  where quote.organization_id = selected_organization_id
    and quote.quote_number ~ '^BY-O[0-9]+$';

  sequence_value := private.next_bynex_sequence(
    selected_organization_id,
    'quote',
    'global',
    existing_maximum
  );
  quote_number_value := 'BY-O' || private.format_bynex_sequence(sequence_value, 4);

  insert into public.quotes (
    organization_id,
    quote_number,
    title,
    customer_name,
    contact_name,
    contact_email,
    location,
    description,
    price_amount,
    valid_until,
    status,
    created_by_user_id
  ) values (
    selected_organization_id,
    quote_number_value,
    btrim(p_title),
    btrim(p_customer_name),
    nullif(btrim(p_contact_name), ''),
    nullif(lower(btrim(p_contact_email)), ''),
    nullif(btrim(p_location), ''),
    nullif(btrim(p_description), ''),
    coalesce(p_price_amount, 0),
    p_valid_until,
    'draft',
    actor_user_id
  )
  returning * into created_quote;

  return created_quote;
end;
$$;

create or replace function public.create_bynex_project(
  p_name text,
  p_customer_name text,
  p_customer_email text default null,
  p_customer_phone text default null,
  p_address text default null,
  p_postal_code text default null,
  p_city text default null,
  p_pricing_type text default 'running',
  p_budget numeric default 0,
  p_start_date date default null,
  p_end_date date default null
)
returns public.projects
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  selected_organization_id uuid;
  existing_maximum bigint := 0;
  sequence_value bigint;
  project_number_value text;
  created_project public.projects;
begin
  select profile.current_organization_id
  into selected_organization_id
  from public.profiles profile
  where profile.user_id = actor_user_id;

  if actor_user_id is null
    or selected_organization_id is null
    or not private.has_organization_role(
      selected_organization_id,
      array['owner','admin','office','manager']::text[],
      actor_user_id
    )
  then
    raise exception 'Behörighet att skapa projekt saknas' using errcode = '42501';
  end if;

  if char_length(btrim(coalesce(p_name, ''))) not between 2 and 240
    or char_length(btrim(coalesce(p_customer_name, ''))) not between 2 and 200
    or (p_customer_email is not null and (
      char_length(btrim(p_customer_email)) > 254
      or btrim(p_customer_email) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ))
    or (p_customer_phone is not null and char_length(btrim(p_customer_phone)) > 40)
    or (p_address is not null and char_length(btrim(p_address)) > 300)
    or (p_postal_code is not null and char_length(btrim(p_postal_code)) > 20)
    or (p_city is not null and char_length(btrim(p_city)) > 120)
    or p_pricing_type not in ('running','fixed_price','internal')
    or coalesce(p_budget, 0) < 0
    or coalesce(p_budget, 0) > 10000000000
    or (p_start_date is not null and p_end_date is not null and p_end_date < p_start_date)
  then
    raise exception 'Kontrollera projektuppgifterna' using errcode = '22023';
  end if;

  select coalesce(max((substring(project.project_number from '^BY-X([0-9]+)$'))::bigint), 0)
  into existing_maximum
  from public.projects project
  where project.organization_id = selected_organization_id
    and project.project_number ~ '^BY-X[0-9]+$';

  sequence_value := private.next_bynex_sequence(
    selected_organization_id,
    'project',
    'global',
    existing_maximum
  );
  project_number_value := 'BY-X' || private.format_bynex_sequence(sequence_value, 4);

  insert into public.projects (
    organization_id,
    project_number,
    name,
    customer_name,
    customer_email,
    customer_phone,
    address,
    postal_code,
    city,
    pricing_type,
    budget,
    start_date,
    end_date,
    status,
    progress,
    active
  ) values (
    selected_organization_id,
    project_number_value,
    btrim(p_name),
    btrim(p_customer_name),
    nullif(lower(btrim(p_customer_email)), ''),
    nullif(btrim(p_customer_phone), ''),
    nullif(btrim(p_address), ''),
    nullif(btrim(p_postal_code), ''),
    nullif(btrim(p_city), ''),
    p_pricing_type,
    coalesce(p_budget, 0),
    p_start_date,
    p_end_date,
    'planned',
    0,
    true
  )
  returning * into created_project;

  return created_project;
end;
$$;

create or replace function public.create_project_from_quote(
  requested_quote_id uuid
)
returns public.projects
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  selected_organization_id uuid;
  selected_quote public.quotes;
  selected_submission public.quote_customer_submissions;
  existing_project public.projects;
  existing_maximum bigint := 0;
  sequence_value bigint;
  project_number_value text;
  created_project public.projects;
begin
  select profile.current_organization_id
  into selected_organization_id
  from public.profiles profile
  where profile.user_id = actor_user_id;

  if actor_user_id is null
    or selected_organization_id is null
    or not private.has_organization_role(
      selected_organization_id,
      array['owner','admin','office','manager']::text[],
      actor_user_id
    )
  then
    raise exception 'Behörighet att skapa projekt saknas' using errcode = '42501';
  end if;

  select quote.* into selected_quote
  from public.quotes quote
  where quote.organization_id = selected_organization_id
    and quote.id = requested_quote_id
  for update;

  if selected_quote.id is null then
    raise exception 'Offerten hittades inte' using errcode = 'P0002';
  end if;

  if selected_quote.converted_project_id is not null then
    select project.* into existing_project
    from public.projects project
    where project.organization_id = selected_organization_id
      and project.id = selected_quote.converted_project_id;
    if existing_project.id is not null then
      return existing_project;
    end if;
  end if;

  select project.* into existing_project
  from public.projects project
  where project.organization_id = selected_organization_id
    and project.source_quote_id = selected_quote.id
  order by project.created_at
  limit 1;

  if existing_project.id is not null then
    update public.quotes
    set converted_project_id = existing_project.id,
        status = 'converted',
        updated_at = now()
    where organization_id = selected_organization_id
      and id = selected_quote.id;
    return existing_project;
  end if;

  if selected_quote.status not in ('signed','converted') then
    raise exception 'Offerten måste vara godkänd innan projektet skapas'
      using errcode = '23514';
  end if;

  select submission.* into selected_submission
  from public.quote_customer_submissions submission
  where submission.organization_id = selected_organization_id
    and submission.quote_id = selected_quote.id
    and submission.status = 'complete'
  order by submission.customer_confirmed_at desc nulls last,
           submission.created_at desc
  limit 1;

  select coalesce(max((substring(project.project_number from '^BY-X([0-9]+)$'))::bigint), 0)
  into existing_maximum
  from public.projects project
  where project.organization_id = selected_organization_id
    and project.project_number ~ '^BY-X[0-9]+$';

  sequence_value := private.next_bynex_sequence(
    selected_organization_id,
    'project',
    'global',
    existing_maximum
  );
  project_number_value := 'BY-X' || private.format_bynex_sequence(sequence_value, 4);

  insert into public.projects (
    organization_id,
    project_number,
    name,
    customer_name,
    customer_email,
    customer_phone,
    address,
    postal_code,
    city,
    country_code,
    pricing_type,
    budget,
    status,
    progress,
    active,
    source_quote_id
  ) values (
    selected_organization_id,
    project_number_value,
    selected_quote.title,
    coalesce(selected_submission.customer_name, selected_quote.customer_name),
    coalesce(selected_submission.email, selected_quote.contact_email),
    selected_submission.phone,
    coalesce(selected_submission.address_line1, selected_quote.location),
    selected_submission.postal_code,
    selected_submission.city,
    coalesce(selected_submission.country_code, 'SE'),
    case when selected_quote.price_amount > 0 then 'fixed_price' else 'running' end,
    selected_quote.price_amount,
    'planned',
    0,
    true,
    selected_quote.id
  )
  returning * into created_project;

  update public.quotes
  set converted_project_id = created_project.id,
      status = 'converted',
      updated_at = now()
  where organization_id = selected_organization_id
    and id = selected_quote.id;

  return created_project;
end;
$$;

create or replace function public.create_project_from_quote(
  requested_quote_id uuid,
  requested_project_code text
)
returns public.projects
language sql
security definer
set search_path = ''
as $$
  select public.create_project_from_quote(requested_quote_id)
$$;

create or replace function public.create_bynex_change_order_draft(
  p_project_id uuid,
  p_title text,
  p_description text,
  p_requested_by text default null,
  p_location_detail text default null,
  p_customer_email text default null,
  p_customer_phone text default null
)
returns public.change_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  selected_organization_id uuid;
  selected_project public.projects;
  existing_maximum bigint := 0;
  sequence_value bigint;
  change_order_number_value text;
  created_change_order public.change_orders;
begin
  select profile.current_organization_id
  into selected_organization_id
  from public.profiles profile
  where profile.user_id = actor_user_id;

  if actor_user_id is null
    or selected_organization_id is null
    or not private.has_organization_role(
      selected_organization_id,
      array['owner','admin','office','manager']::text[],
      actor_user_id
    )
  then
    raise exception 'Behörighet att registrera ÄTA saknas' using errcode = '42501';
  end if;

  select project.* into selected_project
  from public.projects project
  where project.organization_id = selected_organization_id
    and project.id = p_project_id
  for update;

  if selected_project.id is null then
    raise exception 'Projektet hittades inte' using errcode = 'P0002';
  end if;

  if selected_project.status in ('completed','cancelled') or not selected_project.active then
    raise exception 'ÄTA kan inte skapas på ett avslutat projekt' using errcode = '23514';
  end if;

  if char_length(btrim(coalesce(p_title, ''))) not between 2 and 240
    or char_length(btrim(coalesce(p_description, ''))) not between 2 and 4000
    or (p_requested_by is not null and char_length(btrim(p_requested_by)) > 200)
    or (p_location_detail is not null and char_length(btrim(p_location_detail)) > 300)
    or (p_customer_email is not null and (
      char_length(btrim(p_customer_email)) > 254
      or btrim(p_customer_email) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ))
    or (p_customer_phone is not null and char_length(btrim(p_customer_phone)) > 40)
  then
    raise exception 'Kontrollera ÄTA-uppgifterna' using errcode = '22023';
  end if;

  select coalesce(max((substring(change_order.change_order_number from 'ÄTA([0-9]+)$'))::bigint), 0)
  into existing_maximum
  from public.change_orders change_order
  where change_order.organization_id = selected_organization_id
    and change_order.project_id = selected_project.id
    and change_order.change_order_number ~ 'ÄTA[0-9]+$';

  sequence_value := private.next_bynex_sequence(
    selected_organization_id,
    'change_order',
    selected_project.id::text,
    existing_maximum
  );
  change_order_number_value := selected_project.project_number
    || '-ÄTA'
    || private.format_bynex_sequence(sequence_value, 3);

  insert into public.change_orders (
    organization_id,
    project_id,
    change_order_number,
    title,
    customer_name,
    description,
    requested_by,
    capture_source,
    location_detail,
    customer_email,
    customer_phone,
    status,
    price_status,
    work_start_blocked,
    created_by_user_id
  ) values (
    selected_organization_id,
    selected_project.id,
    change_order_number_value,
    btrim(p_title),
    selected_project.customer_name,
    btrim(p_description),
    nullif(btrim(p_requested_by), ''),
    'manual',
    coalesce(nullif(btrim(p_location_detail), ''), selected_project.address),
    coalesce(nullif(lower(btrim(p_customer_email)), ''), selected_project.customer_email),
    coalesce(nullif(btrim(p_customer_phone), ''), selected_project.customer_phone),
    'draft',
    'not_calculated',
    true,
    actor_user_id
  )
  returning * into created_change_order;

  return created_change_order;
end;
$$;

revoke all on function public.create_bynex_quote_draft(
  text, text, text, text, text, text, numeric, date
) from public, anon;
grant execute on function public.create_bynex_quote_draft(
  text, text, text, text, text, text, numeric, date
) to authenticated, service_role;

revoke all on function public.create_bynex_project(
  text, text, text, text, text, text, text, text, numeric, date, date
) from public, anon;
grant execute on function public.create_bynex_project(
  text, text, text, text, text, text, text, text, numeric, date, date
) to authenticated, service_role;

revoke all on function public.create_project_from_quote(uuid) from public, anon;
grant execute on function public.create_project_from_quote(uuid)
  to authenticated, service_role;

revoke all on function public.create_project_from_quote(uuid, text) from public, anon;
grant execute on function public.create_project_from_quote(uuid, text)
  to authenticated, service_role;

revoke all on function public.create_bynex_change_order_draft(
  uuid, text, text, text, text, text, text
) from public, anon;
grant execute on function public.create_bynex_change_order_draft(
  uuid, text, text, text, text, text, text
) to authenticated, service_role;

select pg_notify('pgrst', 'reload schema');

commit;
