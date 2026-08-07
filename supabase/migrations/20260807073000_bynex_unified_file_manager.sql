begin;

create table public.bynex_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  storage_bucket text not null default 'bynex-files' check (storage_bucket = 'bynex-files'),
  storage_path text not null,
  original_filename text not null,
  title text not null,
  description text,
  category text not null default 'document' check (category in (
    'photo','drawing','document','receipt','warranty','protocol','manual','invoice','video','audio','other'
  )),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes between 1 and 52428800),
  checksum_sha256 text not null check (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  status text not null default 'uploading' check (status in ('uploading','active','archived','failed')),
  uploaded_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, storage_path),
  check (char_length(btrim(original_filename)) between 1 and 240),
  check (char_length(btrim(title)) between 1 and 240),
  check (description is null or char_length(btrim(description)) between 1 and 4000),
  check (char_length(storage_path) between 80 and 500),
  check (char_length(btrim(mime_type)) between 3 and 160)
);

create table public.bynex_file_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  file_id uuid not null,
  scope_type text not null check (scope_type in (
    'general','project','quote','change_order','bookkeeping','invoice','asset','property'
  )),
  scope_id uuid,
  project_id uuid,
  customer_visibility text not null default 'internal' check (customer_visibility in ('internal','review','published')),
  customer_published_by_user_id uuid references auth.users(id) on delete set null,
  customer_published_at timestamptz,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, file_id)
    references public.bynex_files (organization_id, id) on delete cascade,
  foreign key (organization_id, project_id)
    references public.projects (organization_id, id) on delete cascade,
  check ((scope_type = 'general' and scope_id is null) or (scope_type <> 'general' and scope_id is not null)),
  check ((customer_visibility = 'published' and project_id is not null and customer_published_by_user_id is not null and customer_published_at is not null)
    or (customer_visibility <> 'published' and customer_published_at is null)),
  check (scope_type in ('project','quote','change_order','invoice','asset','property') or customer_visibility = 'internal')
);

