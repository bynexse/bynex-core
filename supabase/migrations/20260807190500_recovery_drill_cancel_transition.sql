begin;

create or replace function public.update_platform_recovery_drill(
  p_drill_id uuid,
  p_status text,
  p_verification_result jsonb default '{}'::jsonb,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := (select auth.uid());
  v_drill public.platform_recovery_drills;
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
begin
  if v_actor_user_id is null or not private.is_platform_staff(
    array['platform_owner','platform_admin','support']::text[]
  ) then
    raise exception 'Bynex platform administration is required' using errcode = '42501';
  end if;

  if p_status not in ('planned','in_progress','verified','failed','cancelled')
    or p_verification_result is null
    or jsonb_typeof(p_verification_result) <> 'object'
    or octet_length(p_verification_result::text) > 20000
    or (v_notes is not null and char_length(v_notes) > 5000) then
    raise exception 'Recovery drill update is invalid' using errcode = '22023';
  end if;

  select * into v_drill
  from public.platform_recovery_drills drill
  where drill.id = p_drill_id
  for update;

  if v_drill.id is null then
    raise exception 'Recovery drill not found' using errcode = 'P0002';
  end if;

  if v_drill.status in ('verified','cancelled') then
    raise exception 'Completed recovery drills are immutable' using errcode = '23514';
  end if;

  if v_drill.status = 'planned' and p_status not in ('planned','in_progress','cancelled') then
    raise exception 'A planned drill must start before it can complete' using errcode = '23514';
  end if;

  if v_drill.status = 'in_progress' and p_status not in ('in_progress','verified','failed','cancelled') then
    raise exception 'Invalid recovery drill transition' using errcode = '23514';
  end if;

  if v_drill.status = 'failed' and p_status not in ('failed','in_progress','cancelled') then
    raise exception 'A failed drill must be restarted before verification' using errcode = '23514';
  end if;

  if p_status in ('verified','failed') and p_verification_result = '{}'::jsonb then
    raise exception 'Completed drills require a verification result' using errcode = '22023';
  end if;

  perform set_config('app.platform_recovery_rpc', '1', true);
  update public.platform_recovery_drills
  set status = p_status,
      started_at = case
        when p_status in ('in_progress','verified','failed','cancelled')
          then coalesce(started_at, statement_timestamp())
        else started_at
      end,
      completed_at = case
        when p_status in ('verified','failed','cancelled') then statement_timestamp()
        else null
      end,
      verified_by_user_id = case when p_status = 'verified' then v_actor_user_id else null end,
      verification_result = case
        when p_status in ('verified','failed') then p_verification_result
        when p_status = 'in_progress' then '{}'::jsonb
        else verification_result
      end,
      notes = coalesce(v_notes, notes),
      updated_at = statement_timestamp()
  where id = p_drill_id;

  insert into public.platform_recovery_events(
    drill_id,
    actor_user_id,
    event_type,
    detail
  ) values (
    p_drill_id,
    v_actor_user_id,
    'drill_status_changed',
    jsonb_build_object(
      'from', v_drill.status,
      'to', p_status,
      'verification_result', case
        when p_status in ('verified','failed') then p_verification_result
        else null
      end
    )
  );

  insert into public.platform_admin_audit_events(
    staff_user_id,
    action,
    metadata
  ) values (
    v_actor_user_id,
    'platform_recovery_drill_status_changed',
    jsonb_build_object(
      'drill_id', p_drill_id,
      'from', v_drill.status,
      'to', p_status
    )
  );

  return p_drill_id;
end;
$$;

revoke all on function public.update_platform_recovery_drill(uuid,text,jsonb,text)
  from public, anon;
grant execute on function public.update_platform_recovery_drill(uuid,text,jsonb,text)
  to authenticated;

select pg_notify('pgrst', 'reload schema');

commit;
