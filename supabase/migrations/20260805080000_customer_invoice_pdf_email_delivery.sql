-- Production-grade customer invoice PDF and email delivery foundation.
-- External delivery is performed by a server-only worker. Database state is
-- advanced only after a real PDF hash or provider message id is supplied.

alter table public.customer_invoices
  add column if not exists pdf_checksum_sha256 text,
  add column if not exists pdf_generated_at timestamptz;

alter table public.customer_invoices
  drop constraint if exists customer_invoices_pdf_checksum_sha256_check,
  add constraint customer_invoices_pdf_checksum_sha256_check
    check (pdf_checksum_sha256 is null or pdf_checksum_sha256 ~ '^[0-9a-f]{64}$'),
  drop constraint if exists customer_invoices_pdf_pair_check,
  add constraint customer_invoices_pdf_pair_check
    check ((pdf_storage_path is null) = (pdf_checksum_sha256 is null)
      and (pdf_storage_path is null) = (pdf_generated_at is null));

alter table public.customer_invoice_delivery_jobs
  add column if not exists lock_token uuid,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists provider_response_at timestamptz,
  add column if not exists dead_lettered_at timestamptz;

create index if not exists customer_invoice_delivery_jobs_claim_idx
  on public.customer_invoice_delivery_jobs(next_attempt_at, created_at)
  where status in ('pending', 'retry');

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'customer-invoice-pdfs',
  'customer-invoice-pdfs',
  false,
  10485760,
  array['application/pdf']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists customer_invoice_pdf_finance_read on storage.objects;
create policy customer_invoice_pdf_finance_read
on storage.objects for select
to authenticated
using (
  bucket_id = 'customer-invoice-pdfs'
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and private.has_organization_role(
    ((storage.foldername(name))[1])::uuid,
    array['owner','admin','office']::text[],
    (select auth.uid())
  )
);

