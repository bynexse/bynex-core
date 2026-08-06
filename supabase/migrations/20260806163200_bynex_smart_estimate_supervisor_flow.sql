begin;

drop policy if exists smart_estimate_sessions_update
  on public.smart_estimate_sessions;
create policy smart_estimate_sessions_update
on public.smart_estimate_sessions
for update to authenticated
using (
  status in ('collecting','ready_for_review')
  and private.has_organization_role(
    organization_id,
    array['owner','admin','office','manager','supervisor']::text[],
    (select auth.uid())
  )
)
with check (
  status in ('collecting','ready_for_review','applied')
  and private.has_organization_role(
    organization_id,
    array['owner','admin','office','manager','supervisor']::text[],
    (select auth.uid())
  )
);

select pg_notify('pgrst','reload schema');

commit;
