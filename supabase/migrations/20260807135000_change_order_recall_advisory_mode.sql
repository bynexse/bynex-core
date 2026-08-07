begin;

create or replace function public.recall_change_order_customer_review(
  p_organization_id uuid,
  p_change_order_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := (select auth.uid());
  v_change_order public.change_orders;
  v_version public.change_order_versions;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not private.has_organization_role(
    p_organization_id,
    array['owner','admin','office','manager']::text[],
    v_actor_user_id
  ) then
    raise exception 'Behörighet att återkalla ÄTA saknas' using errcode = '42501';
  end if;

  if char_length(v_reason) not between 5 and 1000 then
    raise exception 'Ange varför ÄTA:n återkallas' using errcode = '22023';
  end if;

  select * into v_change_order
  from public.change_orders c
  where c.organization_id = p_organization_id
    and c.id = p_change_order_id
  for update;

  if v_change_order.id is null then
    raise exception 'ÄTA:n hittades inte' using errcode = 'P0002';
  end if;
  if v_change_order.status <> 'awaiting_signature'
     or v_change_order.current_version_id is null
     or v_change_order.work_started_at is not null then
    raise exception 'Endast en låst ÄTA som väntar på kund kan återkallas'
      using errcode = '22023';
  end if;

  select * into v_version
  from public.change_order_versions v
  where v.organization_id = p_organization_id
    and v.change_order_id = p_change_order_id
    and v.id = v_change_order.current_version_id
  for update;

  if v_version.id is null
     or v_version.status <> 'customer_review'
     or v_version.frozen_at is null
     or v_version.content_hash is null then
    raise exception 'Den låsta kundversionen kunde inte verifieras'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.change_order_customer_approvals a
    where a.organization_id = p_organization_id
      and a.change_order_version_id = v_version.id
  ) then
    raise exception 'ÄTA:n har redan ett kundbeslut och kan inte återkallas'
      using errcode = '23514';
  end if;

  update private.change_order_approval_tokens
  set used_at = coalesce(used_at, statement_timestamp())
  where organization_id = p_organization_id
    and change_order_id = p_change_order_id
    and used_at is null;

  update public.change_order_versions
  set status = 'superseded', updated_at = statement_timestamp()
  where organization_id = p_organization_id
    and id = v_version.id;

  update public.change_orders
  set status = 'draft',
      current_version_id = null,
      approved_version_id = null,
      signature_requested_at = null,
      approved_at = null,
      signed_before = false,
      work_start_blocked = false,
      price_status = 'not_calculated',
      price_amount = 0,
      cost_amount = 0,
      labor_hours = 0,
      material_cost = 0,
      updated_at = statement_timestamp()
  where organization_id = p_organization_id
    and id = p_change_order_id;

  insert into public.change_order_events(
    organization_id,
    change_order_id,
    version_id,
    event_type,
    actor_user_id,
    actor_kind,
    detail
  ) values (
    p_organization_id,
    p_change_order_id,
    v_version.id,
    'recalled',
    v_actor_user_id,
    'user',
    jsonb_build_object(
      'reason', v_reason,
      'content_hash', v_version.content_hash,
      'previous_version_number', v_version.version_number,
      'customer_links_invalidated', true,
      'returned_to_draft', true,
      'work_start_mode', 'advisory'
    )
  );

  return p_change_order_id;
end;
$$;

revoke all on function public.recall_change_order_customer_review(uuid, uuid, text)
  from public, anon;
grant execute on function public.recall_change_order_customer_review(uuid, uuid, text)
  to authenticated;

select pg_notify('pgrst', 'reload schema');

commit;
