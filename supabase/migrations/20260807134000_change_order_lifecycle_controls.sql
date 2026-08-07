begin;

alter table public.change_order_events
  drop constraint if exists change_order_events_event_type_check;
alter table public.change_order_events
  add constraint change_order_events_event_type_check
  check (event_type in (
    'captured','ai_started','ai_completed','internal_reviewed',
    'sent_to_customer','opened','approved','declined','questions',
    'work_started','completed','invoiced','recalled','manual_approved'
  ));

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
      work_start_blocked = true,
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
      'returned_to_draft', true
    )
  );

  return p_change_order_id;
end;
$$;

revoke all on function public.recall_change_order_customer_review(uuid, uuid, text)
  from public, anon;
grant execute on function public.recall_change_order_customer_review(uuid, uuid, text)
  to authenticated;

create or replace function public.record_manual_change_order_approval(
  p_organization_id uuid,
  p_change_order_id uuid,
  p_signer_name text,
  p_signer_email text,
  p_decided_at timestamptz,
  p_evidence_method text,
  p_evidence_note text,
  p_evidence_reference text default null,
  p_evidence_file_id uuid default null
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
  v_approval_id uuid;
  v_signature_method text;
  v_approval_method text;
  v_signer_name text := btrim(coalesce(p_signer_name, ''));
  v_signer_email text := lower(btrim(coalesce(p_signer_email, '')));
  v_evidence_method text := btrim(coalesce(p_evidence_method, ''));
  v_evidence_note text := btrim(coalesce(p_evidence_note, ''));
  v_evidence_reference text := nullif(btrim(coalesce(p_evidence_reference, '')), '');
  v_evidence jsonb;
begin
  if not private.has_organization_role(
    p_organization_id,
    array['owner','admin','office','manager']::text[],
    v_actor_user_id
  ) then
    raise exception 'Behörighet att registrera kundgodkännande saknas'
      using errcode = '42501';
  end if;

  if char_length(v_signer_name) not between 2 and 160
     or char_length(v_evidence_note) not between 5 and 3000
     or v_evidence_method not in ('email','sms','signed_document','meeting_minutes','other')
     or p_decided_at is null
     or p_decided_at > statement_timestamp() + interval '5 minutes'
     or p_decided_at < statement_timestamp() - interval '10 years'
     or (v_signer_email <> '' and v_signer_email !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$')
     or (v_evidence_reference is not null and char_length(v_evidence_reference) > 500) then
    raise exception 'Kontrollera uppgifterna för det skriftliga godkännandet'
      using errcode = '22023';
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
    raise exception 'Endast en låst ÄTA som väntar på kund kan godkännas manuellt'
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
    raise exception 'Kundbeslut finns redan för denna ÄTA-version'
      using errcode = '23514';
  end if;

  if p_evidence_file_id is not null and not exists (
    select 1
    from public.bynex_files f
    where f.organization_id = p_organization_id
      and f.id = p_evidence_file_id
      and f.status = 'active'
  ) then
    raise exception 'Det valda bevisdokumentet hittades inte'
      using errcode = '23514';
  end if;

  v_approval_method := case when v_evidence_method = 'email' then 'email' else 'manual' end;
  v_signature_method := case
    when v_evidence_method = 'email' then 'email'
    when v_evidence_method = 'sms' then 'sms'
    else 'manual'
  end;
  v_evidence := jsonb_build_object(
    'source', 'external_written_approval',
    'evidence_method', v_evidence_method,
    'note', v_evidence_note,
    'reference', v_evidence_reference,
    'file_id', p_evidence_file_id,
    'recorded_by_user_id', v_actor_user_id,
    'recorded_at', statement_timestamp()
  );

  insert into public.change_order_customer_approvals(
    organization_id,
    change_order_id,
    change_order_version_id,
    decision,
    signer_name,
    signer_email,
    method,
    content_hash,
    approval_statement,
    customer_comment,
    decided_at,
    evidence
  ) values (
    p_organization_id,
    p_change_order_id,
    v_version.id,
    'approved',
    left(v_signer_name, 160),
    nullif(left(v_signer_email, 320), ''),
    v_approval_method,
    v_version.content_hash,
    'Kundens skriftliga godkännande utanför Bynex har kontrollerats och registrerats mot exakt låst ÄTA-version.',
    left(v_evidence_note, 3000),
    p_decided_at,
    v_evidence
  ) returning id into v_approval_id;

  insert into public.change_order_signatures(
    organization_id,
    change_order_id,
    stage,
    signer_name,
    signer_email,
    method,
    status,
    requested_at,
    signed_at,
    evidence
  ) values (
    p_organization_id,
    p_change_order_id,
    'before',
    left(v_signer_name, 160),
    nullif(left(v_signer_email, 320), ''),
    v_signature_method,
    'signed',
    coalesce(v_change_order.signature_requested_at, p_decided_at),
    p_decided_at,
    v_evidence || jsonb_build_object('approval_id', v_approval_id)
  );

  if p_evidence_file_id is not null and not exists (
    select 1
    from public.bynex_file_links l
    where l.organization_id = p_organization_id
      and l.file_id = p_evidence_file_id
      and l.scope_type = 'change_order'
      and l.scope_id = p_change_order_id
  ) then
    insert into public.bynex_file_links(
      organization_id,
      file_id,
      scope_type,
      scope_id,
      project_id,
      customer_visibility,
      created_by_user_id
    ) values (
      p_organization_id,
      p_evidence_file_id,
      'change_order',
      p_change_order_id,
      v_change_order.project_id,
      'internal',
      v_actor_user_id
    );
  end if;

  update private.change_order_approval_tokens
  set used_at = coalesce(used_at, statement_timestamp())
  where organization_id = p_organization_id
    and change_order_id = p_change_order_id
    and used_at is null;

  update public.change_order_versions
  set status = 'approved',
      approved_at = p_decided_at,
      updated_at = statement_timestamp()
  where organization_id = p_organization_id
    and id = v_version.id;

  update public.change_orders
  set current_version_id = v_version.id,
      approved_version_id = v_version.id,
      status = 'approved',
      signed_before = true,
      approved_at = p_decided_at,
      work_start_blocked = false,
      price_status = 'customer_approved',
      price_amount = coalesce(v_version.price_ex_vat, 0),
      cost_amount = coalesce(v_version.total_cost, 0),
      labor_hours = v_version.labor_hours,
      material_cost = v_version.material_cost,
      version = v_version.version_number,
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
    detail,
    occurred_at
  ) values (
    p_organization_id,
    p_change_order_id,
    v_version.id,
    'manual_approved',
    v_actor_user_id,
    'user',
    jsonb_build_object(
      'approval_id', v_approval_id,
      'signer_name', v_signer_name,
      'signer_email', nullif(v_signer_email, ''),
      'evidence_method', v_evidence_method,
      'evidence_reference', v_evidence_reference,
      'evidence_file_id', p_evidence_file_id,
      'content_hash', v_version.content_hash,
      'customer_links_invalidated', true
    ),
    p_decided_at
  );

  return v_approval_id;
end;
$$;

revoke all on function public.record_manual_change_order_approval(
  uuid, uuid, text, text, timestamptz, text, text, text, uuid
) from public, anon;
grant execute on function public.record_manual_change_order_approval(
  uuid, uuid, text, text, timestamptz, text, text, text, uuid
) to authenticated;

create or replace function public.delete_unexposed_change_order_draft(
  p_organization_id uuid,
  p_change_order_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := (select auth.uid());
  v_change_order public.change_orders;
begin
  if not private.has_organization_role(
    p_organization_id,
    array['owner','admin','office','manager']::text[],
    v_actor_user_id
  ) then
    raise exception 'Behörighet att ta bort ÄTA-utkast saknas' using errcode = '42501';
  end if;

  select * into v_change_order
  from public.change_orders c
  where c.organization_id = p_organization_id
    and c.id = p_change_order_id
  for update;

  if v_change_order.id is null then
    raise exception 'ÄTA:n hittades inte' using errcode = 'P0002';
  end if;
  if v_change_order.status <> 'draft'
     or v_change_order.work_started_at is not null
     or exists (
       select 1
       from public.change_order_versions v
       where v.organization_id = p_organization_id
         and v.change_order_id = p_change_order_id
         and v.frozen_at is not null
     )
     or exists (
       select 1
       from public.change_order_customer_approvals a
       where a.organization_id = p_organization_id
         and a.change_order_id = p_change_order_id
     ) then
    raise exception 'Endast ett aldrig kundexponerat ÄTA-utkast kan tas bort'
      using errcode = '23514';
  end if;

  delete from public.change_orders
  where organization_id = p_organization_id
    and id = p_change_order_id;

  return p_change_order_id;
end;
$$;

revoke all on function public.delete_unexposed_change_order_draft(uuid, uuid)
  from public, anon;
grant execute on function public.delete_unexposed_change_order_draft(uuid, uuid)
  to authenticated;

comment on function public.recall_change_order_customer_review(uuid, uuid, text) is
  'Invalidates all outstanding customer links, preserves the frozen version as superseded, and returns the ÄTA to a new draft workflow.';
comment on function public.record_manual_change_order_approval(uuid, uuid, text, text, timestamptz, text, text, text, uuid) is
  'Records a verified written customer approval outside Bynex against the exact frozen ÄTA version and unlocks work start.';
comment on function public.delete_unexposed_change_order_draft(uuid, uuid) is
  'Deletes only drafts that have never been frozen, sent, approved, or started.';

select pg_notify('pgrst', 'reload schema');

commit;
