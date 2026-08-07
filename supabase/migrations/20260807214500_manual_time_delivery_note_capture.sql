begin;

-- Manual time stays compatible with every existing downstream flow by keeping
-- clock_in/clock_out while recording the user's explicit date and duration.
alter table public.time_entries
  add column if not exists entry_mode text not null default 'clock',
  add column if not exists work_date date,
  add column if not exists duration_minutes integer,
  add column if not exists client_request_id uuid;

alter table public.time_entries
  drop constraint if exists time_entries_source_check,
  add constraint time_entries_source_check
    check (source in ('web','mobile','admin','import','api','manual')),
  drop constraint if exists time_entries_entry_mode_check,
  add constraint time_entries_entry_mode_check
    check (entry_mode in ('clock','manual')),
  drop constraint if exists time_entries_duration_minutes_check,
  add constraint time_entries_duration_minutes_check
    check (duration_minutes is null or duration_minutes between 0 and 1440);

update public.time_entries entry
set work_date = (
  entry.clock_in at time zone coalesce(org.timezone, 'Europe/Stockholm')
)::date
from public.organizations org
where org.id = entry.organization_id
  and entry.work_date is null;

update public.time_entries entry
set duration_minutes = greatest(
  0,
  floor(extract(epoch from (entry.clock_out - entry.clock_in)) / 60)::integer
  - coalesce((
      select sum(
        greatest(
          0,
          floor(extract(epoch from (br.ended_at - br.started_at)) / 60)::integer
        )
      )::integer
      from public.time_breaks br
      where br.organization_id = entry.organization_id
        and br.time_entry_id = entry.id
        and br.break_type = 'unpaid'
        and br.ended_at is not null
    ), 0)
)
where entry.clock_out is not null
  and entry.duration_minutes is null;

alter table public.time_entries
  alter column work_date set not null;

create unique index if not exists time_entries_client_request_uidx
  on public.time_entries(organization_id, client_request_id)
  where client_request_id is not null;

create index if not exists time_entries_org_work_date_idx
  on public.time_entries(organization_id, worker_id, work_date desc);

create or replace function private.set_time_entry_duration()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_timezone text;
  v_unpaid_break_minutes integer := 0;
begin
  if new.work_date is null then
    select coalesce(o.timezone, 'Europe/Stockholm')
      into v_timezone
    from public.organizations o
    where o.id = new.organization_id;

    new.work_date := (
      new.clock_in at time zone coalesce(v_timezone, 'Europe/Stockholm')
    )::date;
  end if;

  if new.entry_mode = 'manual' then
    if new.duration_minutes is null
       or new.duration_minutes < 1
       or new.duration_minutes > 1440 then
      raise exception 'Manuell tid måste vara mellan 1 minut och 24 timmar'
        using errcode = '22023';
    end if;
    if new.clock_out is null then
      new.clock_out := new.clock_in + make_interval(mins => new.duration_minutes);
    end if;
    if new.status in ('active','on_break') then
      new.status := 'completed';
    end if;
  elsif new.clock_out is null then
    new.duration_minutes := null;
  else
    select coalesce(sum(
      greatest(
        0,
        floor(extract(epoch from (br.ended_at - br.started_at)) / 60)::integer
      )
    ), 0)::integer
      into v_unpaid_break_minutes
    from public.time_breaks br
    where br.organization_id = new.organization_id
      and br.time_entry_id = new.id
      and br.break_type = 'unpaid'
      and br.ended_at is not null;

    new.duration_minutes := greatest(
      0,
      floor(extract(epoch from (new.clock_out - new.clock_in)) / 60)::integer
      - v_unpaid_break_minutes
    );
  end if;

  return new;
end;
$$;

drop trigger if exists time_entries_set_duration on public.time_entries;
create trigger time_entries_set_duration
before insert or update of clock_in, clock_out, entry_mode, duration_minutes, work_date
on public.time_entries
for each row execute function private.set_time_entry_duration();

create or replace function private.normalize_text_key(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(
    regexp_replace(
      translate(lower(btrim(coalesce(p_value,''))), 'åäö', 'aao'),
      '[^a-z0-9]+',
      '',
      'g'
    ),
    200
  )
$$;

create or replace function private.normalize_article_key(
  p_article_number text,
  p_name text,
  p_unit text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select private.normalize_text_key(
    coalesce(
      nullif(btrim(p_article_number), ''),
      btrim(coalesce(p_name, '')) || ':' || btrim(coalesce(p_unit, ''))
    )
  )
$$;

create or replace function private.safe_numeric(p_value text)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_normalized text := replace(btrim(coalesce(p_value,'')), ',', '.');
  v_result numeric;
begin
  if v_normalized = '' then return null; end if;
  begin
    v_result := v_normalized::numeric;
  exception when invalid_text_representation or numeric_value_out_of_range then
    return null;
  end;
  return v_result;
end;
$$;

create table if not exists public.organization_articles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  catalog_product_id uuid references public.catalog_products(id) on delete set null,
  supplier_id uuid,
  supplier_name text,
  normalized_supplier_key text not null default '',
  article_number text,
  normalized_article_key text not null,
  name text not null,
  unit text not null default 'st',
  status text not null default 'active'
    check (status in ('suggested','active','archived')),
  source_kind text not null default 'manual'
    check (source_kind in ('manual','delivery_note','supplier_invoice','catalog')),
  source_document_id uuid,
  created_by_user_id uuid references auth.users(id) on delete set null,
  approved_by_user_id uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  foreign key (organization_id,supplier_id)
    references public.suppliers(organization_id,id) on delete set null (supplier_id),
  foreign key (organization_id,source_document_id)
    references public.bynex_documents(organization_id,id)
    on delete set null (source_document_id),
  check (char_length(name) between 1 and 240),
  check (char_length(unit) between 1 and 24),
  check (supplier_name is null or char_length(supplier_name) <= 240),
  check (article_number is null or char_length(article_number) <= 160),
  check (char_length(normalized_supplier_key) <= 200),
  check (char_length(normalized_article_key) between 1 and 200),
  check (status <> 'active' or approved_at is not null)
);

create unique index if not exists organization_articles_org_supplier_key_uidx
  on public.organization_articles(
    organization_id,
    normalized_supplier_key,
    normalized_article_key
  )
  where status in ('suggested','active');

drop trigger if exists organization_articles_set_updated_at
  on public.organization_articles;
create trigger organization_articles_set_updated_at
before update on public.organization_articles
for each row execute function public.set_updated_at();

create table if not exists public.time_entry_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  time_entry_id uuid not null,
  project_id uuid,
  document_id uuid not null,
  attachment_kind text not null default 'other'
    check (attachment_kind in ('delivery_note','photo','receipt','other')),
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,document_id),
  foreign key (organization_id,time_entry_id)
    references public.time_entries(organization_id,id) on delete cascade,
  foreign key (organization_id,project_id)
    references public.projects(organization_id,id) on delete set null (project_id),
  foreign key (organization_id,document_id)
    references public.bynex_documents(organization_id,id) on delete cascade
);

