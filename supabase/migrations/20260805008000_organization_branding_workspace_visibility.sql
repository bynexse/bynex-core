-- Every active member may see the active organization's brand in the Bynex
-- workspace. Only owner/admin may still upload, replace or delete the logo.

drop policy if exists organization_document_settings_admin_select
  on public.organization_document_settings;
drop policy if exists organization_document_settings_member_select
  on public.organization_document_settings;
create policy organization_document_settings_member_select
on public.organization_document_settings for select to authenticated
using ((select private.has_organization_role(
  organization_id,
  array[
    'owner','admin','office','hr','payroll','manager','supervisor','employee','contractor'
  ]::text[],
  (select auth.uid())
)));

create or replace function private.can_view_organization_branding_object(
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
    array[
      'owner','admin','office','hr','payroll','manager','supervisor','employee','contractor'
    ]::text[],
    requested_user_id
  );
end;
$$;

revoke all on function private.can_view_organization_branding_object(text, uuid) from public;
grant execute on function private.can_view_organization_branding_object(text, uuid) to authenticated;

drop policy if exists organization_branding_select on storage.objects;
create policy organization_branding_select on storage.objects
for select to authenticated
using (
  bucket_id = 'organization-branding'
  and (select private.can_view_organization_branding_object(name, (select auth.uid())))
);

comment on function private.can_view_organization_branding_object(text, uuid) is
  'Allows active members to view only the logo stored below their own organization UUID.';
