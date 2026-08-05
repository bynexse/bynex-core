-- Organization-owned defaults for future quote, invoice and time-report
-- document renderers. Logos remain in a private bucket; only the scoped path
-- is stored here. This migration does not claim or implement PDF rendering.

create table if not exists public.organization_document_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  website text check (website is null or (length(website) between 8 and 300 and website ~ '^https://')),
  registered_office_municipality text check (
    registered_office_municipality is null
    or length(btrim(registered_office_municipality)) between 2 and 120
  ),
  logo_bucket text not null default 'organization-branding' check (logo_bucket = 'organization-branding'),
  logo_storage_path text,
  default_quote_validity_days integer not null default 30
    check (default_quote_validity_days between 1 and 180),
  quote_footer text not null default '' check (length(quote_footer) <= 2000),
  time_report_footer text not null default '' check (length(time_report_footer) <= 2000),
  changed_by_user_id uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_document_settings_logo_path_check check (
    logo_storage_path is null
    or (
      length(logo_storage_path) between 45 and 90
      and logo_storage_path ~ ('^' || organization_id::text || '/logo\.(png|jpg|jpeg|webp)$')
      and logo_storage_path !~ '(^|/)\.\.(/|$)'
    )
  )
);

alter table public.organization_document_settings enable row level security;
alter table public.organization_document_settings force row level security;

drop policy if exists organization_document_settings_admin_select
  on public.organization_document_settings;
create policy organization_document_settings_admin_select
on public.organization_document_settings for select to authenticated
using ((select private.has_organization_role(
  organization_id,
  array['owner', 'admin'],
  (select auth.uid())
)));

drop policy if exists organization_document_settings_admin_insert
  on public.organization_document_settings;
create policy organization_document_settings_admin_insert
on public.organization_document_settings for insert to authenticated
with check (
  changed_by_user_id = (select auth.uid())
  and (select private.has_organization_role(
    organization_id,
    array['owner', 'admin'],
    (select auth.uid())
  ))
);

drop policy if exists organization_document_settings_admin_update
  on public.organization_document_settings;
create policy organization_document_settings_admin_update
on public.organization_document_settings for update to authenticated
using ((select private.has_organization_role(
  organization_id,
  array['owner', 'admin'],
  (select auth.uid())
)))
with check (
  changed_by_user_id = (select auth.uid())
  and (select private.has_organization_role(
    organization_id,
    array['owner', 'admin'],
    (select auth.uid())
  ))
);

revoke all on public.organization_document_settings from anon, authenticated;
grant select, insert, update on public.organization_document_settings to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'organization-branding',
  'organization-branding',
  false,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.can_manage_organization_branding_object(
  object_name text,
  requested_user_id uuid default auth.uid()
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  path_parts text[] := string_to_array(object_name, '/');
  path_organization_id uuid;
begin
  if cardinality(path_parts) <> 2
     or lower(path_parts[2]) !~ '^logo\.(png|jpg|jpeg|webp)$' then
    return false;
  end if;
  begin
    path_organization_id := path_parts[1]::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  return private.has_organization_role(
    path_organization_id,
    array['owner', 'admin'],
    requested_user_id
  );
end;
$$;

revoke all on function private.can_manage_organization_branding_object(text, uuid) from public;
grant execute on function private.can_manage_organization_branding_object(text, uuid) to authenticated;

drop policy if exists organization_branding_select on storage.objects;
create policy organization_branding_select on storage.objects
for select to authenticated
using (
  bucket_id = 'organization-branding'
  and (select private.can_manage_organization_branding_object(name, (select auth.uid())))
);

drop policy if exists organization_branding_insert on storage.objects;
create policy organization_branding_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'organization-branding'
  and (select private.can_manage_organization_branding_object(name, (select auth.uid())))
);

drop policy if exists organization_branding_update on storage.objects;
create policy organization_branding_update on storage.objects
for update to authenticated
using (
  bucket_id = 'organization-branding'
  and (select private.can_manage_organization_branding_object(name, (select auth.uid())))
)
with check (
  bucket_id = 'organization-branding'
  and (select private.can_manage_organization_branding_object(name, (select auth.uid())))
);

drop policy if exists organization_branding_delete on storage.objects;
create policy organization_branding_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'organization-branding'
  and (select private.can_manage_organization_branding_object(name, (select auth.uid())))
);

comment on column public.organization_document_settings.logo_storage_path is
  'Private organization-branding path scoped to organization_id/logo.ext. Never a public URL.';
comment on table public.organization_document_settings is
  'Defaults consumed by future document renderers; does not itself generate PDFs.';