create index if not exists time_entry_attachments_entry_idx
  on public.time_entry_attachments(organization_id,time_entry_id,created_at desc);

create table if not exists public.time_delivery_note_analyses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  time_entry_id uuid not null,
  project_id uuid not null,
  document_id uuid not null,
  supplier_name text,
  document_number text,
  document_date date,
  total_amount numeric(14,2),
  confidence numeric(5,4) not null default 0
    check (confidence between 0 and 1),
  proposed_lines jsonb not null default '[]'::jsonb
    check (jsonb_typeof(proposed_lines) = 'array'),
  reviewed_lines jsonb
    check (reviewed_lines is null or jsonb_typeof(reviewed_lines) = 'array'),
  missing_information jsonb not null default '[]'::jsonb
    check (jsonb_typeof(missing_information) = 'array'),
  content_fingerprint text not null
    check (content_fingerprint ~ '^[a-f0-9]{64}$'),
  status text not null default 'proposed'
    check (status in ('proposed','applied','rejected','duplicate')),
  duplicate_of_analysis_id uuid,
  prepared_by_user_id uuid references auth.users(id) on delete set null,
  applied_by_user_id uuid references auth.users(id) on delete set null,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,document_id),
  foreign key (organization_id,time_entry_id)
    references public.time_entries(organization_id,id) on delete cascade,
  foreign key (organization_id,project_id)
    references public.projects(organization_id,id) on delete cascade,
  foreign key (organization_id,document_id)
    references public.bynex_documents(organization_id,id) on delete cascade,
  foreign key (organization_id,duplicate_of_analysis_id)
    references public.time_delivery_note_analyses(organization_id,id)
    on delete set null (duplicate_of_analysis_id),
  check ((status = 'applied') = (applied_at is not null)),
  check (supplier_name is null or char_length(supplier_name) <= 240),
  check (document_number is null or char_length(document_number) <= 160)
);

create index if not exists time_delivery_note_analysis_queue_idx
  on public.time_delivery_note_analyses(
    organization_id,status,created_at desc
  );

create index if not exists time_delivery_note_fingerprint_idx
  on public.time_delivery_note_analyses(
    organization_id,project_id,content_fingerprint
  );

drop trigger if exists time_delivery_note_analyses_set_updated_at
  on public.time_delivery_note_analyses;
create trigger time_delivery_note_analyses_set_updated_at
before update on public.time_delivery_note_analyses
for each row execute function public.set_updated_at();

alter table public.material_items
  add column if not exists time_entry_id uuid,
  add column if not exists organization_article_id uuid,
  add column if not exists source_kind text not null default 'manual',
  add column if not exists reconciliation_status text not null default 'unmatched',
  add column if not exists created_by_user_id uuid references auth.users(id) on delete set null;

alter table public.material_items
  drop constraint if exists material_items_status_check,
  add constraint material_items_status_check
    check (status in (
      'needed','order_today','ordered','delivered','delivered_unpriced',
      'backordered','cancelled'
    )),
  drop constraint if exists material_items_source_kind_check,
  add constraint material_items_source_kind_check
    check (source_kind in (
      'manual','time_article','delivery_note','supplier_invoice','purchase_order'
    )),
  drop constraint if exists material_items_reconciliation_status_check,
  add constraint material_items_reconciliation_status_check
    check (reconciliation_status in (
      'unmatched','matched_supplier_invoice','suggested_match'
    )),
  drop constraint if exists material_items_time_entry_tenant_fkey,
  add constraint material_items_time_entry_tenant_fkey
    foreign key (organization_id,time_entry_id)
    references public.time_entries(organization_id,id)
    on delete set null (time_entry_id),
  drop constraint if exists material_items_organization_article_tenant_fkey,
  add constraint material_items_organization_article_tenant_fkey
    foreign key (organization_id,organization_article_id)
    references public.organization_articles(organization_id,id)
    on delete set null (organization_article_id);

create index if not exists material_items_time_entry_idx
  on public.material_items(organization_id,time_entry_id,created_at)
  where time_entry_id is not null;

create table if not exists public.material_item_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  material_item_id uuid not null,
  source_type text not null
    check (source_type in ('time_article','delivery_note','supplier_invoice')),
  source_id uuid not null,
  source_document_id uuid,
  source_line_index integer not null default 0
    check (source_line_index between 0 and 10000),
  time_entry_id uuid,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  linked_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id,id),
  foreign key (organization_id,material_item_id)
    references public.material_items(organization_id,id) on delete cascade,
  foreign key (organization_id,source_document_id)
    references public.bynex_documents(organization_id,id)
    on delete set null (source_document_id),
  foreign key (organization_id,time_entry_id)
    references public.time_entries(organization_id,id)
    on delete set null (time_entry_id)
);

create unique index if not exists material_item_sources_source_line_uidx
  on public.material_item_sources(
    organization_id,source_type,source_id,source_line_index
  );

create unique index if not exists material_item_sources_one_invoice_per_item_uidx
  on public.material_item_sources(organization_id,material_item_id)
  where source_type = 'supplier_invoice';

create index if not exists material_item_sources_item_idx
  on public.material_item_sources(
    organization_id,material_item_id,created_at
  );

