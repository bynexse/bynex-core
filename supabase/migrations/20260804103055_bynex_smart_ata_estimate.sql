begin;

-- Bynex Smart is the product name everywhere a customer or user sees the
-- automation. Technical table and enum names stay internal for compatibility.
update public.plan_features
set description=replace(description,'AI förbereder','Bynex Smart förbereder')
where description like '%AI förbereder%';

create or replace function private.normalize_bynex_smart_action_copy()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.title := pg_catalog.regexp_replace(
    new.title,'\mAI\M','Bynex Smart','gi'
  );
  new.summary := pg_catalog.regexp_replace(
    new.summary,'\mAI\M','Bynex Smart','gi'
  );
  return new;
end;
$$;

revoke all on function private.normalize_bynex_smart_action_copy()
  from public,anon,authenticated;
create trigger normalize_bynex_smart_action_copy
  before insert or update of title,summary on public.ai_actions
  for each row execute function private.normalize_bynex_smart_action_copy();

create or replace function private.guard_ai_action_decision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null
     and coalesce(current_setting('bynex.ai_decision_context',true),'') <> 'allowed' then
    raise exception 'Bynex Smart-förslag kan bara ändras genom beslutsfunktionen'
      using errcode='42501';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_ai_action_decision()
  from public,anon,authenticated;

-- Snapshot the preliminary onsite estimate exactly as the customer saw it.
alter table public.change_order_start_authorizations
  add column preliminary_version_id uuid,
  add column preliminary_pricing_snapshot_id uuid,
  add column estimated_price_ex_vat numeric(16,2),
  add column estimated_vat_percent numeric(6,3),
  add column estimated_vat_amount numeric(16,2),
  add column estimated_price_inc_vat numeric(16,2),
  add column estimated_labor_hours numeric(12,2),
  add column estimate_currency text,
  add column estimate_generated_at timestamptz,
  add column estimate_workflow_version text,
  add column smart_confidence numeric(5,4);

alter table public.change_order_start_authorizations
  drop constraint if exists change_order_start_authorizations_pricing_status_check;
alter table public.change_order_start_authorizations
  add constraint change_order_start_authorizations_pricing_status_check
    check (pricing_status in (
      'pending_calculation','estimate_pending_review','preagreed_rates'
    )),
  add constraint change_order_start_authorizations_preliminary_version_fkey
    foreign key (organization_id,preliminary_version_id,change_order_id)
      references public.change_order_versions(organization_id,id,change_order_id)
      on delete restrict,
  add constraint change_order_start_authorizations_preliminary_snapshot_fkey
    foreign key (organization_id,preliminary_pricing_snapshot_id)
      references public.material_pricing_snapshots(organization_id,id)
      on delete restrict,
  add constraint change_order_start_authorizations_estimate_check
    check (
      (
        pricing_status='estimate_pending_review'
        and preliminary_version_id is not null
        and estimated_price_ex_vat is not null
        and estimated_vat_percent is not null
        and estimated_vat_amount is not null
        and estimated_price_inc_vat is not null
        and estimated_labor_hours is not null
        and estimate_currency is not null
        and estimate_generated_at is not null
        and estimate_workflow_version is not null
        and estimated_price_ex_vat > 0
        and estimated_vat_percent between 0 and 100
        and estimated_vat_amount >= 0
        and estimated_price_inc_vat >= estimated_price_ex_vat
        and estimated_labor_hours >= 0
        and estimate_currency ~ '^[A-Z]{3}$'
        and abs(
          estimated_price_ex_vat+estimated_vat_amount-estimated_price_inc_vat
        ) <= 0.02
        and (smart_confidence is null or smart_confidence between 0 and 1)
      )
      or (
        pricing_status in ('pending_calculation','preagreed_rates')
        and preliminary_version_id is null
        and preliminary_pricing_snapshot_id is null
        and estimated_price_ex_vat is null
        and estimated_vat_percent is null
        and estimated_vat_amount is null
        and estimated_price_inc_vat is null
        and estimated_labor_hours is null
        and estimate_currency is null
        and estimate_generated_at is null
        and estimate_workflow_version is null
        and smart_confidence is null
      )
    ),
  add constraint change_order_start_authorizations_snapshot_requires_version_check
    check (
      preliminary_pricing_snapshot_id is null
      or preliminary_version_id is not null
    );

alter table public.change_orders
  drop constraint if exists change_orders_price_status_check;
alter table public.change_orders
  add constraint change_orders_price_status_check
    check (price_status in (
      'not_calculated','pending_calculation','estimate_pending_review',
      'reviewed','customer_approved','not_required'
    ));

create index change_order_start_authorizations_preliminary_version_idx
  on public.change_order_start_authorizations(
    organization_id,preliminary_version_id,change_order_id
  ) where preliminary_version_id is not null;
create index change_order_start_authorizations_preliminary_snapshot_idx
  on public.change_order_start_authorizations(
    organization_id,preliminary_pricing_snapshot_id
  ) where preliminary_pricing_snapshot_id is not null;

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
  preliminary_version record;
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
    select
      v.id,v.pricing_snapshot_id,v.price_ex_vat,v.vat_percent,v.vat_amount,
      v.price_inc_vat,v.labor_hours,v.currency,v.ai_confidence,v.created_at
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

revoke all on function private.authorize_change_order_start_core(
  uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,
  uuid,jsonb
) from public,anon,authenticated;

-- Backwards-compatible fallback when no onsite estimate exists yet.
create or replace function public.authorize_change_order_start_internal(
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
  p_evidence jsonb default '{}'::jsonb
)
returns table (
  start_authorization_id uuid,
  price_followup_due_at timestamptz,
  price_notice text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select
    core.result_start_authorization_id,
    core.result_price_followup_due_at,
    core.result_price_notice
  from private.authorize_change_order_start_core(
    p_actor_user_id,p_organization_id,p_change_order_id,p_intake_id,
    p_started_by_worker_id,p_method,p_scope_text,p_signer_name,
    p_signer_email,p_customer_signature_hash,p_contract_reference,
    p_emergency_reason,p_ip_hash,p_user_agent,null,p_evidence
  ) as core;
end;
$$;

revoke all on function public.authorize_change_order_start_internal(
  uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,jsonb
) from public,anon,authenticated;
grant execute on function public.authorize_change_order_start_internal(
  uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,jsonb
) to service_role;

create or replace function public.authorize_change_order_start_smart_internal(
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
  p_evidence jsonb default '{}'::jsonb
)
returns table (
  start_authorization_id uuid,
  price_followup_due_at timestamptz,
  price_notice text,
  estimated_price_ex_vat numeric,
  estimated_price_inc_vat numeric,
  pricing_status text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select
    core.result_start_authorization_id,
    core.result_price_followup_due_at,
    core.result_price_notice,
    core.result_estimated_price_ex_vat,
    core.result_estimated_price_inc_vat,
    core.result_pricing_status
  from private.authorize_change_order_start_core(
    p_actor_user_id,p_organization_id,p_change_order_id,p_intake_id,
    p_started_by_worker_id,p_method,p_scope_text,p_signer_name,
    p_signer_email,p_customer_signature_hash,p_contract_reference,
    p_emergency_reason,p_ip_hash,p_user_agent,p_preliminary_version_id,
    p_evidence
  ) as core;
end;
$$;

revoke all on function public.authorize_change_order_start_smart_internal(
  uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,uuid,jsonb
) from public,anon,authenticated;
grant execute on function public.authorize_change_order_start_smart_internal(
  uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,uuid,jsonb
) to service_role;

commit;
