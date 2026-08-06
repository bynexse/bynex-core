begin;

alter table public.subscription_invoices
  add column pdf_checksum_sha256 text,
  add column pdf_generated_at timestamptz;

alter table public.subscription_invoices
  add constraint subscription_invoices_pdf_checksum_check check (
    pdf_checksum_sha256 is null or pdf_checksum_sha256 ~ '^[0-9a-f]{64}$'
  ),
  add constraint subscription_invoices_pdf_pair_check check (
    (pdf_storage_path is null) = (pdf_checksum_sha256 is null)
    and (pdf_storage_path is null) = (pdf_generated_at is null)
  );

alter table public.subscription_invoice_delivery_jobs
  add column lock_token uuid,
  add column lease_expires_at timestamptz,
  add column provider_response_at timestamptz,
  add column dead_lettered_at timestamptz;

create index subscription_invoice_delivery_jobs_claim_idx
  on public.subscription_invoice_delivery_jobs (next_attempt_at, created_at)
  where status in ('pending','retry','processing');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'subscription-invoice-pdfs',
  'subscription-invoice-pdfs',
  false,
  10485760,
  array['application/pdf']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists subscription_invoice_pdf_platform_read on storage.objects;
create policy subscription_invoice_pdf_platform_read
on storage.objects for select
to authenticated
using (
  bucket_id = 'subscription-invoice-pdfs'
  and private.is_platform_staff(array[
    'platform_owner','platform_admin','sales','support','finance','read_only'
  ]::text[])
);

