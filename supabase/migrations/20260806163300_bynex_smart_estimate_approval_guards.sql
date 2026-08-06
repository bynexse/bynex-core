begin;

do $$
declare
  constraint_name text;
begin
  select con.conname
  into constraint_name
  from pg_constraint con
  where con.conrelid='public.smart_estimate_sessions'::regclass
    and con.contype='c'
    and position('estimated_price_ex_vat' in pg_get_constraintdef(con.oid)) > 0
    and position('status = ''collecting''' in pg_get_constraintdef(con.oid)) > 0
  limit 1;

  if constraint_name is not null then
    execute format(
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
      and abs(estimated_price_ex_vat + estimated_vat_amount - estimated_price_inc_vat) <= 0.02
      and customer_text is not null
    )
  );

drop policy if exists smart_estimate_sessions_update
  on public.smart_estimate_sessions;

drop policy if exists smart_estimate_sessions_management_update
  on public.smart_estimate_sessions;
create policy smart_estimate_sessions_management_update
on public.smart_estimate_sessions
for update to authenticated
using (
  status in ('collecting','ready_for_review')
  and private.has_organization_role(
    organization_id,
    array['owner','admin','office','manager']::text[],
    (select auth.uid())
  )
)
with check (
  status in ('collecting','ready_for_review','reviewed','applied','cancelled')
  and private.has_organization_role(
    organization_id,
    array['owner','admin','office','manager']::text[],
    (select auth.uid())
  )
);

drop policy if exists smart_estimate_sessions_supervisor_update
  on public.smart_estimate_sessions;
create policy smart_estimate_sessions_supervisor_update
on public.smart_estimate_sessions
for update to authenticated
using (
  status in ('collecting','ready_for_review')
  and private.has_organization_role(
    organization_id,
    array['supervisor']::text[],
    (select auth.uid())
  )
)
with check (
  status in ('collecting','ready_for_review')
  and reviewed_by_user_id is null
  and reviewed_at is null
  and applied_change_order_version_id is null
  and private.has_organization_role(
    organization_id,
    array['supervisor']::text[],
    (select auth.uid())
  )
);

create or replace function private.guard_smart_estimate_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.organization_id is distinct from old.organization_id
     or new.project_id is distinct from old.project_id
     or new.change_order_id is distinct from old.change_order_id
     or new.context_type is distinct from old.context_type
     or new.created_by_user_id is distinct from old.created_by_user_id
     or new.created_at is distinct from old.created_at
  then
    raise exception 'Kalkylsessionens identitet kan inte ändras'
      using errcode='42501';
  end if;

  if old.status in ('reviewed','applied','superseded','cancelled')
     and row(
       new.category,new.title,new.input_text,new.answers,new.questions,
       new.measured_units,new.measured_unit_label,new.estimated_labor_hours,
       new.estimated_price_low_ex_vat,new.estimated_price_ex_vat,
       new.estimated_price_high_ex_vat,new.vat_rate,new.estimated_vat_amount,
       new.estimated_price_inc_vat,new.confidence,new.explanation,
       new.customer_text,new.assumptions,new.missing_information,new.breakdown,
       new.price_sources,new.history_sample_count,new.model_source,
       new.workflow_version
     ) is distinct from row(
       old.category,old.title,old.input_text,old.answers,old.questions,
       old.measured_units,old.measured_unit_label,old.estimated_labor_hours,
       old.estimated_price_low_ex_vat,old.estimated_price_ex_vat,
       old.estimated_price_high_ex_vat,old.vat_rate,old.estimated_vat_amount,
       old.estimated_price_inc_vat,old.confidence,old.explanation,
       old.customer_text,old.assumptions,old.missing_information,old.breakdown,
       old.price_sources,old.history_sample_count,old.model_source,
       old.workflow_version
     )
  then
    raise exception 'Granskad kalkyl är låst; skapa en ny version'
      using errcode='42501';
  end if;

  if new.status='applied' then
    if old.status <> 'ready_for_review'
       or new.applied_change_order_version_id is null
       or new.reviewed_by_user_id is null
       or new.reviewed_at is null
       or new.reviewed_by_user_id is distinct from (select auth.uid())
       or not private.has_organization_role(
         new.organization_id,
         array['owner','admin','office','manager']::text[],
         (select auth.uid())
       )
       or not exists (
         select 1
         from public.change_order_versions version
         where version.organization_id=new.organization_id
           and version.id=new.applied_change_order_version_id
           and version.change_order_id=new.change_order_id
       )
    then
      raise exception 'Endast behörig granskare kan använda kalkylen i rätt ÄTA'
        using errcode='42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.guard_smart_estimate_session()
  from public,anon,authenticated;

select pg_notify('pgrst','reload schema');

commit;