create or replace function private.can_access_time_entry_capture(
  p_organization_id uuid,
  p_time_entry_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.has_organization_role(
      p_organization_id,
      array['owner','admin','office','manager','supervisor']::text[],
      p_user_id
    )
    or private.is_own_time_entry(
      p_organization_id,
      p_time_entry_id,
      p_user_id
    )
$$;

revoke all on function private.can_access_time_entry_capture(uuid,uuid,uuid)
  from public,anon;
grant execute on function private.can_access_time_entry_capture(uuid,uuid,uuid)
  to authenticated;

alter table public.organization_articles enable row level security;
alter table public.organization_articles force row level security;
alter table public.time_entry_attachments enable row level security;
alter table public.time_entry_attachments force row level security;
alter table public.time_delivery_note_analyses enable row level security;
alter table public.time_delivery_note_analyses force row level security;
alter table public.material_item_sources enable row level security;
alter table public.material_item_sources force row level security;

drop policy if exists organization_articles_member_select
  on public.organization_articles;
create policy organization_articles_member_select
on public.organization_articles
for select to authenticated
using (
  private.is_organization_member(
    organization_id,(select auth.uid())
  )
);

drop policy if exists time_entry_attachments_member_select
  on public.time_entry_attachments;
create policy time_entry_attachments_member_select
on public.time_entry_attachments
for select to authenticated
using (
  private.can_access_time_entry_capture(
    organization_id,time_entry_id,(select auth.uid())
  )
);

drop policy if exists time_delivery_note_analyses_member_select
  on public.time_delivery_note_analyses;
create policy time_delivery_note_analyses_member_select
on public.time_delivery_note_analyses
for select to authenticated
using (
  private.can_access_time_entry_capture(
    organization_id,time_entry_id,(select auth.uid())
  )
);

drop policy if exists material_item_sources_member_select
  on public.material_item_sources;
create policy material_item_sources_member_select
on public.material_item_sources
for select to authenticated
using (
  private.is_organization_member(
    organization_id,(select auth.uid())
  )
);

revoke all on public.organization_articles
  from public,anon,authenticated;
revoke all on public.time_entry_attachments
  from public,anon,authenticated;
revoke all on public.time_delivery_note_analyses
  from public,anon,authenticated;
revoke all on public.material_item_sources
  from public,anon,authenticated;

grant select on public.organization_articles to authenticated;
grant select on public.time_entry_attachments to authenticated;
grant select on public.time_delivery_note_analyses to authenticated;
grant select on public.material_item_sources to authenticated;

create or replace function public.create_manual_time_entry(
  p_organization_id uuid,
  p_worker_id uuid,
  p_project_id uuid,
  p_work_type_id uuid,
  p_work_date date,
  p_duration_minutes integer,
  p_note text,
  p_client_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_profile_id uuid;
  v_own_worker_id uuid;
  v_worker_id uuid;
  v_timezone text;
  v_today date;
  v_existing_id uuid;
  v_existing_minutes integer := 0;
  v_clock_in timestamptz;
  v_entry_id uuid;
  v_privileged boolean;
begin
  if v_user_id is null then
    raise exception 'Inloggning krävs' using errcode = '42501';
  end if;
  if p_client_request_id is null then
    raise exception 'En säker engångsnyckel krävs' using errcode = '22023';
  end if;
  if p_work_date is null
     or p_duration_minutes is null
     or p_duration_minutes < 1
     or p_duration_minutes > 1440 then
    raise exception 'Ange datum, timmar och minuter'
      using errcode = '22023';
  end if;

  select entry.id into v_existing_id
  from public.time_entries entry
  where entry.organization_id = p_organization_id
    and entry.client_request_id = p_client_request_id;
  if v_existing_id is not null then return v_existing_id; end if;

  if not private.is_organization_member(p_organization_id,v_user_id) then
    raise exception 'Aktivt företagsmedlemskap krävs'
      using errcode = '42501';
  end if;

  select profile.id into v_profile_id
  from public.profiles profile
  where profile.user_id = v_user_id
    and profile.current_organization_id = p_organization_id;

  select worker.id into v_own_worker_id
  from public.workers worker
  where worker.organization_id = p_organization_id
    and worker.profile_id = v_profile_id
    and worker.active
  limit 1;

  v_privileged := private.has_organization_role(
    p_organization_id,
    array['owner','admin','office','manager','supervisor']::text[],
    v_user_id
  );
  v_worker_id := coalesce(p_worker_id,v_own_worker_id);

  if v_worker_id is null then
    raise exception 'En aktiv personalprofil krävs'
      using errcode = 'P0002';
  end if;
  if v_worker_id is distinct from v_own_worker_id and not v_privileged then
    raise exception 'Du får endast registrera din egen tid'
      using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.workers worker
    where worker.organization_id = p_organization_id
      and worker.id = v_worker_id
      and worker.active
  ) then
    raise exception 'Medarbetaren hittades inte'
      using errcode = 'P0002';
  end if;

  select coalesce(org.timezone,'Europe/Stockholm')
    into v_timezone
  from public.organizations org
  where org.id = p_organization_id;
  if v_timezone is null then
    raise exception 'Företagets tidszon saknas'
      using errcode = '23514';
  end if;

  v_today := (statement_timestamp() at time zone v_timezone)::date;
  if p_work_date > v_today or p_work_date < v_today - 400 then
    raise exception 'Manuell tid får registreras för idag eller de senaste 400 dagarna'
      using errcode = '22023';
  end if;

  if p_project_id is not null then
    if not exists (
      select 1 from public.projects project
      where project.organization_id = p_organization_id
        and project.id = p_project_id
        and project.active
    ) then
      raise exception 'Projektet hittades inte'
        using errcode = 'P0002';
    end if;
    if not v_privileged
       and not private.can_work_on_project(
         p_organization_id,p_project_id,v_user_id
       ) then
      raise exception 'Du är inte tilldelad projektet'
        using errcode = '42501';
    end if;
  end if;

  if p_work_type_id is not null and not exists (
    select 1 from public.work_types work_type
    where work_type.organization_id = p_organization_id
      and work_type.id = p_work_type_id
      and work_type.active
  ) then
    raise exception 'Arbetsmomentet hittades inte'
      using errcode = 'P0002';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_organization_id::text || ':' || v_worker_id::text || ':' || p_work_date::text,
      20260807190001
    )
  );

  if exists (
    select 1
    from public.time_entries entry
    where entry.organization_id = p_organization_id
      and entry.worker_id = v_worker_id
      and entry.work_date = p_work_date
      and entry.clock_out is null
  ) then
    raise exception 'Avsluta pågående tid innan manuell tid läggs på samma datum'
      using errcode = '23514';
  end if;

  select coalesce(sum(
    coalesce(
      entry.duration_minutes,
      case when entry.clock_out is not null then
        greatest(
          0,
          floor(extract(epoch from (entry.clock_out-entry.clock_in))/60)::integer
        )
      else 0 end
    )
  ),0)::integer
    into v_existing_minutes
  from public.time_entries entry
  where entry.organization_id = p_organization_id
    and entry.worker_id = v_worker_id
    and entry.work_date = p_work_date
    and entry.status <> 'rejected';

  if v_existing_minutes + p_duration_minutes > 1440 then
    raise exception 'Registrerad tid kan inte överstiga 24 timmar per dag'
      using errcode = '23514';
  end if;

  v_clock_in := (
    p_work_date::timestamp
      + time '00:00'
      + make_interval(mins => v_existing_minutes)
  ) at time zone v_timezone;

  insert into public.time_entries (
    organization_id,worker_id,project_id,work_type_id,
    clock_in,clock_out,status,note,source,
    entry_mode,work_date,duration_minutes,client_request_id
  ) values (
    p_organization_id,v_worker_id,p_project_id,p_work_type_id,
    v_clock_in,v_clock_in + make_interval(mins => p_duration_minutes),
    'completed',nullif(left(btrim(coalesce(p_note,'')),2000),''),
    'manual','manual',p_work_date,p_duration_minutes,p_client_request_id
  )
  returning id into v_entry_id;

  return v_entry_id;
