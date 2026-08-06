begin;

do $$
declare
  constraint_name text;
begin
  select constraint_row.conname
  into constraint_name
  from pg_catalog.pg_constraint constraint_row
  where constraint_row.conrelid = 'public.smart_estimate_sessions'::regclass
    and constraint_row.contype = 'c'
    and pg_catalog.strpos(
      pg_catalog.pg_get_constraintdef(constraint_row.oid),
      'estimated_price_ex_vat'
    ) > 0
    and pg_catalog.strpos(
      pg_catalog.pg_get_constraintdef(constraint_row.oid),
      'status'
    ) > 0
  order by constraint_row.oid
  limit 1;

  if constraint_name is not null then
    execute pg_catalog.format(
      'alter table public.smart_estimate_sessions drop constraint %I',
      constraint_name
    );
  end if;
end;
$$;

alter table public.smart_estimate_sessions
  add constraint smart_estimate_sessions_ready_values_check
  check (
    status in ('collecting','cancelled')
    or (
      estimated_labor_hours is not null and estimated_labor_hours >= 0
      and estimated_price_low_ex_vat is not null and estimated_price_low_ex_vat >= 0
      and estimated_price_ex_vat is not null and estimated_price_ex_vat > 0
      and estimated_price_high_ex_vat is not null
      and estimated_price_high_ex_vat >= estimated_price_ex_vat
      and estimated_price_low_ex_vat <= estimated_price_ex_vat
      and estimated_vat_amount is not null and estimated_vat_amount >= 0
      and estimated_price_inc_vat is not null
      and abs(
        estimated_price_ex_vat + estimated_vat_amount
        - estimated_price_inc_vat
      ) <= 0.02
      and customer_text is not null
    )
  );

drop policy if exists smart_estimate_sessions_update
  on public.smart_estimate_sessions;

create policy smart_estimate_sessions_management_update
on public.smart_estimate_sessions
for update to authenticated
using (
  private.has_organization_role(
    organization_id,
    array['owner','admin','office','manager']::text[],
    (select auth.uid())
  )
  and status in ('collecting','ready_for_review')
)
with check (
  private.has_organization_role(
    organization_id,
    array['owner','admin','office','manager']::text[],
    (select auth.uid())
  )
  and status in ('collecting','ready_for_review','reviewed','applied')
);

create policy smart_estimate_sessions_supervisor_update
on public.smart_estimate_sessions
for update to authenticated
using (
  private.has_organization_role(
    organization_id,
    array['supervisor']::text[],
    (select auth.uid())
  )
  and status in ('collecting','ready_for_review')
)
with check (
  private.has_organization_role(
    organization_id,
    array['supervisor']::text[],
    (select auth.uid())
  )
  and status in ('collecting','ready_for_review')
);

create or replace function private.guard_smart_estimate_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if old.organization_id <> new.organization_id
       or old.project_id <> new.project_id
       or old.change_order_id is distinct from new.change_order_id
       or old.context_type <> new.context_type
       or old.created_by_user_id <> new.created_by_user_id
       or old.created_at <> new.created_at then
      raise exception 'Smart-kalkylens identitet kan inte ändras'
        using errcode = '42501';
    end if;

    if old.status in ('reviewed','applied','superseded','cancelled') then
      raise exception 'Låst Smart-kalkyl kan inte ändras'
        using errcode = '42501';
    end if;

    if new.status = 'applied' then
      if old.status <> 'ready_for_review'
         or new.reviewed_by_user_id is distinct from (select auth.uid())
         or new.reviewed_at is null
         or new.applied_change_order_version_id is null
         or not private.has_organization_role(
           new.organization_id,
           array['owner','admin','office','manager']::text[],
           (select auth.uid())
         ) then
        raise exception 'Endast behörig granskare får tillämpa Smart-kalkylen'
          using errcode = '42501';
      end if;

      if not exists (
        select 1
        from public.change_order_versions version
        where version.organization_id = new.organization_id
          and version.id = new.applied_change_order_version_id
          and version.change_order_id = new.change_order_id
          and version.human_reviewed_by_user_id = (select auth.uid())
          and version.human_reviewed_at is not null
          and not version.requires_human_review
      ) then
        raise exception 'Den granskade ÄTA-versionen matchar inte Smart-kalkylen'
          using errcode = '23514';
      end if;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.guard_smart_estimate_session()
  from public,anon,authenticated;

select pg_notify('pgrst','reload schema');

commit;
