begin;

alter table public.bynex_documents
  drop constraint if exists bynex_documents_check6,
  add constraint bynex_documents_storage_path_check
    check (
      storage_path =
        organization_id::text || '/' || split_part(storage_path,'/',2) || '/' || original_filename
      and split_part(storage_path,'/',2) ~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    );

create or replace function private.can_access_bynex_document_object(
  object_name text,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from public.bynex_documents d
    where d.storage_path=object_name
      and private.can_access_bynex_document(d.organization_id,d.id,p_user_id)
  )
$$;

revoke all on function private.can_access_bynex_document_object(text,uuid)
  from public,anon;
grant execute on function private.can_access_bynex_document_object(text,uuid)
  to authenticated,service_role;

comment on function private.can_access_bynex_document_object(text,uuid) is
  'Authorizes a private Bynex document by its exact registered storage path. This supports system-imported supplier invoices without weakening tenant isolation.';

select pg_notify('pgrst','reload schema');

commit;
