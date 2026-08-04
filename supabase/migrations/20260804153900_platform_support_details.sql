create or replace function public.get_platform_support_cases()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not private.is_platform_staff(array['platform_owner', 'platform_admin', 'support', 'read_only']) then
    raise exception 'Platform support access required' using errcode = '42501';
  end if;

  insert into public.platform_admin_audit_events (staff_user_id, action)
  values ((select auth.uid()), 'view_platform_support_cases');

  select coalesce(jsonb_agg(to_jsonb(item) order by item.created_at desc), '[]'::jsonb)
  into result
  from (
    select support_case.id,
      support_case.organization_id,
      organization.name as organization_name,
      support_case.created_by_user_id,
      support_case.category,
      support_case.subject,
      support_case.description,
      support_case.priority,
      support_case.status,
      support_case.assigned_to_user_id,
      support_case.first_response_due_at,
      support_case.resolution_due_at,
      support_case.first_responded_at,
      support_case.resolved_at,
      support_case.created_at,
      support_case.updated_at
    from public.platform_support_cases support_case
    join public.organizations organization on organization.id = support_case.organization_id
    order by support_case.created_at desc
    limit 200
  ) item;

  return result;
end;
$$;

revoke all on function public.get_platform_support_cases() from public, anon;
grant execute on function public.get_platform_support_cases() to authenticated;
