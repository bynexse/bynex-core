begin;

create or replace function private.authorize_change_order_start_core(
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_change_order_id uuid,
  p_intake_id uuid,
  p_started_by_worker_id uuid,
  p_method text,
  p_scope_text text,
  p_signer_name text,
  p_signer_email text,
  p_customer_signature_hash text,
  p_contract_reference text,
  p_emergency_reason text,
  p_ip_hash text,
  p_user_agent text,
  p_preliminary_version_id uuid,
  p_evidence jsonb
)
returns table (
  result_start_authorization_id uuid,
  result_price_followup_due_at timestamptz,
  result_price_notice text,
  result_estimated_price_ex_vat numeric,
  result_estimated_price_inc_vat numeric,
  result_pricing_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_change record;
  selected_settings record;
  preliminary_version public.change_order_versions%rowtype;
  snapshot_algorithm_version text;
  snapshot_calculated_at timestamptz;
  authorization_id uuid;
  followup_due timestamptz;
  notice_text text;
  statement_text text;
  price_display text;
  authorization_pricing_status text;
  change_price_status text;
  estimate_version text;
  estimate_time timestamptz;
  content_hash_value text;
  actor_is_management boolean;
  has_preliminary_estimate boolean := false;
begin
  select c.organization_id,c.project_id,c.status,c.start_authorization_id
    into selected_change
  from public.change_orders c
  where c.organization_id=p_organization_id and c.id=p_change_order_id
  for update;
  if selected_change.organization_id is null then
    raise exception 'ÄTA hittades inte' using errcode='P0002';
  end if;
  if selected_change.start_authorization_id is not null then
    raise exception 'ÄTA-arbetet har redan startats' using errcode='23505';
  end if;

  select * into selected_settings
  from public.change_order_workflow_settings s
  where s.organization_id=p_organization_id and s.active;
  if selected_settings.id is null
     or not selected_settings.allow_onsite_price_pending_start then
    raise exception 'Start med preliminärt eller väntande pris är avstängt'
      using errcode='42501';
  end if;

  actor_is_management := private.has_organization_role(
    p_organization_id,
    array['owner','admin','office','manager','supervisor']::text[],
    p_actor_user_id
  );
  if not private.can_work_on_project(
    p_organization_id,selected_change.project_id,p_actor_user_id
  ) then
    raise exception 'Användaren är inte tilldelad projektet' using errcode='42501';
  end if;
  if p_started_by_worker_id is not null
     and not (
       private.is_own_worker(
         p_organization_id,p_started_by_worker_id,p_actor_user_id
       )
       or actor_is_management
     ) then
    raise exception 'Ogiltig utförare för arbetsstarten' using errcode='42501';
  end if;
  if char_length(btrim(coalesce(p_scope_text,''))) not between 3 and 5000 then
    raise exception 'ÄTA-beskrivning krävs' using errcode='22023';
  end if;
  if p_intake_id is not null and not exists (
    select 1 from public.change_order_intakes i
    where i.organization_id=p_organization_id
      and i.change_order_id=p_change_order_id
      and i.id=p_intake_id
  ) then
    raise exception 'ÄTA-underlaget hittades inte' using errcode='22023';
  end if;

  if p_method in ('onsite_customer','secure_link') then
    if selected_settings.require_customer_start_signature
       and (
         char_length(btrim(coalesce(p_signer_name,''))) < 2
         or char_length(coalesce(p_customer_signature_hash,'')) < 32
       ) then
      raise exception 'Kundens startsignatur krävs' using errcode='22023';
    end if;
  elsif p_method='contract_preapproval' then
    if not selected_settings.allow_contract_preapproval
       or not actor_is_management
       or char_length(btrim(coalesce(p_contract_reference,''))) < 3 then
      raise exception 'Giltigt förhandsgodkännande i avtal krävs'
        using errcode='42501';
    end if;
  elsif p_method='emergency' then
    if not selected_settings.allow_emergency_start
       or not actor_is_management
       or char_length(btrim(coalesce(p_emergency_reason,''))) < 10 then
      raise exception 'Akutstart är inte tillåten' using errcode='42501';
    end if;
  else
    raise exception 'Okänd metod för startgodkännande' using errcode='22023';
  end if;

  if p_preliminary_version_id is not null then
    select v.*
    into preliminary_version
    from public.change_order_versions v
    where v.organization_id=p_organization_id
      and v.change_order_id=p_change_order_id
      and v.id=p_preliminary_version_id
      and v.status in ('draft','internal_review')
      and v.frozen_at is null
      and v.requires_human_review
      and v.price_type='estimated'
    for share;
    if not found or preliminary_version.price_ex_vat <= 0 then
      raise exception 'Giltig preliminär Bynex Smart-kalkyl saknas'
        using errcode='22023';
    end if;

    if preliminary_version.pricing_snapshot_id is not null then
      select s.algorithm_version,s.calculated_at
        into snapshot_algorithm_version,snapshot_calculated_at
      from public.material_pricing_snapshots s
      where s.organization_id=p_organization_id
        and s.id=preliminary_version.pricing_snapshot_id
        and s.context_type='change_order'
        and s.change_order_id=p_change_order_id
        and s.status='complete';
      if not found then
        raise exception 'Materialprisunderlaget är inte komplett'
          using errcode='22023';
      end if;
    end if;

    has_preliminary_estimate := true;
    authorization_pricing_status := 'estimate_pending_review';
    change_price_status := 'estimate_pending_review';
    estimate_version := coalesce(
      snapshot_algorithm_version,'bynex-smart-ata-v1'
    );
    estimate_time := coalesce(
      snapshot_calculated_at,preliminary_version.created_at,now()
    );
    price_display := replace(
      to_char(preliminary_version.price_ex_vat,'FM999999999990D00'),'.',','
    );
    notice_text :=
      'Bynex Smart har beräknat ett uppskattat pris på plats: '
      || price_display
      || ' kr exkl. moms. Priset är preliminärt och kan avvika. '
      || 'Behörig personal granskar och uppdaterar priset.';
    statement_text :=
      'Jag godkänner att det beskrivna ÄTA-arbetet startar nu utifrån det '
      || 'preliminära uppskattade priset. Jag förstår att priset kan avvika '
      || 'och att behörig personal granskar och uppdaterar priset.';
  else
    authorization_pricing_status := case
      when p_method='contract_preapproval' then 'preagreed_rates'
      else 'pending_calculation'
    end;
    change_price_status := 'pending_calculation';
    notice_text :=
      'Arbetet får starta nu. Priset beräknas och uppdateras senare när '
      || 'behörig personal har granskat tid, material och övriga kostnader. '
      || 'Ändrad omfattning kräver ett nytt godkännande.';
    statement_text :=
      'Jag godkänner att det beskrivna ÄTA-arbetet startar nu och förstår '
      || 'att priset beräknas, granskas och meddelas senare av behörig personal.';
  end if;

  followup_due := now()+make_interval(
    hours=>selected_settings.price_review_sla_hours
  );
  content_hash_value := encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'change_order_id',p_change_order_id,
          'scope',btrim(p_scope_text),
          'method',p_method,
          'price_notice',notice_text,
          'statement',statement_text,
          'pricing_status',authorization_pricing_status,
          'preliminary_version_id',p_preliminary_version_id,
          'preliminary_pricing_snapshot_id',
            case when has_preliminary_estimate
              then preliminary_version.pricing_snapshot_id end,
          'estimated_price_ex_vat',case when has_preliminary_estimate
            then preliminary_version.price_ex_vat end,
          'estimated_vat_amount',case when has_preliminary_estimate
            then preliminary_version.vat_amount end,
          'estimated_price_inc_vat',case when has_preliminary_estimate
            then preliminary_version.price_inc_vat end,
          'estimated_labor_hours',case when has_preliminary_estimate
            then preliminary_version.labor_hours end,
          'estimate_currency',case when has_preliminary_estimate
            then preliminary_version.currency end,
          'estimate_workflow_version',estimate_version,
          'signer_name',nullif(btrim(p_signer_name),''),
          'contract_reference',nullif(btrim(p_contract_reference),''),
          'emergency_reason',nullif(btrim(p_emergency_reason),'')
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  insert into public.change_order_start_authorizations(
    organization_id,change_order_id,project_id,intake_id,started_by_worker_id,
    authorization_method,scope_text,pricing_status,price_notice,
    authorization_statement,signer_name,signer_email,customer_signature_hash,
    contract_reference,emergency_reason,scope_content_hash,
    authorized_by_user_id,ip_hash,user_agent,evidence,
    preliminary_version_id,preliminary_pricing_snapshot_id,
    estimated_price_ex_vat,estimated_vat_percent,estimated_vat_amount,
    estimated_price_inc_vat,estimated_labor_hours,estimate_currency,
    estimate_generated_at,estimate_workflow_version,smart_confidence
  ) values (
    p_organization_id,p_change_order_id,selected_change.project_id,p_intake_id,
    p_started_by_worker_id,p_method,btrim(p_scope_text),
    authorization_pricing_status,notice_text,statement_text,
    nullif(left(btrim(p_signer_name),160),''),
    nullif(left(lower(btrim(p_signer_email)),320),''),
    nullif(left(p_customer_signature_hash,256),''),
    nullif(left(btrim(p_contract_reference),500),''),
    nullif(left(btrim(p_emergency_reason),2000),''),
    content_hash_value,p_actor_user_id,left(p_ip_hash,128),
    left(p_user_agent,500),coalesce(p_evidence,'{}'::jsonb),
    case when has_preliminary_estimate then preliminary_version.id end,
    case when has_preliminary_estimate
      then preliminary_version.pricing_snapshot_id end,
    case when has_preliminary_estimate
      then preliminary_version.price_ex_vat end,
    case when has_preliminary_estimate
      then preliminary_version.vat_percent end,
    case when has_preliminary_estimate
      then preliminary_version.vat_amount end,
    case when has_preliminary_estimate
      then preliminary_version.price_inc_vat end,
    case when has_preliminary_estimate
      then preliminary_version.labor_hours end,
    case when has_preliminary_estimate
      then preliminary_version.currency end,
    case when has_preliminary_estimate then estimate_time end,
    case when has_preliminary_estimate then estimate_version end,
    case when has_preliminary_estimate
      then preliminary_version.ai_confidence end
  ) returning id into authorization_id;

  update public.change_orders
  set start_authorization_id=authorization_id,
      work_started_at=now(),
      work_started_by_worker_id=p_started_by_worker_id,
      price_status=change_price_status,
      price_followup_due_at=followup_due,
      status='in_progress',
      work_start_blocked=false,
      updated_at=now()
  where organization_id=p_organization_id and id=p_change_order_id;

  insert into public.change_order_price_followups(
    organization_id,change_order_id,start_authorization_id,priority,due_at
  ) values (
    p_organization_id,p_change_order_id,authorization_id,'high',followup_due
  );

  insert into public.change_order_events(
    organization_id,change_order_id,version_id,event_type,
    actor_user_id,actor_kind,detail
  ) values (
    p_organization_id,p_change_order_id,
    case when has_preliminary_estimate then preliminary_version.id end,
    'work_started',p_actor_user_id,'user',
    jsonb_build_object(
      'start_authorization_id',authorization_id,
      'method',p_method,
      'calculation_label',case when has_preliminary_estimate
        then 'Bynex Smart' else null end,
      'pricing_status',authorization_pricing_status,
      'estimated_price_ex_vat',case when has_preliminary_estimate
        then preliminary_version.price_ex_vat end,
      'price_followup_due_at',followup_due
    )
  );

  return query select
    authorization_id,followup_due,notice_text,
    case when has_preliminary_estimate
      then preliminary_version.price_ex_vat end,
    case when has_preliminary_estimate
      then preliminary_version.price_inc_vat end,
    authorization_pricing_status;
end;
$$;

commit;
