begin;

create or replace function public.platform_get_customer_member_workspace_v3(
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
  enriched_members jsonb;
begin
  if not private.is_platform_staff(
    array['platform_owner','platform_admin','sales','support','finance','read_only']::text[]
  ) then
    raise exception 'Bynex HQ-behörighet krävs' using errcode = '42501';
  end if;

  select public.platform_get_customer_member_workspace_v2(p_organization_id)
  into base;

  select * into settings
  from public.organization_labor_profitability_settings
  where organization_id = p_organization_id;

  select coalesce(jsonb_agg(
    member_value || jsonb_build_object(
      'selected_bill_rate_ex_vat',
        case
          when settings.billing_rate_mode = 'flat_rate'
            then nullif(settings.default_bill_rate_ex_vat, 0)
          else nullif((member_value ->> 'current_bill_rate')::numeric, 0)
        end,
      'selected_rate_source',
        case
          when settings.billing_rate_mode = 'flat_rate' then 'company_flat_rate'
          else 'individual_rate'
        end,
      'selected_margin_percent',
        case
          when coalesce((member_value ->> 'direct_cost_per_hour')::numeric, 0) <= 0
            then member_value -> 'current_margin_percent'
          when settings.billing_rate_mode = 'flat_rate'
               and settings.default_bill_rate_ex_vat > 0
            then to_jsonb(round(
              (
                1 - (
                  (member_value ->> 'direct_cost_per_hour')::numeric
                  + settings.overhead_per_billable_hour
                ) / settings.default_bill_rate_ex_vat
              ) * 100,
              1
            ))
          when settings.billing_rate_mode = 'individual_rates'
               and coalesce((member_value ->> 'current_bill_rate')::numeric, 0) > 0
            then member_value -> 'current_margin_percent'
          else 'null'::jsonb
        end,
      'recommendation_is_advisory', true
    ) order by lower(coalesce(member_value ->> 'full_name', member_value ->> 'email', ''))
  ), '[]'::jsonb)
  into enriched_members
  from jsonb_array_elements(coalesce(base -> 'members', '[]'::jsonb)) member_value;

  return jsonb_set(
    coalesce(base, '{}'::jsonb),
    '{members}',
    enriched_members,
    true
  );
end;
$$;

revoke all on function public.platform_get_customer_member_workspace_v3(uuid)
  from public,anon;
grant execute on function public.platform_get_customer_member_workspace_v3(uuid)
  to authenticated;

select pg_notify('pgrst','reload schema');

commit;
