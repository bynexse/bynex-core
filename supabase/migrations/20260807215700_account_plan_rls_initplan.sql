begin;

-- Evaluate the platform-role predicate once per statement instead of once per
-- row. This keeps the same access boundary while avoiding auth/RLS init-plan
-- advisor warnings on large licensed catalogs.
drop policy if exists account_plan_catalogs_read
  on public.account_plan_catalogs;
create policy account_plan_catalogs_read
on public.account_plan_catalogs
for select to authenticated
using (
  status = 'active'
  or (select private.is_platform_staff(null))
);

drop policy if exists account_plan_catalog_accounts_read
  on public.account_plan_catalog_accounts;
create policy account_plan_catalog_accounts_read
on public.account_plan_catalog_accounts
for select to authenticated
using (
  exists (
    select 1
    from public.account_plan_catalogs catalog
    where catalog.id = catalog_id
      and (
        catalog.status = 'active'
        or (select private.is_platform_staff(null))
      )
  )
);

drop policy if exists account_plan_catalog_events_platform_read
  on public.account_plan_catalog_events;
create policy account_plan_catalog_events_platform_read
on public.account_plan_catalog_events
for select to authenticated
using ((select private.is_platform_staff(null)));

commit;
