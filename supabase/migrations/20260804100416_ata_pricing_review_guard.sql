begin;

alter table public.change_order_versions
  add column price_type text not null default 'estimated',
  add column price_disclaimer text default
    'Priset är uppskattat och kan avvika vid ändrade förutsättningar. Om omfattningen ändras begär vi ett nytt godkännande innan merarbete påbörjas.',
  add column human_reviewed_by_user_id uuid references auth.users(id) on delete set null,
  add column human_reviewed_at timestamptz;

alter table public.change_order_versions
  add constraint change_order_versions_price_type_check
    check (price_type in ('fixed','estimated','running_account')),
  add constraint change_order_versions_price_disclaimer_check
    check (
      (price_type = 'fixed' and price_disclaimer is null)
      or (
        price_type in ('estimated','running_account')
        and char_length(btrim(price_disclaimer)) between 20 and 1000
      )
    ),
  add constraint change_order_versions_human_review_check
    check (
      (requires_human_review and human_reviewed_at is null and human_reviewed_by_user_id is null)
      or (
        not requires_human_review
        and human_reviewed_at is not null
        and human_reviewed_by_user_id is not null
      )
    );

create or replace function public.review_change_order_version(
  p_organization_id uuid,
  p_version_id uuid,
  p_price_type text,
  p_price_disclaimer text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  resolved_disclaimer text;
begin
  if not private.has_organization_role(
    p_organization_id,
    array['owner','admin','office','manager']::text[],
    (select auth.uid())
  ) then
    raise exception 'Not allowed to review ÄTA pricing' using errcode = '42501';
  end if;

  resolved_disclaimer := case p_price_type
    when 'fixed' then null
    when 'estimated' then coalesce(
      nullif(btrim(p_price_disclaimer),''),
      'Priset är uppskattat och kan avvika vid ändrade förutsättningar. Om omfattningen ändras begär vi ett nytt godkännande innan merarbete påbörjas.'
    )
    when 'running_account' then coalesce(
      nullif(btrim(p_price_disclaimer),''),
      'Arbetet debiteras enligt angivna priser och faktiskt utfall. Den uppskattade totalsumman kan avvika; väsentliga avvikelser kommuniceras för godkännande.'
    )
    else null
  end;

  if p_price_type not in ('fixed','estimated','running_account')
     or (resolved_disclaimer is not null and char_length(resolved_disclaimer) not between 20 and 1000) then
    raise exception 'Invalid ÄTA price type or disclaimer' using errcode = '22023';
  end if;

  update public.change_order_versions
    set price_type = p_price_type,
        price_disclaimer = resolved_disclaimer,
        requires_human_review = false,
        human_reviewed_by_user_id = (select auth.uid()),
        human_reviewed_at = now(),
        status = 'internal_review',
        updated_at = now()
  where organization_id = p_organization_id
    and id = p_version_id
    and frozen_at is null
    and status in ('draft','internal_review');

  if not found then
    raise exception 'ÄTA version cannot be reviewed' using errcode = 'P0002';
  end if;
  return p_version_id;
end;
$$;

revoke all on function public.review_change_order_version(uuid,uuid,text,text)
  from public,anon;
grant execute on function public.review_change_order_version(uuid,uuid,text,text)
  to authenticated;

create or replace function private.guard_change_order_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.frozen_at is not null and row(
    new.id,new.organization_id,new.change_order_id,new.version_number,
    new.title,new.customer_description,new.internal_notes,new.currency,new.vat_percent,
    new.labor_hours,new.labor_cost,new.labor_sell,new.material_cost,new.material_sell,
    new.equipment_cost,new.equipment_sell,new.subcontractor_cost,new.subcontractor_sell,
    new.other_cost,new.other_sell,new.estimated_working_days,new.proposed_start_date,
    new.proposed_end_date,new.assumptions,new.exclusions,new.ai_confidence,
    new.requires_human_review,new.price_type,new.price_disclaimer,
    new.human_reviewed_by_user_id,new.human_reviewed_at,new.content_hash,new.frozen_at,
    new.created_by_user_id,new.created_at
  ) is distinct from row(
    old.id,old.organization_id,old.change_order_id,old.version_number,
    old.title,old.customer_description,old.internal_notes,old.currency,old.vat_percent,
    old.labor_hours,old.labor_cost,old.labor_sell,old.material_cost,old.material_sell,
    old.equipment_cost,old.equipment_sell,old.subcontractor_cost,old.subcontractor_sell,
    old.other_cost,old.other_sell,old.estimated_working_days,old.proposed_start_date,
    old.proposed_end_date,old.assumptions,old.exclusions,old.ai_confidence,
    old.requires_human_review,old.price_type,old.price_disclaimer,
    old.human_reviewed_by_user_id,old.human_reviewed_at,old.content_hash,old.frozen_at,
    old.created_by_user_id,old.created_at
  ) then
    raise exception 'Frozen ÄTA version cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_change_order_version() from public,anon,authenticated;

create or replace function public.create_change_order_approval_link_internal(
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_change_order_id uuid,
  p_version_id uuid,
  p_expires_at timestamptz
)
returns table(approval_url text,content_hash text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret_value text := encode(extensions.gen_random_bytes(32),'hex');
  payload jsonb;
  hash_value text;
  selected_version record;
begin
  if not private.has_organization_role(
    p_organization_id,
    array['owner','admin','office','manager']::text[],
    p_actor_user_id
  ) then
    raise exception 'Not allowed to send ÄTA approval' using errcode = '42501';
  end if;
  if p_expires_at <= now() or p_expires_at > now() + interval '90 days' then
    raise exception 'Invalid approval expiry' using errcode = '22023';
  end if;

  select v.* into selected_version
  from public.change_order_versions v
  where v.organization_id = p_organization_id
    and v.change_order_id = p_change_order_id
    and v.id = p_version_id
    and v.status = 'internal_review'
    and v.frozen_at is null
    and not v.requires_human_review
    and v.human_reviewed_at is not null
    and v.human_reviewed_by_user_id is not null
  for update;
  if selected_version.id is null then
    raise exception 'Human review is required before ÄTA can be sent'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
    'version',to_jsonb(selected_version)
      - array[
          'internal_notes','ai_confidence','requires_human_review','content_hash',
          'frozen_at','approved_at','created_by_user_id','created_at','updated_at',
          'human_reviewed_by_user_id','human_reviewed_at',
          'labor_cost','material_cost','equipment_cost','subcontractor_cost',
          'other_cost','total_cost','margin_amount','margin_percent'
        ],
    'lines',coalesce((
      select jsonb_agg(
        to_jsonb(li) - array[
          'unit_cost','cost_amount','source','source_reference','created_at','updated_at'
        ]
        order by li.sort_order,li.id
      )
      from public.change_order_line_items li
      where li.organization_id = p_organization_id
        and li.change_order_version_id = p_version_id
    ),'[]'::jsonb)
  ) into payload;
  hash_value := encode(extensions.digest(convert_to(payload::text,'UTF8'),'sha256'),'hex');

  update public.change_order_versions
    set status = 'customer_review',content_hash = hash_value,frozen_at = now(),updated_at = now()
    where organization_id = p_organization_id and id = p_version_id;

  update public.change_orders
    set current_version_id = p_version_id,status = 'awaiting_signature',
        signature_requested_at = now(),work_start_blocked = true,updated_at = now()
    where organization_id = p_organization_id and id = p_change_order_id;

  insert into private.change_order_approval_tokens(
    organization_id,change_order_id,change_order_version_id,token_hash,
    expires_at,created_by_user_id
  ) values (
    p_organization_id,p_change_order_id,p_version_id,
    encode(extensions.digest(secret_value,'sha256'),'hex'),
    p_expires_at,p_actor_user_id
  );

  insert into public.change_order_events(
    organization_id,change_order_id,version_id,event_type,actor_user_id,actor_kind,detail
  ) values (
    p_organization_id,p_change_order_id,p_version_id,'sent_to_customer',
    p_actor_user_id,'user',
    jsonb_build_object(
      'expires_at',p_expires_at,'content_hash',hash_value,
      'price_type',selected_version.price_type,
      'has_disclaimer',selected_version.price_disclaimer is not null
    )
  );

  return query select
    'https://app.bynex.se/ata/godkann/' || p_version_id::text || '.' || secret_value,
    hash_value;
end;
$$;

revoke all on function public.create_change_order_approval_link_internal(uuid,uuid,uuid,uuid,timestamptz)
  from public,anon,authenticated;
grant execute on function public.create_change_order_approval_link_internal(uuid,uuid,uuid,uuid,timestamptz)
  to service_role;

create index change_order_versions_review_queue_idx
  on public.change_order_versions(organization_id,status,created_at)
  where requires_human_review and frozen_at is null;

commit;