create or replace function public.worker_claim_subscription_invoice_delivery_jobs(
  p_worker_id text,
  p_limit integer default 25,
  p_lease_seconds integer default 300
)
returns table (
  job_id uuid,
  lock_token uuid,
  idempotency_key text,
  channel text,
  payload jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  item record;
  new_lock uuid;
begin
  if p_worker_id is null or char_length(btrim(p_worker_id)) not between 3 and 200 then
    raise exception 'Invalid worker id' using errcode = '22023';
  end if;
  if p_limit not between 1 and 100 or p_lease_seconds not between 30 and 900 then
    raise exception 'Invalid claim limits' using errcode = '22023';
  end if;

  for item in
    select job.id
    from public.subscription_invoice_delivery_jobs job
    join public.subscription_invoices invoice
      on invoice.organization_id = job.organization_id
      and invoice.id = job.invoice_id
    where (
      (job.status in ('pending','retry') and job.next_attempt_at <= now())
      or (job.status = 'processing' and job.lease_expires_at < now())
    )
      and invoice.status <> 'void'
    order by job.next_attempt_at, job.created_at
    for update of job skip locked
    limit p_limit
  loop
    new_lock := gen_random_uuid();
    update public.subscription_invoice_delivery_jobs job
    set status = 'processing',
        attempt_count = job.attempt_count + 1,
        locked_at = now(),
        locked_by = btrim(p_worker_id),
        lock_token = new_lock,
        lease_expires_at = now() + make_interval(secs => p_lease_seconds),
        updated_at = now()
    where job.id = item.id;

    return query
    select job.id,
      new_lock,
      job.idempotency_key,
      job.channel,
      jsonb_build_object(
        'job_id', job.id,
        'organization_id', job.organization_id,
        'invoice_id', invoice.id,
        'invoice', to_jsonb(invoice),
        'lines', coalesce((
          select jsonb_agg(to_jsonb(line) order by line.line_number)
          from public.subscription_invoice_lines line
          where line.organization_id = job.organization_id
            and line.invoice_id = job.invoice_id
        ), '[]'::jsonb)
      )
    from public.subscription_invoice_delivery_jobs job
    join public.subscription_invoices invoice
      on invoice.organization_id = job.organization_id
      and invoice.id = job.invoice_id
    where job.id = item.id;
  end loop;
end;
$$;

create or replace function public.worker_record_subscription_invoice_pdf(
  p_job_id uuid,
  p_lock_token uuid,
  p_storage_path text,
  p_checksum_sha256 text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  job public.subscription_invoice_delivery_jobs;
begin
  select * into job
  from public.subscription_invoice_delivery_jobs candidate
  where candidate.id = p_job_id
    and candidate.status = 'processing'
    and candidate.lock_token = p_lock_token
    and candidate.lease_expires_at >= now()
  for update;
  if job.id is null then
    raise exception 'Delivery lock is invalid or expired' using errcode = '42501';
  end if;
  if p_checksum_sha256 !~ '^[0-9a-f]{64}$'
    or p_storage_path is null
    or p_storage_path not like job.organization_id::text || '/' || job.invoice_id::text || '/%' then
    raise exception 'Invalid PDF evidence' using errcode = '22023';
  end if;

  update public.subscription_invoices
  set pdf_storage_path = p_storage_path,
      pdf_checksum_sha256 = p_checksum_sha256,
      pdf_generated_at = coalesce(pdf_generated_at, now()),
      updated_at = now()
  where organization_id = job.organization_id
    and id = job.invoice_id
    and (pdf_checksum_sha256 is null or pdf_checksum_sha256 = p_checksum_sha256);
  if not found then
    raise exception 'Another PDF version is already locked' using errcode = '23505';
  end if;
end;
$$;

create or replace function public.worker_complete_subscription_invoice_delivery_job(
  p_job_id uuid,
  p_lock_token uuid,
  p_provider_message_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  job record;
  completed_at timestamptz := now();
begin
  select candidate.*, invoice.pdf_storage_path, invoice.pdf_checksum_sha256,
    invoice.schedule_id, invoice.document_type
  into job
  from public.subscription_invoice_delivery_jobs candidate
  join public.subscription_invoices invoice
    on invoice.organization_id = candidate.organization_id
    and invoice.id = candidate.invoice_id
  where candidate.id = p_job_id
    and candidate.status = 'processing'
    and candidate.lock_token = p_lock_token
    and candidate.lease_expires_at >= now()
  for update of candidate;
  if job.id is null then
    raise exception 'Delivery lock is invalid or expired' using errcode = '42501';
  end if;
  if job.pdf_storage_path is null or job.pdf_checksum_sha256 is null then
    raise exception 'Verified PDF is missing' using errcode = '23514';
  end if;
  if p_provider_message_id is null
    or char_length(btrim(p_provider_message_id)) not between 3 and 300 then
    raise exception 'Provider message id is required' using errcode = '23514';
  end if;

  update public.subscription_invoice_delivery_jobs
  set status = 'sent',
      provider_message_id = btrim(p_provider_message_id),
      provider_response_at = completed_at,
      sent_at = completed_at,
      locked_at = null,
      locked_by = null,
      lock_token = null,
      lease_expires_at = null,
      last_error_code = null,
      last_error_message = null,
      updated_at = completed_at
  where id = job.id;

  update public.subscription_invoices
  set status = case when status = 'queued' then 'sent' else status end,
      provider_message_id = btrim(p_provider_message_id),
      sent_at = coalesce(sent_at, completed_at),
      updated_at = completed_at
  where organization_id = job.organization_id
    and id = job.invoice_id
    and status <> 'void';

  if job.schedule_id is not null then
    update public.subscription_invoice_schedule
    set status = 'issued',
        updated_at = completed_at
    where id = job.schedule_id
      and status = 'invoice_queued';
  end if;
end;
$$;

create or replace function public.worker_fail_subscription_invoice_delivery_job(
  p_job_id uuid,
  p_lock_token uuid,
  p_error_code text,
  p_error_message text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  job public.subscription_invoice_delivery_jobs;
  terminal boolean;
  delay_seconds integer;
begin
  select * into job
  from public.subscription_invoice_delivery_jobs candidate
  where candidate.id = p_job_id
    and candidate.status = 'processing'
    and candidate.lock_token = p_lock_token
  for update;
  if job.id is null then
    raise exception 'Delivery lock is invalid' using errcode = '42501';
  end if;

  terminal := job.attempt_count >= 8;
  delay_seconds := least(
    3600,
    (power(2, greatest(job.attempt_count - 1, 0)) * 60)::integer
  );

  update public.subscription_invoice_delivery_jobs
  set status = case when terminal then 'failed' else 'retry' end,
      next_attempt_at = case
        when terminal then next_attempt_at
        else now() + make_interval(secs => delay_seconds)
      end,
      last_error_code = left(coalesce(nullif(btrim(p_error_code), ''), 'delivery_error'), 100),
      last_error_message = left(coalesce(nullif(btrim(p_error_message), ''), 'Unknown delivery error'), 1000),
      dead_lettered_at = case when terminal then now() else null end,
      locked_at = null,
      locked_by = null,
      lock_token = null,
      lease_expires_at = null,
      updated_at = now()
  where id = job.id;
end;
$$;

revoke all on function public.worker_claim_subscription_invoice_delivery_jobs(text,integer,integer)
  from public, anon, authenticated;
revoke all on function public.worker_record_subscription_invoice_pdf(uuid,uuid,text,text)
  from public, anon, authenticated;
revoke all on function public.worker_complete_subscription_invoice_delivery_job(uuid,uuid,text)
  from public, anon, authenticated;
revoke all on function public.worker_fail_subscription_invoice_delivery_job(uuid,uuid,text,text)
  from public, anon, authenticated;

grant execute on function public.worker_claim_subscription_invoice_delivery_jobs(text,integer,integer)
  to service_role;
grant execute on function public.worker_record_subscription_invoice_pdf(uuid,uuid,text,text)
  to service_role;
grant execute on function public.worker_complete_subscription_invoice_delivery_job(uuid,uuid,text)
  to service_role;
grant execute on function public.worker_fail_subscription_invoice_delivery_job(uuid,uuid,text,text)
  to service_role;

commit;
