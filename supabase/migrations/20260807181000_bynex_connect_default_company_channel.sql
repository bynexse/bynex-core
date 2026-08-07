begin;

create or replace function public.ensure_default_connect_channel(
  p_organization_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_channel_id uuid;
begin
  if v_user_id is null
     or not private.is_organization_member(p_organization_id, v_user_id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_organization_id::text || ':bynex-connect-company', 0)
  );

  select c.id
  into v_channel_id
  from public.channels c
  where c.organization_id = p_organization_id
    and c.channel_type = 'company'
    and c.project_id is null
    and c.active
  order by c.created_at, c.id
  limit 1;

  if v_channel_id is null then
    insert into public.channels(
      organization_id,
      project_id,
      name,
      channel_type,
      active
    ) values (
      p_organization_id,
      null,
      'Hela företaget',
      'company',
      true
    )
    returning id into v_channel_id;
  end if;

  return v_channel_id;
end;
$$;

revoke all on function public.ensure_default_connect_channel(uuid)
  from public, anon;
grant execute on function public.ensure_default_connect_channel(uuid)
  to authenticated;

comment on function public.ensure_default_connect_channel(uuid) is
  'Returns the active company-wide Bynex Connect channel, creating it once for an authenticated organization member when missing.';

select pg_notify('pgrst', 'reload schema');

commit;
