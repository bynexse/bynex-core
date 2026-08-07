begin;

create or replace function public.reissue_change_order_customer_link(
  p_organization_id uuid,
  p_change_order_id uuid,
  p_valid_days integer default 14
)
returns table(
  approval_url text,
  content_hash text,
  expires_at timestamptz,
  version_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := (select auth.uid());
  v_secret text := encode(extensions.gen_random_bytes(32), 'hex');
  v_expires_at timestamptz;
  v_change_order record;
  v_version record;
begin
  if not private.has_organization_role(
    p_organization_id,
    array['owner','admin','office','manager']::text[],
    v_actor_user_id
  ) then
    raise exception 'Behörighet saknas' using errcode = '42501';
  end if;

  if p_valid_days not between 1 and 30 then
    raise exception 'Giltighetstiden måste vara 1–30 dagar' using errcode = '22023';
  end if;
  v_expires_at := now() + make_interval(days => p_valid_days);

  select
    c.id,
    c.current_version_id,
    c.status,
    c.change_order_number
  into v_change_order
  from public.change_orders c
  where c.organization_id = p_organization_id
    and c.id = p_change_order_id
  for update;

  if v_change_order.id is null then
    raise exception 'ÄTA:n hittades inte' using errcode = 'P0002';
  end if;
  if v_change_order.status <> 'awaiting_signature'
     or v_change_order.current_version_id is null then
    raise exception 'Endast en låst ÄTA som väntar på kund kan skickas om'
      using errcode = '22023';
  end if;

  select
    v.id,
    v.status,
    v.content_hash,
    v.frozen_at
  into v_version
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

  -- Tidigare oanvända länkar blir ogiltiga. Historiken behålls, men endast den
  -- nya länken kan därefter användas av kunden.
  update private.change_order_approval_tokens
  set used_at = coalesce(used_at, now())
  where organization_id = p_organization_id
    and change_order_id = p_change_order_id
    and change_order_version_id = v_version.id
    and used_at is null;

  insert into private.change_order_approval_tokens(
    organization_id,
    change_order_id,
    change_order_version_id,
    token_hash,
    expires_at,
    created_by_user_id
  ) values (
    p_organization_id,
    p_change_order_id,
    v_version.id,
    encode(extensions.digest(v_secret, 'sha256'), 'hex'),
    v_expires_at,
    v_actor_user_id
  );

  update public.change_orders
  set signature_requested_at = now(), updated_at = now()
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
    'sent_to_customer',
    v_actor_user_id,
    'user',
    jsonb_build_object(
      'reissued', true,
      'expires_at', v_expires_at,
      'content_hash', v_version.content_hash,
      'previous_links_invalidated', true
    )
  );

  return query select
    'https://bynex.se/ata/' || v_version.id::text || '.' || v_secret,
    v_version.content_hash,
    v_expires_at,
    v_version.id;
end;
$$;

revoke all on function public.reissue_change_order_customer_link(uuid, uuid, integer)
  from public, anon;
grant execute on function public.reissue_change_order_customer_link(uuid, uuid, integer)
  to authenticated;

comment on function public.reissue_change_order_customer_link(uuid, uuid, integer) is
  'Creates a new one-time customer link for the existing frozen ÄTA version, invalidates older unused links, and preserves the legal document history.';

select pg_notify('pgrst', 'reload schema');

commit;
