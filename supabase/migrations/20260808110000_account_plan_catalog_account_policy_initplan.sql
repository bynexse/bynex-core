begin;

-- Hoist the platform-staff check outside the per-row catalog lookup so
-- PostgreSQL can evaluate it once as an init plan for large licensed catalogs.
drop policy if exists account_plan_catalog_accounts_read
  on public.account_plan_catalog_accounts;
create policy account_plan_catalog_accounts_read
on public.account_plan_catalog_accounts
for select to authenticated
using (
  (select private.is_platform_staff(null))
  or exists (
    select 1
    from public.account_plan_catalogs catalog
    where catalog.id = account_plan_catalog_accounts.catalog_id
      and catalog.status = 'active'
  )
);

commit;
