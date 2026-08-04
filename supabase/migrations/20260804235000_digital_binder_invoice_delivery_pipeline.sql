-- Digitalpärmen is billed by Bynex Smart. It deliberately does not inherit the
-- organization's subscription agreement or expose a customer-selectable payment
-- provider. The existing subscription_invoices pipeline cannot represent a
-- consumer payer without inventing an organization agreement and schedule, so
-- this private adapter queue feeds the same PDF, delivery and accounting workers.

create table private.bynex_billing_documents (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('digital_binder_invoice_ground')),
  source_id uuid not null,
  source_organization_id uuid not null references public.organizations(id) on delete restrict,
  payer_user_id uuid not null references auth.users(id) on delete restrict,
  issuer_entity_id uuid not null references private.billing_legal_entities(id) on delete restrict,
  invoice_number text not null check (length(invoice_number) between 1 and 60),
  invoice_date date not null,
  due_date date not null check (due_date >= invoice_date),
  service_period_starts_on date not null,
  service_period_ends_on date not null check (service_period_ends_on >= service_period_starts_on),
  currency text not null default 'SEK' check (currency = 'SEK'),
  amount_ex_vat numeric(14,2) not null check (amount_ex_vat >= 0),
  vat_amount numeric(14,2) not null check (vat_amount >= 0),
  amount_inc_vat numeric(14,2) not null check (amount_inc_vat = amount_ex_vat + vat_amount),
  payer_snapshot jsonb not null,
  subject_snapshot jsonb not null,
  issuer_snapshot jsonb not null,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'failed', 'void')),
  pdf_storage_path text,
  provider_message_id text,
  accounting_reference text,
  delivered_at timestamptz,
  accounted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_type, source_id),
  unique (issuer_entity_id, invoice_number),
  constraint bynex_billing_document_digital_binder_source_fk
    foreign key (source_id) references public.digital_binder_invoice_grounds(id) on delete restrict
);

create table private.bynex_billing_delivery_jobs (
  id uuid primary key default gen_random_uuid(),
  billing_document_id uuid not null references private.bynex_billing_documents(id) on delete restrict,
  stage text not null check (stage in ('pdf', 'delivery', 'bookkeeping')),
  adapter text not null check (length(btrim(adapter)) between 1 and 100),
  idempotency_key text not null check (length(idempotency_key) between 20 and 240),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'retry', 'completed', 'dead_letter', 'cancelled')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 8 check (max_attempts between 1 and 20),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  lock_token uuid,
  result jsonb not null default '{}'::jsonb,
  last_error_code text,
  last_error_message text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bynex_billing_delivery_jobs_document_stage_key
    unique (billing_document_id, stage),
  unique (idempotency_key),
  constraint bynex_billing_delivery_job_lock_check check (
    (status = 'processing' and locked_at is not null and locked_by is not null and lock_token is not null)
    or (status <> 'processing')
  )
);

create index bynex_billing_delivery_jobs_claim_idx
  on private.bynex_billing_delivery_jobs (stage, status, available_at, id)
  where status in ('pending', 'retry', 'processing');

revoke all on private.bynex_billing_documents from public, anon, authenticated;
revoke all on private.bynex_billing_delivery_jobs from public, anon, authenticated;