end;
$$;

revoke all on function public.create_manual_time_entry(
  uuid,uuid,uuid,uuid,date,integer,text,uuid
) from public,anon;
grant execute on function public.create_manual_time_entry(
  uuid,uuid,uuid,uuid,date,integer,text,uuid
) to authenticated;

create or replace function public.link_time_entry_attachment(
  p_organization_id uuid,
  p_time_entry_id uuid,
  p_document_id uuid,
  p_attachment_kind text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_entry public.time_entries;
  v_document public.bynex_documents;
  v_kind text := btrim(coalesce(p_attachment_kind,'other'));
  v_link_id uuid;
begin
  if v_user_id is null
     or not private.can_access_time_entry_capture(
       p_organization_id,p_time_entry_id,v_user_id
     ) then
    raise exception 'Behörighet till tidsregistreringen saknas'
      using errcode = '42501';
  end if;
  if v_kind not in ('delivery_note','photo','receipt','other') then
    raise exception 'Bilagetypen är ogiltig' using errcode = '22023';
  end if;

  select * into v_entry
  from public.time_entries entry
  where entry.organization_id = p_organization_id
    and entry.id = p_time_entry_id;

  if v_entry.id is null then
    raise exception 'Tidsregistreringen hittades inte'
      using errcode = 'P0002';
  end if;

  select * into v_document
  from public.bynex_documents document
  where document.organization_id = p_organization_id
    and document.id = p_document_id
    and document.status not in ('pending_upload','failed','archived');

  if v_document.id is null then
    raise exception 'Bilagan är inte färdiguppladdad'
      using errcode = 'P0002';
  end if;
  if v_entry.project_id is not null
     and v_document.project_id is distinct from v_entry.project_id then
    raise exception 'Bilagan och tiden måste höra till samma projekt'
      using errcode = '23514';
  end if;

  select attachment.id into v_link_id
  from public.time_entry_attachments attachment
  where attachment.organization_id = p_organization_id
    and attachment.document_id = p_document_id;

  if v_link_id is not null then
    if not exists (
      select 1
      from public.time_entry_attachments attachment
      where attachment.organization_id = p_organization_id
        and attachment.id = v_link_id
        and attachment.time_entry_id = p_time_entry_id
    ) then
      raise exception 'Bilagan är redan kopplad till en annan tidsregistrering'
        using errcode = '23514';
    end if;
    return v_link_id;
  end if;

  insert into public.time_entry_attachments (
    organization_id,time_entry_id,project_id,document_id,
    attachment_kind,created_by_user_id
  ) values (
    p_organization_id,p_time_entry_id,v_entry.project_id,p_document_id,
    v_kind,v_user_id
  )
  returning id into v_link_id;

  return v_link_id;
end;
$$;

revoke all on function public.link_time_entry_attachment(
  uuid,uuid,uuid,text
) from public,anon;
grant execute on function public.link_time_entry_attachment(
  uuid,uuid,uuid,text
) to authenticated;

create or replace function public.register_time_delivery_note_analysis(
  p_organization_id uuid,
  p_time_entry_id uuid,
  p_document_id uuid,
  p_supplier_name text,
  p_document_number text,
  p_document_date date,
  p_total_amount numeric,
  p_confidence numeric,
  p_proposed_lines jsonb,
  p_missing_information jsonb,
  p_content_fingerprint text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_entry public.time_entries;
  v_existing_id uuid;
  v_duplicate_id uuid;
  v_analysis_id uuid;
begin
  if v_user_id is null
     or not private.can_access_time_entry_capture(
       p_organization_id,p_time_entry_id,v_user_id
     ) then
    raise exception 'Behörighet till tidsregistreringen saknas'
      using errcode = '42501';
  end if;
  if p_proposed_lines is null
     or jsonb_typeof(p_proposed_lines) <> 'array'
     or jsonb_array_length(p_proposed_lines) > 200
     or p_missing_information is null
     or jsonb_typeof(p_missing_information) <> 'array'
     or p_content_fingerprint is null
     or p_content_fingerprint !~ '^[a-f0-9]{64}$'
     or (p_total_amount is not null and p_total_amount < 0)
     or coalesce(p_confidence,0) < 0
     or coalesce(p_confidence,0) > 1 then
    raise exception 'Följesedelsanalysen är ogiltig'
      using errcode = '22023';
  end if;

  select analysis.id into v_existing_id
  from public.time_delivery_note_analyses analysis
  where analysis.organization_id = p_organization_id
    and analysis.document_id = p_document_id;
  if v_existing_id is not null then return v_existing_id; end if;

  select * into v_entry
  from public.time_entries entry
  where entry.organization_id = p_organization_id
    and entry.id = p_time_entry_id;
  if v_entry.id is null or v_entry.project_id is null then
    raise exception 'Tidsregistreringen måste vara kopplad till ett projekt'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.time_entry_attachments attachment
    where attachment.organization_id = p_organization_id
      and attachment.time_entry_id = p_time_entry_id
      and attachment.document_id = p_document_id
      and attachment.attachment_kind = 'delivery_note'
  ) then
    raise exception 'Följesedeln måste först kopplas till tidsregistreringen'
      using errcode = '23514';
  end if;

  select analysis.id into v_duplicate_id
  from public.time_delivery_note_analyses analysis
  where analysis.organization_id = p_organization_id
    and analysis.project_id = v_entry.project_id
    and analysis.content_fingerprint = p_content_fingerprint
    and analysis.status in ('proposed','applied')
  order by analysis.created_at
  limit 1;

  insert into public.time_delivery_note_analyses (
    organization_id,time_entry_id,project_id,document_id,
    supplier_name,document_number,document_date,total_amount,
    confidence,proposed_lines,missing_information,content_fingerprint,
    status,duplicate_of_analysis_id,prepared_by_user_id
  ) values (
    p_organization_id,p_time_entry_id,v_entry.project_id,p_document_id,
    nullif(left(btrim(coalesce(p_supplier_name,'')),240),''),
    nullif(left(btrim(coalesce(p_document_number,'')),160),''),
    p_document_date,p_total_amount,coalesce(p_confidence,0),
    p_proposed_lines,p_missing_information,p_content_fingerprint,
    case when v_duplicate_id is null then 'proposed' else 'duplicate' end,
    v_duplicate_id,v_user_id
  )
  returning id into v_analysis_id;

  return v_analysis_id;
end;
$$;

revoke all on function public.register_time_delivery_note_analysis(
  uuid,uuid,uuid,text,text,date,numeric,numeric,jsonb,jsonb,text
) from public,anon;
grant execute on function public.register_time_delivery_note_analysis(
  uuid,uuid,uuid,text,text,date,numeric,numeric,jsonb,jsonb,text
) to authenticated;

create or replace function private.find_or_create_organization_article(
  p_organization_id uuid,
  p_supplier_name text,
  p_article_number text,
  p_name text,
  p_unit text,
  p_source_kind text,
  p_source_document_id uuid,
  p_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_supplier_name text := nullif(left(btrim(coalesce(p_supplier_name,'')),240),'');
  v_supplier_key text := private.normalize_text_key(v_supplier_name);
  v_article_number text := nullif(left(btrim(coalesce(p_article_number,'')),160),'');
  v_name text := left(btrim(coalesce(p_name,'')),240);
  v_unit text := left(btrim(coalesce(p_unit,'st')),24);
  v_article_key text;
  v_supplier_id uuid;
  v_catalog_id uuid;
  v_article_id uuid;
begin
  if char_length(v_name) < 1 or char_length(v_unit) < 1 then
    raise exception 'Artikelns namn och enhet krävs' using errcode = '22023';
  end if;
  v_article_key := private.normalize_article_key(
    v_article_number,v_name,v_unit
  );
  if v_article_key = '' then
    raise exception 'Artikeln kunde inte identifieras' using errcode = '22023';
  end if;

  if v_supplier_name is not null then
    select supplier.id into v_supplier_id
    from public.suppliers supplier
    where supplier.organization_id = p_organization_id
      and supplier.active
      and private.normalize_text_key(supplier.name) = v_supplier_key
    order by supplier.created_at
    limit 1;
  end if;

  select article.id into v_article_id
  from public.organization_articles article
  where article.organization_id = p_organization_id
    and article.normalized_supplier_key = v_supplier_key
    and article.normalized_article_key = v_article_key
    and article.status in ('suggested','active')
  order by article.status = 'active' desc,article.created_at
  limit 1;

  if v_article_id is null and v_supplier_key <> '' then
    select article.id into v_article_id
    from public.organization_articles article
    where article.organization_id = p_organization_id
      and article.normalized_supplier_key = ''
      and article.normalized_article_key = v_article_key
      and article.status in ('suggested','active')
    order by article.status = 'active' desc,article.created_at
    limit 1;
  end if;

  if v_article_id is null and v_article_number is not null then
    select candidate.catalog_product_id into v_catalog_id
    from (
      select product.id as catalog_product_id,1 as rank
      from public.catalog_products product
      where product.active
        and (
          private.normalize_text_key(product.manufacturer_article_number)
            = private.normalize_text_key(v_article_number)
          or private.normalize_text_key(product.gtin)
            = private.normalize_text_key(v_article_number)
        )
      union all
      select merchant.catalog_product_id,2
      from public.merchant_products merchant
      where merchant.active
        and private.normalize_text_key(merchant.article_number)
          = private.normalize_text_key(v_article_number)
    ) candidate
    order by candidate.rank
    limit 1;
  end if;

  if v_article_id is null then
    begin
      insert into public.organization_articles (
        organization_id,catalog_product_id,supplier_id,supplier_name,
        normalized_supplier_key,article_number,normalized_article_key,
        name,unit,status,source_kind,source_document_id,
        created_by_user_id,approved_by_user_id,approved_at
      ) values (
        p_organization_id,v_catalog_id,v_supplier_id,v_supplier_name,
        v_supplier_key,v_article_number,v_article_key,
        v_name,v_unit,'active',
        case
          when v_catalog_id is not null then 'catalog'
          when p_source_kind in ('delivery_note','supplier_invoice')
            then p_source_kind
          else 'manual'
        end,
        p_source_document_id,p_user_id,p_user_id,now()
      )
      returning id into v_article_id;
    exception when unique_violation then
      select article.id into v_article_id
      from public.organization_articles article
      where article.organization_id = p_organization_id
        and article.normalized_supplier_key = v_supplier_key
        and article.normalized_article_key = v_article_key
        and article.status in ('suggested','active')
      order by article.status = 'active' desc,article.created_at
      limit 1;
    end;
  end if;

  return v_article_id;
end;
$$;

revoke all on function private.find_or_create_organization_article(
  uuid,text,text,text,text,text,uuid,uuid
) from public,anon,authenticated;

create or replace function public.add_time_entry_article(
  p_organization_id uuid,
  p_time_entry_id uuid,
  p_article_number text,
  p_name text,
  p_quantity numeric,
  p_unit text,
  p_unit_price_ex_vat numeric,
  p_supplier_name text,
  p_client_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_entry public.time_entries;
  v_name text := left(btrim(coalesce(p_name,'')),240);
  v_article_number text := nullif(left(btrim(coalesce(p_article_number,'')),160),'');
  v_unit text := left(btrim(coalesce(p_unit,'st')),24);
  v_supplier_name text := nullif(left(btrim(coalesce(p_supplier_name,'')),240),'');
  v_article_id uuid;
  v_material_id uuid;
  v_existing_id uuid;
  v_price numeric := coalesce(p_unit_price_ex_vat,0);
begin
  if v_user_id is null
     or not private.can_access_time_entry_capture(
       p_organization_id,p_time_entry_id,v_user_id
     ) then
    raise exception 'Behörighet till tidsregistreringen saknas'
      using errcode = '42501';
  end if;
  if p_client_request_id is null then
    raise exception 'En säker engångsnyckel krävs' using errcode = '22023';
  end if;

  select source.material_item_id into v_existing_id
  from public.material_item_sources source
  where source.organization_id = p_organization_id
    and source.source_type = 'time_article'
    and source.source_id = p_client_request_id
    and source.source_line_index = 0;
  if v_existing_id is not null then return v_existing_id; end if;

  select * into v_entry
  from public.time_entries entry
  where entry.organization_id = p_organization_id
    and entry.id = p_time_entry_id
  for update;
  if v_entry.id is null then
    raise exception 'Tidsregistreringen hittades inte' using errcode = 'P0002';
  end if;
  if v_entry.project_id is null then
    raise exception 'Välj ett projekt innan artiklar läggs till'
      using errcode = '23514';
  end if;
  if char_length(v_name) < 1
     or char_length(v_unit) < 1
     or p_quantity is null or p_quantity <= 0 or p_quantity > 1000000
     or v_price < 0 or v_price > 1000000000 then
    raise exception 'Kontrollera artikel, mängd, enhet och pris'
      using errcode = '22023';
  end if;

  v_article_id := private.find_or_create_organization_article(
    p_organization_id,v_supplier_name,v_article_number,v_name,v_unit,
    'manual',null,v_user_id
  );

  insert into public.material_items (
    organization_id,project_id,article_number,name,quantity,unit,
    needed_on,preferred_supplier,unit_price,status,stock_note,
    time_entry_id,organization_article_id,source_kind,
    reconciliation_status,created_by_user_id
  ) values (
    p_organization_id,v_entry.project_id,v_article_number,v_name,p_quantity,v_unit,
    v_entry.work_date,v_supplier_name,v_price,
    case when v_price > 0 then 'delivered' else 'delivered_unpriced' end,
    'Registrerad från tidskort',
    p_time_entry_id,v_article_id,'time_article','unmatched',v_user_id
  )
  returning id into v_material_id;

  insert into public.material_item_sources (
    organization_id,material_item_id,source_type,source_id,
    source_line_index,time_entry_id,metadata,linked_by_user_id
  ) values (
    p_organization_id,v_material_id,'time_article',p_client_request_id,
    0,p_time_entry_id,jsonb_build_object(
      'article_number',v_article_number,
      'supplier_name',v_supplier_name,
      'quantity',p_quantity,
      'unit',v_unit
    ),v_user_id
  );

  return v_material_id;
end;
$$;

revoke all on function public.add_time_entry_article(
  uuid,uuid,text,text,numeric,text,numeric,text,uuid
) from public,anon;
grant execute on function public.add_time_entry_article(
  uuid,uuid,text,text,numeric,text,numeric,text,uuid
) to authenticated;

create or replace function private.try_reconcile_material_item(
  p_organization_id uuid,
  p_material_item_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
  v_candidate_count integer := 0;
  v_invoice_id uuid;
  v_document_id uuid;
  v_line_index integer;
  v_unit_price numeric;
begin
  select
    item.id,
    item.project_id,
    item.quantity,
    item.unit_price,
    article.normalized_article_key,
    article.normalized_supplier_key
  into v_item
  from public.material_items item
  join public.organization_articles article
    on article.organization_id = item.organization_id
   and article.id = item.organization_article_id
  where item.organization_id = p_organization_id
    and item.id = p_material_item_id
    and exists (
      select 1
      from public.material_item_sources source
      where source.organization_id = item.organization_id
        and source.material_item_id = item.id
        and source.source_type = 'delivery_note'
    )
    and not exists (
      select 1
      from public.material_item_sources source
      where source.organization_id = item.organization_id
        and source.material_item_id = item.id
        and source.source_type = 'supplier_invoice'
    );

  if v_item.id is null then
    return jsonb_build_object('status','not_applicable');
  end if;

  with candidate_lines as (
    select
      invoice.id as invoice_id,
      document.id as document_id,
      (line.ordinality - 1)::integer as line_index,
      private.normalize_article_key(
        coalesce(
          line.value->>'articleNumber',
          line.value->>'article_number',
          line.value->>'sku'
        ),
        coalesce(
          line.value->>'description',
          line.value->>'name'
        ),
        coalesce(line.value->>'unit','st')
      ) as line_key,
      private.safe_numeric(
        coalesce(
          line.value->>'quantity',
          line.value->>'qty'
        )
      ) as line_quantity,
      coalesce(
        private.safe_numeric(line.value->>'unitPriceExVat'),
        private.safe_numeric(line.value->>'unit_price_ex_vat'),
        case
          when private.safe_numeric(line.value->>'lineTotalExVat') is not null
           and private.safe_numeric(coalesce(
             line.value->>'quantity',line.value->>'qty'
           )) > 0
          then private.safe_numeric(line.value->>'lineTotalExVat')
             / private.safe_numeric(coalesce(
                 line.value->>'quantity',line.value->>'qty'
               ))
          else null
        end
      ) as line_unit_price,
      private.normalize_text_key(
        coalesce(supplier.name,analysis.counterparty_name,'')
      ) as supplier_key
    from public.supplier_invoices invoice
    join public.bynex_documents document
      on document.organization_id = invoice.organization_id
     and document.supplier_invoice_id = invoice.id
    join public.bynex_document_analyses analysis
      on analysis.organization_id = document.organization_id
     and analysis.document_id = document.id
     and analysis.document_kind = 'supplier_invoice'
     and analysis.analysis_status in ('ready','needs_information')
    left join public.suppliers supplier
      on supplier.organization_id = invoice.organization_id
     and supplier.id = invoice.supplier_id
    cross join lateral jsonb_array_elements(analysis.line_items)
      with ordinality as line(value,ordinality)
    where invoice.organization_id = p_organization_id
      and invoice.project_id = v_item.project_id
      and invoice.status not in ('duplicate','rejected','failed')
      and not exists (
        select 1
        from public.material_item_sources source
        where source.organization_id = p_organization_id
          and source.source_type = 'supplier_invoice'
          and source.source_id = invoice.id
          and source.source_line_index = (line.ordinality - 1)::integer
      )
  ),
  exact_lines as (
    select candidate.*
    from candidate_lines candidate
    where candidate.line_key = v_item.normalized_article_key
      and candidate.line_quantity is not null
      and abs(candidate.line_quantity - v_item.quantity) <= 0.001
      and (
        v_item.normalized_supplier_key = ''
        or candidate.supplier_key = v_item.normalized_supplier_key
      )
      and 1 = (
        select count(*)
        from public.material_items other_item
        join public.organization_articles other_article
          on other_article.organization_id = other_item.organization_id
         and other_article.id = other_item.organization_article_id
        where other_item.organization_id = p_organization_id
          and other_item.project_id = v_item.project_id
          and other_article.normalized_article_key = candidate.line_key
          and (
            other_article.normalized_supplier_key = ''
            or candidate.supplier_key = ''
            or other_article.normalized_supplier_key = candidate.supplier_key
          )
          and abs(other_item.quantity - candidate.line_quantity) <= 0.001
          and exists (
            select 1
            from public.material_item_sources delivery_source
            where delivery_source.organization_id = other_item.organization_id
              and delivery_source.material_item_id = other_item.id
              and delivery_source.source_type = 'delivery_note'
          )
          and not exists (
            select 1
            from public.material_item_sources invoice_source
            where invoice_source.organization_id = other_item.organization_id
              and invoice_source.material_item_id = other_item.id
              and invoice_source.source_type = 'supplier_invoice'
          )
      )
  )
  select
    count(*)::integer,
    (array_agg(invoice_id))[1],
    (array_agg(document_id))[1],
    (array_agg(line_index))[1],
    (array_agg(line_unit_price))[1]
  into
    v_candidate_count,
    v_invoice_id,
    v_document_id,
    v_line_index,
    v_unit_price
  from exact_lines;

  if v_candidate_count = 1 then
    insert into public.material_item_sources (
      organization_id,material_item_id,source_type,source_id,
      source_document_id,source_line_index,metadata
    ) values (
      p_organization_id,p_material_item_id,'supplier_invoice',v_invoice_id,
      v_document_id,v_line_index,jsonb_build_object(
        'match_method','exact_article_quantity_project_supplier',
        'unit_price_ex_vat',v_unit_price
      )
    )
    on conflict do nothing;

    update public.material_items
    set unit_price = case
          when unit_price = 0 and coalesce(v_unit_price,0) > 0
            then round(v_unit_price,4)
          else unit_price
        end,
        status = case
          when status = 'delivered_unpriced'
           and (unit_price > 0 or coalesce(v_unit_price,0) > 0)
            then 'delivered'
          else status
        end,
        reconciliation_status = 'matched_supplier_invoice',
        updated_at = now()
    where organization_id = p_organization_id
      and id = p_material_item_id;

    return jsonb_build_object(
      'status','matched',
      'supplier_invoice_id',v_invoice_id,
      'line_index',v_line_index
    );
  elsif v_candidate_count > 1 then
    update public.material_items
    set reconciliation_status = 'suggested_match',updated_at = now()
    where organization_id = p_organization_id
      and id = p_material_item_id;
    return jsonb_build_object('status','ambiguous','candidates',v_candidate_count);
  end if;

  return jsonb_build_object('status','unmatched');
end;
$$;

revoke all on function private.try_reconcile_material_item(uuid,uuid)
  from public,anon,authenticated;

create or replace function public.apply_time_delivery_note_analysis(
  p_organization_id uuid,
  p_analysis_id uuid,
  p_reviewed_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_analysis public.time_delivery_note_analyses;
  v_line jsonb;
  v_line_index integer;
  v_article_number text;
  v_name text;
  v_unit text;
  v_quantity numeric;
  v_unit_price numeric;
  v_article_id uuid;
  v_material_id uuid;
  v_created integer := 0;
  v_reused integer := 0;
  v_match_result jsonb;
begin
  select * into v_analysis
  from public.time_delivery_note_analyses analysis
  where analysis.organization_id = p_organization_id
    and analysis.id = p_analysis_id
  for update;

  if v_analysis.id is null then
    raise exception 'Följesedelsanalysen hittades inte'
      using errcode = 'P0002';
  end if;
  if v_user_id is null
     or not private.can_access_time_entry_capture(
       p_organization_id,v_analysis.time_entry_id,v_user_id
     ) then
    raise exception 'Behörighet till tidsregistreringen saknas'
      using errcode = '42501';
  end if;
  if v_analysis.status = 'duplicate' then
    raise exception 'Följesedeln är redan registrerad'
      using errcode = '23514';
  end if;
  if v_analysis.status = 'rejected' then
    raise exception 'Följesedelsförslaget är avvisat'
      using errcode = '23514';
  end if;
  if v_analysis.status = 'applied' then
    select count(*)::integer into v_reused
    from public.material_item_sources source
    where source.organization_id = p_organization_id
      and source.source_type = 'delivery_note'
      and source.source_id = v_analysis.document_id;
    return jsonb_build_object(
      'analysis_id',v_analysis.id,
      'status','already_applied',
      'material_count',v_reused
    );
  end if;
  if p_reviewed_lines is null
     or jsonb_typeof(p_reviewed_lines) <> 'array'
     or jsonb_array_length(p_reviewed_lines) < 1
     or jsonb_array_length(p_reviewed_lines) > 200 then
    raise exception 'Minst en kontrollerad artikelrad krävs'
      using errcode = '22023';
  end if;

  for v_line,v_line_index in
    select value,(ordinality - 1)::integer
    from jsonb_array_elements(p_reviewed_lines)
      with ordinality as reviewed(value,ordinality)
  loop
    if coalesce((v_line->>'include')::boolean,true) is false then
      continue;
    end if;

    v_article_number := nullif(left(btrim(coalesce(
      v_line->>'articleNumber',v_line->>'article_number',''
    )),160),'');
    v_name := left(btrim(coalesce(
      v_line->>'description',v_line->>'name',''
    )),240);
    v_unit := left(btrim(coalesce(v_line->>'unit','st')),24);
    v_quantity := private.safe_numeric(coalesce(
      v_line->>'quantity',v_line->>'qty'
    ));
    v_unit_price := coalesce(
      private.safe_numeric(v_line->>'unitPriceExVat'),
      private.safe_numeric(v_line->>'unit_price_ex_vat'),
      case
        when private.safe_numeric(v_line->>'lineTotalExVat') is not null
         and v_quantity > 0
        then private.safe_numeric(v_line->>'lineTotalExVat') / v_quantity
        else 0
      end,
      0
    );

    if char_length(v_name) < 1
       or char_length(v_unit) < 1
       or v_quantity is null
       or v_quantity <= 0
       or v_quantity > 1000000
       or v_unit_price < 0
       or v_unit_price > 1000000000 then
      raise exception 'Kontrollera artikelrad %',v_line_index + 1
        using errcode = '22023';
    end if;

    select source.material_item_id into v_material_id
    from public.material_item_sources source
    where source.organization_id = p_organization_id
      and source.source_type = 'delivery_note'
      and source.source_id = v_analysis.document_id
      and source.source_line_index = v_line_index;

    if v_material_id is not null then
      v_reused := v_reused + 1;
      continue;
    end if;

    v_article_id := private.find_or_create_organization_article(
      p_organization_id,v_analysis.supplier_name,v_article_number,
      v_name,v_unit,'delivery_note',v_analysis.document_id,v_user_id
    );

    insert into public.material_items (
      organization_id,project_id,article_number,name,quantity,unit,
      needed_on,preferred_supplier,unit_price,status,stock_note,
      time_entry_id,organization_article_id,source_kind,
      reconciliation_status,created_by_user_id
    ) values (
      p_organization_id,v_analysis.project_id,v_article_number,v_name,
      v_quantity,v_unit,v_analysis.document_date,
      v_analysis.supplier_name,round(v_unit_price,4),
      case when v_unit_price > 0 then 'delivered' else 'delivered_unpriced' end,
      'Skapad från kontrollerad följesedel',
      v_analysis.time_entry_id,v_article_id,'delivery_note',
      'unmatched',v_user_id
    )
    returning id into v_material_id;

    insert into public.material_item_sources (
      organization_id,material_item_id,source_type,source_id,
      source_document_id,source_line_index,time_entry_id,
      metadata,linked_by_user_id
    ) values (
      p_organization_id,v_material_id,'delivery_note',
      v_analysis.document_id,v_analysis.document_id,v_line_index,
      v_analysis.time_entry_id,
      jsonb_build_object(
        'analysis_id',v_analysis.id,
        'supplier_name',v_analysis.supplier_name,
        'document_number',v_analysis.document_number,
        'article_number',v_article_number,
        'quantity',v_quantity,
        'unit',v_unit
      ),
      v_user_id
    );

    v_match_result := private.try_reconcile_material_item(
      p_organization_id,v_material_id
    );
    v_created := v_created + 1;
  end loop;

  update public.time_delivery_note_analyses
  set status = 'applied',
      reviewed_lines = p_reviewed_lines,
      applied_by_user_id = v_user_id,
      applied_at = now(),
      updated_at = now()
  where organization_id = p_organization_id
    and id = p_analysis_id;

  update public.bynex_documents
  set status = 'reviewed',updated_at = now()
  where organization_id = p_organization_id
    and id = v_analysis.document_id;

  return jsonb_build_object(
    'analysis_id',v_analysis.id,
    'status','applied',
    'created_material_items',v_created,
    'reused_material_items',v_reused
  );
end;
$$;

revoke all on function public.apply_time_delivery_note_analysis(
  uuid,uuid,jsonb
) from public,anon;
grant execute on function public.apply_time_delivery_note_analysis(
  uuid,uuid,jsonb
) to authenticated;

create or replace function private.reconcile_supplier_invoice_analysis()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice record;
  v_item record;
begin
  if new.document_kind <> 'supplier_invoice'
     or jsonb_typeof(new.line_items) <> 'array'
     or jsonb_array_length(new.line_items) = 0 then
    return new;
  end if;

  select invoice.organization_id,invoice.id,invoice.project_id
    into v_invoice
  from public.bynex_documents document
  join public.supplier_invoices invoice
    on invoice.organization_id = document.organization_id
   and invoice.id = document.supplier_invoice_id
  where document.organization_id = new.organization_id
    and document.id = new.document_id;

  if v_invoice.id is null or v_invoice.project_id is null then return new; end if;

  for v_item in
    select item.id
    from public.material_items item
    where item.organization_id = v_invoice.organization_id
      and item.project_id = v_invoice.project_id
      and item.reconciliation_status <> 'matched_supplier_invoice'
      and exists (
        select 1
        from public.material_item_sources source
        where source.organization_id = item.organization_id
          and source.material_item_id = item.id
          and source.source_type = 'delivery_note'
      )
  loop
    perform private.try_reconcile_material_item(
      v_invoice.organization_id,v_item.id
    );
  end loop;

  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists reconcile_supplier_invoice_analysis
  on public.bynex_document_analyses;
create trigger reconcile_supplier_invoice_analysis
after insert or update of line_items,document_kind,analysis_status
on public.bynex_document_analyses
for each row execute function private.reconcile_supplier_invoice_analysis();

create or replace function private.reconcile_supplier_invoice_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
begin
  if new.project_id is null
     or new.status in ('duplicate','rejected','failed') then
    return new;
  end if;

  for v_item in
    select item.id
    from public.material_items item
    where item.organization_id = new.organization_id
      and item.project_id = new.project_id
      and item.reconciliation_status <> 'matched_supplier_invoice'
      and exists (
        select 1
        from public.material_item_sources source
        where source.organization_id = item.organization_id
          and source.material_item_id = item.id
          and source.source_type = 'delivery_note'
      )
  loop
    perform private.try_reconcile_material_item(
      new.organization_id,v_item.id
    );
  end loop;

  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists reconcile_supplier_invoice_change
  on public.supplier_invoices;
create trigger reconcile_supplier_invoice_change
after insert or update of project_id,supplier_id,status
on public.supplier_invoices
for each row execute function private.reconcile_supplier_invoice_change();

comment on table public.organization_articles is
  'Tenant-specific article register. Delivery-note suggestions become active only after an explicit human apply action.';
comment on table public.time_entry_attachments is
  'Append-only links between a time entry and privately stored evidence such as delivery notes and photos.';
comment on table public.time_delivery_note_analyses is
  'Human-review queue for Bynex Smart delivery-note line extraction. No line creates material before explicit apply.';
comment on table public.material_item_sources is
  'Source ledger preventing the same delivery-note or supplier-invoice line from creating duplicate project material.';

select pg_notify('pgrst','reload schema');

commit;