create unique index bynex_file_links_unique_scope
  on public.bynex_file_links (
    organization_id,
    file_id,
    scope_type,
    coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
create index bynex_files_org_status_created_idx
  on public.bynex_files (organization_id, status, created_at desc);
create index bynex_files_org_category_created_idx
  on public.bynex_files (organization_id, category, created_at desc);
create index bynex_file_links_org_scope_idx
  on public.bynex_file_links (organization_id, scope_type, scope_id, created_at desc);
create index bynex_file_links_portal_idx
  on public.bynex_file_links (organization_id, project_id, customer_visibility, created_at desc)
  where customer_visibility = 'published';

create trigger bynex_files_set_updated_at
before update on public.bynex_files
for each row execute function public.set_updated_at();

create trigger bynex_file_links_set_updated_at
before update on public.bynex_file_links
for each row execute function public.set_updated_at();

alter table public.bynex_files enable row level security;
alter table public.bynex_files force row level security;
alter table public.bynex_file_links enable row level security;
alter table public.bynex_file_links force row level security;

create or replace function private.can_manage_bynex_files(
  requested_organization_id uuid,
  requested_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_organization_role(
    requested_organization_id,
    array['owner','admin','office','manager','supervisor']::text[],
    requested_user_id
  )
$$;

create or replace function private.can_view_bynex_file(
  requested_organization_id uuid,
  requested_file_id uuid,
  requested_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.can_manage_bynex_files(requested_organization_id, requested_user_id)
    or exists (
      select 1
      from public.bynex_file_links file_link
      join public.project_portal_members portal_member
        on portal_member.organization_id = file_link.organization_id
       and portal_member.project_id = file_link.project_id
       and portal_member.user_id = requested_user_id
       and portal_member.status = 'active'
       and portal_member.can_view_documents
      join public.project_portal_settings portal_setting
        on portal_setting.organization_id = file_link.organization_id
       and portal_setting.project_id = file_link.project_id
       and portal_setting.enabled
       and portal_setting.share_documents
      where file_link.organization_id = requested_organization_id
        and file_link.file_id = requested_file_id
        and file_link.customer_visibility = 'published'
    )
$$;

revoke all on function private.can_manage_bynex_files(uuid, uuid) from public, anon;
revoke all on function private.can_view_bynex_file(uuid, uuid, uuid) from public, anon;
grant execute on function private.can_manage_bynex_files(uuid, uuid) to authenticated;
grant execute on function private.can_view_bynex_file(uuid, uuid, uuid) to authenticated;

create policy bynex_files_select
on public.bynex_files
for select to authenticated
using (private.can_view_bynex_file(organization_id, id, (select auth.uid())));

create policy bynex_files_insert
on public.bynex_files
for insert to authenticated
with check (
  uploaded_by_user_id = (select auth.uid())
  and private.can_manage_bynex_files(organization_id, (select auth.uid()))
);

create policy bynex_files_update
on public.bynex_files
for update to authenticated
using (private.can_manage_bynex_files(organization_id, (select auth.uid())))
with check (private.can_manage_bynex_files(organization_id, (select auth.uid())));

create policy bynex_file_links_select
on public.bynex_file_links
for select to authenticated
using (private.can_view_bynex_file(organization_id, file_id, (select auth.uid())));

create policy bynex_file_links_insert
on public.bynex_file_links
for insert to authenticated
with check (
  created_by_user_id = (select auth.uid())
  and private.can_manage_bynex_files(organization_id, (select auth.uid()))
);

create policy bynex_file_links_update
on public.bynex_file_links
for update to authenticated
using (private.can_manage_bynex_files(organization_id, (select auth.uid())))
with check (private.can_manage_bynex_files(organization_id, (select auth.uid())));

revoke all on public.bynex_files, public.bynex_file_links from public, anon, authenticated;
grant select, insert, update on public.bynex_files, public.bynex_file_links to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'bynex-files',
  'bynex-files',
  false,
  52428800,
  array[
    'application/pdf',
    'image/jpeg','image/png','image/webp','image/heic',
    'video/mp4','audio/mpeg','audio/mp4','audio/wav',
    'text/plain','text/csv','application/xml','text/xml',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.bynex_file_object_identity(object_name text)
returns table (organization_id uuid, file_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  path_parts text[] := string_to_array(object_name, '/');
begin
  if cardinality(path_parts) <> 3 then
    return;
  end if;
  begin
    organization_id := path_parts[1]::uuid;
    file_id := path_parts[2]::uuid;
  exception when invalid_text_representation then
    return;
  end;
  return next;
end;
$$;

create or replace function private.can_manage_bynex_file_object(
  object_name text,
  requested_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.bynex_file_object_identity(object_name) identity
    join public.bynex_files file
      on file.organization_id = identity.organization_id
     and file.id = identity.file_id
     and file.storage_path = object_name
    where private.can_manage_bynex_files(identity.organization_id, requested_user_id)
  )
$$;

create or replace function private.can_access_bynex_file_object(
  object_name text,
  requested_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.bynex_file_object_identity(object_name) identity
    join public.bynex_files file
      on file.organization_id = identity.organization_id
     and file.id = identity.file_id
     and file.storage_path = object_name
     and file.status = 'active'
    where private.can_view_bynex_file(identity.organization_id, identity.file_id, requested_user_id)
  )
$$;

revoke all on function private.bynex_file_object_identity(text) from public, anon;
revoke all on function private.can_manage_bynex_file_object(text, uuid) from public, anon;
revoke all on function private.can_access_bynex_file_object(text, uuid) from public, anon;
grant execute on function private.bynex_file_object_identity(text) to authenticated;
grant execute on function private.can_manage_bynex_file_object(text, uuid) to authenticated;
grant execute on function private.can_access_bynex_file_object(text, uuid) to authenticated;

drop policy if exists bynex_files_storage_select on storage.objects;
create policy bynex_files_storage_select
on storage.objects for select to authenticated
using (
  bucket_id = 'bynex-files'
  and private.can_access_bynex_file_object(name, (select auth.uid()))
);

drop policy if exists bynex_files_storage_insert on storage.objects;
create policy bynex_files_storage_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'bynex-files'
  and private.can_manage_bynex_file_object(name, (select auth.uid()))
);

drop policy if exists bynex_files_storage_update on storage.objects;
create policy bynex_files_storage_update
on storage.objects for update to authenticated
using (
  bucket_id = 'bynex-files'
  and private.can_manage_bynex_file_object(name, (select auth.uid()))
)
with check (
  bucket_id = 'bynex-files'
  and private.can_manage_bynex_file_object(name, (select auth.uid()))
);

drop policy if exists bynex_files_storage_delete on storage.objects;
create policy bynex_files_storage_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'bynex-files'
  and private.can_manage_bynex_file_object(name, (select auth.uid()))
);

create trigger bynex_files_write_audit_log
after insert or update on public.bynex_files
for each row execute function private.write_audit_log();

create trigger bynex_file_links_write_audit_log
after insert or update on public.bynex_file_links
for each row execute function private.write_audit_log();

comment on table public.bynex_files is
  'Tenant-isolated private file metadata used by Bynex Filer. Objects remain private and are opened through short-lived signed URLs.';
comment on table public.bynex_file_links is
  'Polymorphic links from a Bynex file to a business object. Customer visibility is explicit and project-scoped.';

select pg_notify('pgrst', 'reload schema');

commit;
