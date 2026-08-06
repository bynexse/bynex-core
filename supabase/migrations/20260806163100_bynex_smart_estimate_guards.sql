begin;

drop policy if exists smart_estimate_feedback_select
  on public.smart_estimate_feedback;
create policy smart_estimate_feedback_select
on public.smart_estimate_feedback
for select to authenticated
using (
  private.has_organization_role(
    organization_id,
    array['owner','admin','office','manager','supervisor']::text[],
    (select auth.uid())
  )
);

create or replace function private.sync_inserted_change_order_price_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not new.requires_human_review
     and new.human_reviewed_at is not null
     and new.human_reviewed_by_user_id is not null
  then
    update public.change_orders
    set price_status = case
          when price_status = 'customer_approved' then price_status
          else 'reviewed'
        end,
        price_calculated_at = new.human_reviewed_at,
        current_version_id = new.id,
        price_amount = new.price_ex_vat,
        updated_at = now()
    where organization_id = new.organization_id
      and id = new.change_order_id;

    update public.change_order_price_followups
    set status = 'ready_for_review',
        ready_at = now(),
        updated_at = now()
    where organization_id = new.organization_id
      and change_order_id = new.change_order_id
      and status in ('queued','calculating');
  end if;
  return new;
end;
$$;

revoke all on function private.sync_inserted_change_order_price_review()
  from public,anon,authenticated;

drop trigger if exists sync_inserted_change_order_price_review
  on public.change_order_versions;
create trigger sync_inserted_change_order_price_review
after insert on public.change_order_versions
for each row execute function private.sync_inserted_change_order_price_review();

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

  if new.status='applied'
     and (
       new.applied_change_order_version_id is null
       or new.reviewed_by_user_id is null
       or new.reviewed_at is null
     )
  then
    raise exception 'Använd kalkyl kräver granskare och ÄTA-version'
      using errcode='23514';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_smart_estimate_session()
  from public,anon,authenticated;

drop trigger if exists guard_smart_estimate_session
  on public.smart_estimate_sessions;
create trigger guard_smart_estimate_session
before update on public.smart_estimate_sessions
for each row execute function private.guard_smart_estimate_session();

select pg_notify('pgrst','reload schema');

commit;