create or replace function private.queue_ready_digital_binder_billing(
  p_limit integer default 1000
)
returns table (billing_document_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  item record;
  existing_document_id uuid;
  created_document_id uuid;
  selected_invoice_number text;
  immutable_content jsonb;
begin
  if p_limit not between 1 and 5000 then
    raise exception 'Fakturaleveransbatch måste vara mellan 1 och 5000' using errcode = '22023';
  end if;

  for item in
    select ground.*, issuer.id issuer_entity_id, issuer.accounting_adapter,
      jsonb_strip_nulls(jsonb_build_object(
        'legal_name', issuer.legal_name,
        'organization_number', issuer.organization_number,
        'vat_number', issuer.vat_number,
        'address_line1', issuer.address_line1,
        'address_line2', issuer.address_line2,
        'postal_code', issuer.postal_code,
        'city', issuer.city,
        'country_code', issuer.country_code,
        'email', issuer.email,
        'phone', issuer.phone,
        'bankgiro', issuer.bankgiro,
        'plusgiro', issuer.plusgiro,
        'iban', issuer.iban,
        'bic', issuer.bic,
        'accounts_receivable_account', issuer.accounts_receivable_account,
        'revenue_account', issuer.revenue_account,
        'output_vat_account', issuer.output_vat_account
      )) issuer_snapshot
    from public.digital_binder_invoice_grounds ground
    cross join lateral (
      select entity.*
      from private.billing_legal_entities entity
      where entity.status = 'active'
        and entity.effective_from <= ground.invoice_date
        and (entity.effective_to is null or entity.effective_to >= ground.invoice_date)
      order by entity.effective_from desc, entity.id
      limit 1
    ) issuer
    where ground.status = 'ready'
      and ground.invoice_date <= current_date
    order by ground.invoice_date, ground.id
    for update of ground skip locked
    limit p_limit
  loop
    select document.id into existing_document_id
    from private.bynex_billing_documents document
    where document.source_type = 'digital_binder_invoice_ground'
      and document.source_id = item.id;

    if existing_document_id is null then
      selected_invoice_number := private.allocate_subscription_invoice_number(item.issuer_entity_id);
      immutable_content := jsonb_build_object(
        'source_type', 'digital_binder_invoice_ground',
        'source_id', item.id,
        'invoice_number', selected_invoice_number,
        'invoice_date', item.invoice_date,
        'due_date', item.due_date,
        'service_period_starts_on', item.service_period_starts_on,
        'service_period_ends_on', item.service_period_ends_on,
        'currency', item.currency,
        'amount_ex_vat_minor', item.amount_ex_vat_minor,
        'vat_minor', item.vat_minor,
        'amount_inc_vat_minor', item.amount_inc_vat_minor,
        'payer', item.payer_snapshot,
        'subject', item.property_snapshot,
        'issuer', item.issuer_snapshot
      );

      insert into private.bynex_billing_documents (
        source_type, source_id, source_organization_id, payer_user_id,
        issuer_entity_id, invoice_number, invoice_date, due_date,
        service_period_starts_on, service_period_ends_on, currency,
        amount_ex_vat, vat_amount, amount_inc_vat, payer_snapshot,
        subject_snapshot, issuer_snapshot, content_hash
      ) values (
        'digital_binder_invoice_ground', item.id, item.organization_id, item.subscriber_user_id,
        item.issuer_entity_id, selected_invoice_number, item.invoice_date, item.due_date,
        item.service_period_starts_on, item.service_period_ends_on, item.currency,
        item.amount_ex_vat_minor::numeric / 100, item.vat_minor::numeric / 100,
        item.amount_inc_vat_minor::numeric / 100, item.payer_snapshot,
        item.property_snapshot, item.issuer_snapshot,
        encode(extensions.digest(convert_to(immutable_content::text, 'utf8'), 'sha256'), 'hex')
      )
      returning id into created_document_id;
    else
      created_document_id := existing_document_id;
    end if;

    insert into private.bynex_billing_delivery_jobs (
      billing_document_id, stage, adapter, idempotency_key
    ) values
      (created_document_id, 'pdf', 'bynex_pdf_v1', item.idempotency_key || ':pdf'),
      (created_document_id, 'delivery', 'bynex_transactional_email_v1', item.idempotency_key || ':delivery'),
      (created_document_id, 'bookkeeping', item.accounting_adapter, item.idempotency_key || ':bookkeeping')
    on conflict on constraint bynex_billing_delivery_jobs_document_stage_key do nothing;

    update public.digital_binder_invoice_grounds
    set status = 'consumed',
        external_invoice_reference = (
          select document.invoice_number
          from private.bynex_billing_documents document
          where document.id = created_document_id
        ),
        consumed_at = coalesce(consumed_at, now())
    where id = item.id and status = 'ready';

    billing_document_id := created_document_id;
    return next;
  end loop;
end;
$$;

create or replace function private.claim_bynex_billing_delivery_jobs(
  p_stage text,
  p_worker_id text,
  p_limit integer default 25,
  p_lease_seconds integer default 300
)
returns table (
  job_id uuid,
  lock_token uuid,
  adapter text,
  idempotency_key text,
  payload jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_stage not in ('pdf', 'delivery', 'bookkeeping') then
    raise exception 'Okänt fakturasteg' using errcode = '22023';
  end if;
  if length(btrim(p_worker_id)) not between 1 and 120 then
    raise exception 'Worker-id måste vara 1–120 tecken' using errcode = '22023';
  end if;
  if p_limit not between 1 and 100 or p_lease_seconds not between 30 and 1800 then
    raise exception 'Ogiltig batch- eller leasetid' using errcode = '22023';
  end if;

  return query
  with candidates as (
    select job.id
    from private.bynex_billing_delivery_jobs job
    where job.stage = p_stage
      and job.attempt_count < job.max_attempts
      and (
        (job.status in ('pending', 'retry') and job.available_at <= now())
        or (job.status = 'processing' and job.locked_at < now() - make_interval(secs => p_lease_seconds))
      )
      and (
        job.stage <> 'delivery'
        or exists (
          select 1
          from private.bynex_billing_delivery_jobs prerequisite
          where prerequisite.billing_document_id = job.billing_document_id
            and prerequisite.stage = 'pdf'
            and prerequisite.status = 'completed'
        )
      )
    order by job.available_at, job.id
    for update skip locked
    limit p_limit
  ), claimed as (
    update private.bynex_billing_delivery_jobs job
    set status = 'processing',
        attempt_count = job.attempt_count + 1,
        locked_at = now(),
        locked_by = btrim(p_worker_id),
        lock_token = gen_random_uuid(),
        updated_at = now()
    from candidates
    where job.id = candidates.id
    returning job.*
  )
  select claimed.id, claimed.lock_token, claimed.adapter, claimed.idempotency_key,
    jsonb_build_object(
      'billing_document_id', document.id,
      'source_type', document.source_type,
      'source_id', document.source_id,
      'invoice_number', document.invoice_number,
      'invoice_date', document.invoice_date,
      'due_date', document.due_date,
      'service_period_starts_on', document.service_period_starts_on,
      'service_period_ends_on', document.service_period_ends_on,
      'currency', document.currency,
      'amount_ex_vat', document.amount_ex_vat,
      'vat_amount', document.vat_amount,
      'amount_inc_vat', document.amount_inc_vat,
      'payer', document.payer_snapshot,
      'subject', document.subject_snapshot,
      'issuer', document.issuer_snapshot,
      'content_hash', document.content_hash,
      'pdf_storage_path', document.pdf_storage_path
    )
  from claimed
  join private.bynex_billing_documents document on document.id = claimed.billing_document_id;
end;
$$;

create or replace function private.complete_bynex_billing_delivery_job(
  p_job_id uuid,
  p_lock_token uuid,
  p_result jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_job private.bynex_billing_delivery_jobs%rowtype;
begin
  select * into selected_job
  from private.bynex_billing_delivery_jobs
  where id = p_job_id and status = 'processing' and lock_token = p_lock_token
  for update;

  if selected_job.id is null then
    raise exception 'Jobbet saknas eller leasingen har löpt ut' using errcode = 'P0002';
  end if;

  if selected_job.stage = 'pdf' then
    if nullif(btrim(p_result->>'storage_path'), '') is null then
      raise exception 'PDF-adaptern måste returnera storage_path' using errcode = '22023';
    end if;
    update private.bynex_billing_documents
    set pdf_storage_path = p_result->>'storage_path', status = 'processing', updated_at = now()
    where id = selected_job.billing_document_id;
  elsif selected_job.stage = 'delivery' then
    if nullif(btrim(p_result->>'provider_message_id'), '') is null then
      raise exception 'Leveransadaptern måste returnera provider_message_id' using errcode = '22023';
    end if;
    update private.bynex_billing_documents
    set provider_message_id = p_result->>'provider_message_id',
        delivered_at = coalesce((p_result->>'delivered_at')::timestamptz, now()),
        updated_at = now()
    where id = selected_job.billing_document_id;
  else
    if nullif(btrim(p_result->>'accounting_reference'), '') is null then
      raise exception 'Bokföringsadaptern måste returnera accounting_reference' using errcode = '22023';
    end if;
    update private.bynex_billing_documents
    set accounting_reference = p_result->>'accounting_reference', accounted_at = now(), updated_at = now()
    where id = selected_job.billing_document_id;
  end if;

  update private.bynex_billing_delivery_jobs
  set status = 'completed', result = p_result, completed_at = now(),
      locked_at = null, locked_by = null, lock_token = null,
      last_error_code = null, last_error_message = null, updated_at = now()
  where id = selected_job.id;

  update private.bynex_billing_documents document
  set status = 'completed', updated_at = now()
  where document.id = selected_job.billing_document_id
    and not exists (
      select 1 from private.bynex_billing_delivery_jobs job
      where job.billing_document_id = document.id and job.status <> 'completed'
    );
end;
$$;

create or replace function private.fail_bynex_billing_delivery_job(
  p_job_id uuid,
  p_lock_token uuid,
  p_error_code text,
  p_error_message text,
  p_retry_after_seconds integer default 300
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_job private.bynex_billing_delivery_jobs%rowtype;
begin
  if p_retry_after_seconds not between 30 and 86400 then
    raise exception 'Retrytid måste vara 30–86400 sekunder' using errcode = '22023';
  end if;

  select * into selected_job
  from private.bynex_billing_delivery_jobs
  where id = p_job_id and status = 'processing' and lock_token = p_lock_token
  for update;

  if selected_job.id is null then
    raise exception 'Jobbet saknas eller leasingen har löpt ut' using errcode = 'P0002';
  end if;

  update private.bynex_billing_delivery_jobs
  set status = case when attempt_count >= max_attempts then 'dead_letter' else 'retry' end,
      available_at = now() + make_interval(secs => p_retry_after_seconds),
      locked_at = null, locked_by = null, lock_token = null,
      last_error_code = left(coalesce(nullif(btrim(p_error_code), ''), 'worker_error'), 120),
      last_error_message = left(coalesce(nullif(btrim(p_error_message), ''), 'Okänt workerfel'), 2000),
      updated_at = now()
  where id = selected_job.id;

  if selected_job.attempt_count >= selected_job.max_attempts then
    update private.bynex_billing_documents
    set status = 'failed', updated_at = now()
    where id = selected_job.billing_document_id;
  end if;
end;
$$;

revoke all on function private.queue_ready_digital_binder_billing(integer) from public;
revoke all on function private.claim_bynex_billing_delivery_jobs(text, text, integer, integer) from public;
revoke all on function private.complete_bynex_billing_delivery_job(uuid, uuid, jsonb) from public;
revoke all on function private.fail_bynex_billing_delivery_job(uuid, uuid, text, text, integer) from public;
grant execute on function private.queue_ready_digital_binder_billing(integer) to service_role;
grant execute on function private.claim_bynex_billing_delivery_jobs(text, text, integer, integer) to service_role;
grant execute on function private.complete_bynex_billing_delivery_job(uuid, uuid, jsonb) to service_role;
grant execute on function private.fail_bynex_billing_delivery_job(uuid, uuid, text, text, integer) to service_role;

-- PostgREST does not expose the private schema. These intentionally narrow
-- service-role-only wrappers are the worker API; browsers and signed-in users
-- receive no EXECUTE privilege.
create or replace function public.worker_queue_digital_binder_billing(
  p_limit integer default 1000
)
returns table (billing_document_id uuid)
language sql
security definer
set search_path = ''
as $$
  select * from private.queue_ready_digital_binder_billing(p_limit)
$$;

create or replace function public.worker_claim_bynex_billing_delivery_jobs(
  p_stage text,
  p_worker_id text,
  p_limit integer default 25,
  p_lease_seconds integer default 300
)
returns table (
  job_id uuid,
  lock_token uuid,
  adapter text,
  idempotency_key text,
  payload jsonb
)
language sql
security definer
set search_path = ''
as $$
  select * from private.claim_bynex_billing_delivery_jobs(
    p_stage, p_worker_id, p_limit, p_lease_seconds
  )
$$;

create or replace function public.worker_complete_bynex_billing_delivery_job(
  p_job_id uuid,
  p_lock_token uuid,
  p_result jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  select private.complete_bynex_billing_delivery_job(p_job_id, p_lock_token, p_result)
$$;

create or replace function public.worker_fail_bynex_billing_delivery_job(
  p_job_id uuid,
  p_lock_token uuid,
  p_error_code text,
  p_error_message text,
  p_retry_after_seconds integer default 300
)
returns void
language sql
security definer
set search_path = ''
as $$
  select private.fail_bynex_billing_delivery_job(
    p_job_id, p_lock_token, p_error_code, p_error_message, p_retry_after_seconds
  )
$$;

revoke all on function public.worker_queue_digital_binder_billing(integer) from public, anon, authenticated;
revoke all on function public.worker_claim_bynex_billing_delivery_jobs(text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.worker_complete_bynex_billing_delivery_job(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.worker_fail_bynex_billing_delivery_job(uuid, uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.worker_queue_digital_binder_billing(integer) to service_role;
grant execute on function public.worker_claim_bynex_billing_delivery_jobs(text, text, integer, integer) to service_role;
grant execute on function public.worker_complete_bynex_billing_delivery_job(uuid, uuid, jsonb) to service_role;
grant execute on function public.worker_fail_bynex_billing_delivery_job(uuid, uuid, text, text, integer) to service_role;

select cron.schedule(
  'bynex-smart-digital-binder-delivery',
  '25 2 * * *',
  'select private.queue_ready_digital_binder_billing(5000);'
);