create or replace function public.worker_claim_customer_invoice_delivery_jobs(
  p_worker_id text,
  p_limit integer default 25,
  p_lease_seconds integer default 300
)
returns table(
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
declare item record;
declare new_lock uuid;
begin
  if p_worker_id is null or char_length(trim(p_worker_id)) not between 3 and 200 then
    raise exception 'Ogiltigt worker-id' using errcode = '22023';
  end if;
  if p_limit not between 1 and 100 or p_lease_seconds not between 30 and 900 then
    raise exception 'Ogiltig kögräns eller låstid' using errcode = '22023';
  end if;

  for item in
    select j.id
    from public.customer_invoice_delivery_jobs j
    join public.customer_invoices i
      on i.organization_id = j.organization_id and i.id = j.invoice_id
    where j.channel in ('email', 'pdf')
      and (
        (j.status in ('pending', 'retry') and j.next_attempt_at <= now())
        or (j.status = 'processing' and j.lease_expires_at < now())
      )
      and i.status not in ('draft', 'void')
    order by j.next_attempt_at, j.created_at
    for update of j skip locked
    limit p_limit
  loop
    new_lock := gen_random_uuid();
    update public.customer_invoice_delivery_jobs j set
      status = 'processing',
      attempt_count = j.attempt_count + 1,
      locked_at = now(),
      locked_by = trim(p_worker_id),
      lock_token = new_lock,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      updated_at = now()
    where j.id = item.id;

    return query
    select
      j.id,
      new_lock,
      j.idempotency_key,
      j.channel,
      jsonb_build_object(
        'job_id', j.id,
        'organization_id', j.organization_id,
        'invoice_id', i.id,
        'invoice', to_jsonb(i) - 'contains_sensitive_identity',
        'lines', coalesce((
          select jsonb_agg(to_jsonb(l) order by l.line_number)
          from public.customer_invoice_lines l
          where l.organization_id = j.organization_id and l.invoice_id = j.invoice_id
        ), '[]'::jsonb)
      )
    from public.customer_invoice_delivery_jobs j
    join public.customer_invoices i
      on i.organization_id = j.organization_id and i.id = j.invoice_id
    where j.id = item.id;
  end loop;
end;
$$;

create or replace function public.worker_record_customer_invoice_pdf(
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
declare job record;
begin
  select * into job
  from public.customer_invoice_delivery_jobs j
  where j.id = p_job_id and j.status = 'processing'
    and j.lock_token = p_lock_token and j.lease_expires_at >= now()
  for update;
  if job.id is null then raise exception 'Leveranslåset är ogiltigt eller har gått ut' using errcode = '42501'; end if;
  if p_checksum_sha256 !~ '^[0-9a-f]{64}$'
     or p_storage_path is null
     or p_storage_path not like job.organization_id::text || '/' || job.invoice_id::text || '/%' then
    raise exception 'PDF-underlaget är ogiltigt' using errcode = '22023';
  end if;

  update public.customer_invoices set
    pdf_storage_path = p_storage_path,
    pdf_checksum_sha256 = p_checksum_sha256,
    pdf_generated_at = coalesce(pdf_generated_at, now()),
    updated_at = now()
  where organization_id = job.organization_id and id = job.invoice_id
    and (pdf_checksum_sha256 is null or pdf_checksum_sha256 = p_checksum_sha256);
  if not found then raise exception 'En annan PDF-version är redan låst' using errcode = '23505'; end if;
end;
$$;

create or replace function public.worker_complete_customer_invoice_delivery_job(
  p_job_id uuid,
  p_lock_token uuid,
  p_provider_message_id text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare job record;
declare completed_at timestamptz := now();
begin
  select j.*, i.pdf_storage_path, i.pdf_checksum_sha256, i.invoice_number
  into job
  from public.customer_invoice_delivery_jobs j
  join public.customer_invoices i
    on i.organization_id = j.organization_id and i.id = j.invoice_id
  where j.id = p_job_id and j.status = 'processing'
    and j.lock_token = p_lock_token and j.lease_expires_at >= now()
  for update of j;
  if job.id is null then raise exception 'Leveranslåset är ogiltigt eller har gått ut' using errcode = '42501'; end if;
  if job.pdf_storage_path is null or job.pdf_checksum_sha256 is null then
    raise exception 'Verifierad PDF saknas' using errcode = '23514';
  end if;
  if job.channel = 'email' and (p_provider_message_id is null or char_length(trim(p_provider_message_id)) not between 3 and 300) then
    raise exception 'Leverantörens meddelande-id krävs' using errcode = '23514';
  end if;

  update public.customer_invoice_delivery_jobs set
    status = case when channel = 'pdf' then 'delivered' else 'sent' end,
    provider_message_id = case when channel = 'email' then trim(p_provider_message_id) else provider_message_id end,
    provider_response_at = completed_at,
    sent_at = case when channel = 'email' then completed_at else sent_at end,
    delivered_at = case when channel = 'pdf' then completed_at else delivered_at end,
    locked_at = null, locked_by = null, lock_token = null, lease_expires_at = null,
    last_error_code = null, last_error_message = null, updated_at = completed_at
  where id = job.id;

  update public.customer_invoices set
    status = case when job.channel = 'pdf' then 'delivered' else 'sent' end,
    sent_at = case when job.channel = 'email' then completed_at else sent_at end,
    delivered_at = case when job.channel = 'pdf' then completed_at else delivered_at end,
    updated_at = completed_at
  where organization_id = job.organization_id and id = job.invoice_id
    and status not in ('part_paid','paid','overdue','credited','void');

  insert into public.customer_invoice_events(
    organization_id, invoice_id, event_type, safe_summary, metadata
  ) values (
    job.organization_id, job.invoice_id,
    case when job.channel = 'pdf' then 'delivered' else 'sent' end,
    case when job.channel = 'pdf'
      then 'Faktura-PDF skapad och lagrad'
      else 'Faktura accepterad av e-postleverantör' end,
    jsonb_strip_nulls(jsonb_build_object(
      'channel', job.channel,
      'provider_message_id', nullif(trim(p_provider_message_id), ''),
      'pdf_checksum_sha256', job.pdf_checksum_sha256
    ))
  );
end;
$$;

create or replace function public.worker_fail_customer_invoice_delivery_job(
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
declare job record;
declare terminal boolean;
declare delay_seconds integer;
begin
  select * into job
  from public.customer_invoice_delivery_jobs j
  where j.id = p_job_id and j.status = 'processing' and j.lock_token = p_lock_token
  for update;
  if job.id is null then raise exception 'Leveranslåset är ogiltigt' using errcode = '42501'; end if;
  terminal := job.attempt_count >= 8;
  delay_seconds := least(3600, (power(2, greatest(job.attempt_count - 1, 0)) * 60)::integer);

  update public.customer_invoice_delivery_jobs set
    status = case when terminal then 'failed' else 'retry' end,
    next_attempt_at = case when terminal then next_attempt_at else now() + make_interval(secs => delay_seconds) end,
    last_error_code = left(coalesce(nullif(trim(p_error_code), ''), 'delivery_error'), 100),
    last_error_message = left(coalesce(nullif(trim(p_error_message), ''), 'Okänt leveransfel'), 1000),
    dead_lettered_at = case when terminal then now() else null end,
    locked_at = null, locked_by = null, lock_token = null, lease_expires_at = null,
    updated_at = now()
  where id = job.id;
end;
$$;

revoke all on function public.worker_claim_customer_invoice_delivery_jobs(text, integer, integer) from public, anon, authenticated;
revoke all on function public.worker_record_customer_invoice_pdf(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.worker_complete_customer_invoice_delivery_job(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.worker_fail_customer_invoice_delivery_job(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.worker_claim_customer_invoice_delivery_jobs(text, integer, integer) to service_role;
grant execute on function public.worker_record_customer_invoice_pdf(uuid, uuid, text, text) to service_role;
grant execute on function public.worker_complete_customer_invoice_delivery_job(uuid, uuid, text) to service_role;
grant execute on function public.worker_fail_customer_invoice_delivery_job(uuid, uuid, text, text) to service_role;

comment on function public.worker_claim_customer_invoice_delivery_jobs(text, integer, integer) is
  'Server-only SKIP LOCKED lease for email/pdf customer invoice delivery. Peppol is intentionally excluded until a verified operator exists.';
comment on column public.customer_invoices.pdf_checksum_sha256 is
  'SHA-256 calculated by the trusted invoice worker over the stored PDF bytes.';
