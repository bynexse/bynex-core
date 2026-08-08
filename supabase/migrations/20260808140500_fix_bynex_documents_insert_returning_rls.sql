begin;

-- INSERT ... RETURNING also evaluates the table's SELECT policy. The previous
-- policy delegated the complete decision to a helper that queried the same
-- table, so the just-created row was not visible during RETURNING and uploads
-- such as approved SIE imports failed before private storage was reached.
--
-- Keep the same access model, but evaluate the current row directly. The
-- helper remains in use for storage-object access after the document exists.
drop policy if exists bynex_documents_member_select
  on public.bynex_documents;

create policy bynex_documents_member_select
on public.bynex_documents
for select to authenticated
using (
  uploaded_by_user_id = (select auth.uid())
  or (
    context_type in ('bookkeeping','supplier_invoice','customer_invoice')
    and private.has_organization_role(
      organization_id,
      array['owner','admin','office','manager']::text[],
      (select auth.uid())
    )
  )
  or (
    context_type not in ('bookkeeping','supplier_invoice','customer_invoice')
    and private.has_organization_role(
      organization_id,
      array['owner','admin','office','manager','supervisor']::text[],
      (select auth.uid())
    )
  )
  or (
    context_type in ('project','change_order','customer_portal','general')
    and private.is_organization_member(
      organization_id,
      (select auth.uid())
    )
    and (
      project_id is null
      or private.can_work_on_project(
        organization_id,
        project_id,
        (select auth.uid())
      )
    )
  )
);

commit;
