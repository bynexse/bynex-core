begin;

alter table public.organization_labor_profitability_settings
  add column billing_rate_mode text not null default 'flat_rate'
    check (billing_rate_mode in ('flat_rate','individual_rates')),
  add column default_bill_rate_ex_vat numeric(14,2) not null default 0
    check (default_bill_rate_ex_vat >= 0);

create or replace function public.platform_set_customer_labor_profitability_v2(
  p_organization_id uuid,
  p_target_margin_percent numeric,
  p_overhead_per_billable_hour numeric,
  p_rate_rounding_increment numeric,
  p_billing_rate_mode text,
  p_default_bill_rate_ex_vat numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  saved public.organization_labor_profitability_settings;
begin
  if not private.is_platform_staff(array['platform_owner','platform_admin','finance']) then
    raise exception 'Endast ägare, administration och ekonomi kan ändra lönsamhetsmålet'
      using errcode = '42501';
  end if;

  if p_target_margin_percent not between 0 and 80
     or p_overhead_per_billable_hour < 0
     or p_rate_rounding_increment not between 1 and 1000
     or p_billing_rate_mode not in ('flat_rate','individual_rates')
     or p_default_bill_rate_ex_vat < 0
  then
    raise exception 'Kontrollera marginal, timomkostnad, avrundning och prisupplägg'
      using errcode = '22023';
  end if;

  insert into public.organization_labor_profitability_settings (
    organization_id,
    target_margin_percent,
    overhead_per_billable_hour,
    rate_rounding_increment,
    billing_rate_mode,
    default_bill_rate_ex_vat,
    updated_by_user_id
  ) values (
    p_organization_id,
    p_target_margin_percent,
    p_overhead_per_billable_hour,
    p_rate_rounding_increment,
    p_billing_rate_mode,
    p_default_bill_rate_ex_vat,
    actor_user_id
  )
  on conflict (organization_id) do update set
    target_margin_percent = excluded.target_margin_percent,
    overhead_per_billable_hour = excluded.overhead_per_billable_hour,
    rate_rounding_increment = excluded.rate_rounding_increment,
    billing_rate_mode = excluded.billing_rate_mode,
    default_bill_rate_ex_vat = excluded.default_bill_rate_ex_vat,
    updated_by_user_id = excluded.updated_by_user_id,
    updated_at = now()
  returning * into saved;

  insert into public.platform_admin_audit_events (staff_user_id, action, metadata)
  values (
    actor_user_id,
    'update_customer_labor_profitability',
    jsonb_build_object(
      'organization_id', p_organization_id,
      'target_margin_percent', saved.target_margin_percent,
      'overhead_per_billable_hour', saved.overhead_per_billable_hour,
      'rate_rounding_increment', saved.rate_rounding_increment,
      'billing_rate_mode', saved.billing_rate_mode,
      'default_bill_rate_ex_vat', saved.default_bill_rate_ex_vat,
      'advisory_only', true
    )
  );

  return to_jsonb(saved) || jsonb_build_object('advisory_only', true);
end;
$$;

create or replace function public.platform_get_customer_member_workspace_v2(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  base jsonb;
  settings public.organization_labor_profitability_settings;
begin
  if not private.is_platform_staff(
    array['platform_owner','platform_admin','sales','support','finance','read_only']::text[]
  ) then
    raise exception 'Bynex HQ-behörighet krävs' using errcode = '42501';
  end if;

  select public.platform_get_customer_member_workspace(p_organization_id)
  into base;

  select * into settings
  from public.organization_labor_profitability_settings
  where organization_id = p_organization_id;

  return coalesce(base, '{}'::jsonb) || jsonb_build_object(
    'profitability_settings',
    coalesce(base -> 'profitability_settings', '{}'::jsonb) || jsonb_build_object(
      'billing_rate_mode', coalesce(settings.billing_rate_mode, 'flat_rate'),
      'default_bill_rate_ex_vat', coalesce(settings.default_bill_rate_ex_vat, 0),
      'advisory_only', true,
      'decision_owner', 'customer_company'
    )
  );
end;
$$;

revoke all on function public.platform_set_customer_labor_profitability_v2(
  uuid,numeric,numeric,numeric,text,numeric
) from public,anon;
revoke all on function public.platform_get_customer_member_workspace_v2(uuid)
  from public,anon;

grant execute on function public.platform_set_customer_labor_profitability_v2(
  uuid,numeric,numeric,numeric,text,numeric
) to authenticated;
grant execute on function public.platform_get_customer_member_workspace_v2(uuid)
  to authenticated;

select pg_notify('pgrst','reload schema');

commit;
