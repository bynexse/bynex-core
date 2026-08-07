begin;

-- Bynex uses the existing invoice_inboxes table as the canonical address
-- registry, but extends it with the verified Resend receiving provider and the
-- dedicated inbox.bynex.se domain.
alter table public.invoice_inboxes
  drop constraint if exists invoice_inboxes_provider_check;
alter table public.invoice_inboxes
  add constraint invoice_inboxes_provider_check
  check (provider in ('resend','postmark','smtp','other'));

alter table public.invoice_inboxes
  drop constraint if exists invoice_inboxes_email_address_check;
alter table public.invoice_inboxes
  add constraint invoice_inboxes_email_address_check
  check (
    email_address = lower(btrim(email_address))
    and email_address ~ '^[^[:space:]@]+@(inbox|faktura)\.bynex\.se$'
  );

revoke delete on public.invoice_inboxes from authenticated;

create table public.supplier_invoice_inbound_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  inbox_id uuid not null,
  provider text not null default 'resend' check (provider in ('resend','other')),
  provider_event_id text not null,
  provider_email_id text not null,
  sender_email text not null,
  sender_name text,
  recipient_email text not null,
  subject text,
  message_id text,
  received_at timestamptz not null,
  attachment_count integer not null default 0 check (attachment_count >= 0),
  accepted_attachment_count integer not null default 0
    check (accepted_attachment_count >= 0 and accepted_attachment_count <= attachment_count),
  status text not null default 'received' check (status in (
    'received','processing','processed','partial','duplicate','ignored','failed'
  )),
  error_code text,
  error_message text,
  raw_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(raw_metadata) = 'object'),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (provider, provider_event_id),
  unique (provider, provider_email_id, inbox_id),
  foreign key (organization_id, inbox_id)
    references public.invoice_inboxes(organization_id, id) on delete restrict,
  check (char_length(provider_event_id) between 3 and 300),
  check (char_length(provider_email_id) between 3 and 300),
  check (sender_email = lower(btrim(sender_email))),
  check (sender_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  check (recipient_email = lower(btrim(recipient_email))),
  check (recipient_email ~ '^[^[:space:]@]+@(inbox|faktura)\.bynex\.se$'),
  check (sender_name is null or char_length(btrim(sender_name)) between 1 and 240),
  check (subject is null or char_length(subject) <= 1000),
  check (message_id is null or char_length(message_id) <= 500),
  check (error_code is null or char_length(error_code) <= 160),
  check (error_message is null or char_length(error_message) <= 4000),
  check ((status = 'failed' and error_message is not null) or status <> 'failed')
);

create index supplier_invoice_inbound_messages_org_received_idx
  on public.supplier_invoice_inbound_messages(organization_id, received_at desc);
create index supplier_invoice_inbound_messages_org_status_idx
  on public.supplier_invoice_inbound_messages(organization_id, status, updated_at desc);
create index supplier_invoice_inbound_messages_inbox_idx
  on public.supplier_invoice_inbound_messages(organization_id, inbox_id, received_at desc);

alter table public.supplier_invoice_inbound_messages enable row level security;
alter table public.supplier_invoice_inbound_messages force row level security;

create policy supplier_invoice_inbound_messages_select
on public.supplier_invoice_inbound_messages
for select to authenticated
using (
  private.has_organization_role(
    organization_id,
    array['owner','admin','office']::text[],
    (select auth.uid())
  )
);

revoke all on public.supplier_invoice_inbound_messages from public, anon, authenticated;
grant select on public.supplier_invoice_inbound_messages to authenticated;

create trigger supplier_invoice_inbound_messages_set_updated_at
before update on public.supplier_invoice_inbound_messages
for each row execute function public.set_updated_at();

create trigger supplier_invoice_inbound_messages_write_audit_log
after insert or update on public.supplier_invoice_inbound_messages
for each row execute function private.write_audit_log();

alter table public.supplier_invoices
  add column if not exists inbound_message_id uuid;

alter table public.supplier_invoices
  drop constraint if exists supplier_invoices_inbound_message_tenant_fkey;
alter table public.supplier_invoices
  add constraint supplier_invoices_inbound_message_tenant_fkey
  foreign key (organization_id, inbound_message_id)
  references public.supplier_invoice_inbound_messages(organization_id, id)
  on delete restrict;

create index if not exists supplier_invoices_inbound_message_idx
  on public.supplier_invoices(organization_id, inbound_message_id)
  where inbound_message_id is not null;
create unique index if not exists supplier_invoices_source_reference_uidx
  on public.supplier_invoices(organization_id, source, source_reference)
  where source_reference is not null;

alter table public.supplier_invoice_files
  add column if not exists bynex_document_id uuid,
  add column if not exists bookkeeping_document_id uuid;

alter table public.supplier_invoice_files
  drop constraint if exists supplier_invoice_files_bynex_document_tenant_fkey;
alter table public.supplier_invoice_files
  add constraint supplier_invoice_files_bynex_document_tenant_fkey
  foreign key (organization_id, bynex_document_id)
  references public.bynex_documents(organization_id, id)
  on delete restrict;

alter table public.supplier_invoice_files
  drop constraint if exists supplier_invoice_files_bookkeeping_document_tenant_fkey;
alter table public.supplier_invoice_files
  add constraint supplier_invoice_files_bookkeeping_document_tenant_fkey
  foreign key (organization_id, bookkeeping_document_id)
  references public.bookkeeping_documents(organization_id, id)
  on delete restrict;

create index if not exists supplier_invoice_files_bynex_document_idx
  on public.supplier_invoice_files(organization_id, bynex_document_id)
  where bynex_document_id is not null;
create index if not exists supplier_invoice_files_bookkeeping_document_idx
  on public.supplier_invoice_files(organization_id, bookkeeping_document_id)
  where bookkeeping_document_id is not null;

-- Inbound system mail has no human uploader. Service-role ingestion is still
-- fail-closed at the signed webhook boundary and the document remains private.
alter table public.bynex_documents
  alter column uploaded_by_user_id drop not null;

alter table public.bynex_documents
  drop constraint if exists bynex_documents_system_uploader_check;
alter table public.bynex_documents
  add constraint bynex_documents_system_uploader_check
  check (
    uploaded_by_user_id is not null
    or (
      source in ('email','api','import')
      and context_type = 'supplier_invoice'
      and supplier_invoice_id is not null
      and customer_visible = false
    )
  );

revoke delete on public.supplier_invoices from authenticated;
revoke delete on public.supplier_invoice_files from authenticated;

create or replace function public.provision_bynex_supplier_inbox(
  p_organization_id uuid
)
returns table(id uuid, email_address text, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  selected_org public.organizations;
  existing_inbox public.invoice_inboxes;
  prefix_value text;
  candidate text;
  attempt integer := 0;
begin
  if current_user_id is null or not private.has_organization_role(
    p_organization_id,
    array['owner','admin','office']::text[],
    current_user_id
  ) then
    raise exception 'Ekonomibehörighet krävs för leverantörsinkorgen'
      using errcode = '42501';
  end if;

  select * into selected_org
  from public.organizations
  where organizations.id = p_organization_id
    and organizations.status = 'active'
  for update;
  if selected_org.id is null then
    raise exception 'Företaget saknas eller är inte aktivt' using errcode = 'P0002';
  end if;

  select * into existing_inbox
  from public.invoice_inboxes inbox
  where inbox.organization_id = p_organization_id
    and inbox.is_primary
    and inbox.status <> 'retired'
  order by inbox.created_at
  limit 1
  for update;

  if existing_inbox.id is not null then
    if existing_inbox.status = 'paused' then
      update public.invoice_inboxes
      set status = 'active', updated_at = now()
      where organization_id = p_organization_id and id = existing_inbox.id
      returning * into existing_inbox;
    end if;
    return query select existing_inbox.id, existing_inbox.email_address, existing_inbox.status;
    return;
  end if;

  prefix_value := lower(regexp_replace(
    coalesce(nullif(selected_org.customer_number, ''), left(selected_org.id::text, 8)),
    '[^a-zA-Z0-9]', '', 'g'
  ));
  if prefix_value = '' then prefix_value := left(selected_org.id::text, 8); end if;

  loop
    attempt := attempt + 1;
    if attempt > 20 then
      raise exception 'En unik leverantörsadress kunde inte skapas';
    end if;
    candidate := format(
      'lev-%s-%s@inbox.bynex.se',
      left(prefix_value, 24),
      lower(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 12))
    );
    exit when not exists (
      select 1 from public.invoice_inboxes where email_address = candidate
    );
  end loop;

  insert into public.invoice_inboxes(
    organization_id,
    email_address,
    provider,
    provider_config,
    status,
    is_primary,
    created_by_user_id
  ) values (
    p_organization_id,
    candidate,
    'resend',
    jsonb_build_object(
      'receiving_domain', 'inbox.bynex.se',
      'provider', 'resend',
      'schema_version', 1
    ),
    'active',
    true,
    current_user_id
  ) returning * into existing_inbox;

  return query select existing_inbox.id, existing_inbox.email_address, existing_inbox.status;
end;
$$;

revoke all on function public.provision_bynex_supplier_inbox(uuid)
  from public, anon;
grant execute on function public.provision_bynex_supplier_inbox(uuid)
  to authenticated;

create or replace function public.apply_supplier_invoice_document_analysis(
  p_organization_id uuid,
  p_supplier_invoice_id uuid,
  p_document_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  selected_invoice public.supplier_invoices;
  selected_document public.bynex_documents;
  selected_analysis public.bynex_document_analyses;
  matched_supplier_id uuid;
  updated_invoice public.supplier_invoices;
begin
  if current_user_id is null or not private.has_organization_role(
    p_organization_id,
    array['owner','admin','office']::text[],
    current_user_id
  ) then
    raise exception 'Ekonomibehörighet krävs' using errcode = '42501';
  end if;

  select * into selected_invoice
  from public.supplier_invoices invoice
  where invoice.organization_id = p_organization_id
    and invoice.id = p_supplier_invoice_id
  for update;
  if selected_invoice.id is null then
    raise exception 'Leverantörsfakturan saknas' using errcode = 'P0002';
  end if;
  if selected_invoice.status in ('approved','exported','rejected','duplicate') then
    raise exception 'Fakturan kan inte ändras i nuvarande status' using errcode = '23514';
  end if;

  select * into selected_document
  from public.bynex_documents document
  where document.organization_id = p_organization_id
    and document.id = p_document_id
    and document.supplier_invoice_id = p_supplier_invoice_id
    and document.status <> 'archived';
  if selected_document.id is null then
    raise exception 'Bynex-dokumentet saknas' using errcode = 'P0002';
  end if;

  select * into selected_analysis
  from public.bynex_document_analyses analysis
  where analysis.organization_id = p_organization_id
    and analysis.document_id = p_document_id
    and analysis.analysis_status in ('ready','needs_information')
    and analysis.proposal_status = 'proposed'
  order by analysis.created_at desc
  limit 1
  for update;
  if selected_analysis.id is null then
    raise exception 'Ett granskningsbart Smart-förslag saknas' using errcode = '23514';
  end if;

  if nullif(btrim(coalesce(selected_analysis.counterparty_name, '')), '') is not null then
    select supplier.id into matched_supplier_id
    from public.suppliers supplier
    where supplier.organization_id = p_organization_id
      and supplier.active
      and lower(btrim(supplier.name)) = lower(btrim(selected_analysis.counterparty_name))
    order by supplier.created_at
    limit 1;
  end if;

  update public.supplier_invoices
  set
    supplier_id = coalesce(supplier_id, matched_supplier_id),
    project_id = coalesce(project_id, selected_analysis.suggested_project_id),
    invoice_number = coalesce(invoice_number, selected_analysis.document_number),
    invoice_date = coalesce(invoice_date, selected_analysis.document_date),
    due_date = coalesce(due_date, selected_analysis.due_date),
    currency = coalesce(nullif(selected_analysis.currency, ''), currency),
    net_amount = coalesce(net_amount, selected_analysis.net_amount),
    vat_amount = coalesce(vat_amount, selected_analysis.vat_amount),
    total_amount = coalesce(total_amount, selected_analysis.total_amount),
    amount_due = coalesce(amount_due, selected_analysis.total_amount),
    project_reference = coalesce(
      project_reference,
      nullif(selected_analysis.suggested_description, '')
    ),
    status = 'review',
    raw_metadata = raw_metadata || jsonb_build_object(
      'smart_analysis_id', selected_analysis.id,
      'smart_applied_at', now(),
      'smart_applied_by_user_id', current_user_id,
      'smart_confidence', selected_analysis.confidence,
      'suggested_account_number', selected_analysis.suggested_account_number,
      'suggested_vat_code', selected_analysis.suggested_vat_code,
      'suggested_cost_type', selected_analysis.suggested_cost_type
    ),
    updated_at = now()
  where organization_id = p_organization_id and id = p_supplier_invoice_id
  returning * into updated_invoice;

  update public.bynex_document_analyses
  set
    proposal_status = 'accepted',
    reviewed_by_user_id = current_user_id,
    reviewed_at = now(),
    updated_at = now()
  where organization_id = p_organization_id and id = selected_analysis.id;

  return to_jsonb(updated_invoice);
end;
$$;

revoke all on function public.apply_supplier_invoice_document_analysis(uuid,uuid,uuid)
  from public, anon;
grant execute on function public.apply_supplier_invoice_document_analysis(uuid,uuid,uuid)
  to authenticated;

create or replace function public.review_supplier_invoice(
  p_organization_id uuid,
  p_supplier_invoice_id uuid,
  p_supplier_id uuid default null,
  p_project_id uuid default null,
  p_invoice_number text default null,
  p_invoice_date date default null,
  p_due_date date default null,
  p_currency text default 'SEK',
  p_net_amount numeric default null,
  p_vat_amount numeric default null,
  p_total_amount numeric default null,
  p_ocr_reference text default null,
  p_project_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  selected_invoice public.supplier_invoices;
  updated_invoice public.supplier_invoices;
  calculated_total numeric;
begin
  if current_user_id is null or not private.has_organization_role(
    p_organization_id,
    array['owner','admin','office']::text[],
    current_user_id
  ) then
    raise exception 'Ekonomibehörighet krävs' using errcode = '42501';
  end if;

  select * into selected_invoice
  from public.supplier_invoices invoice
  where invoice.organization_id = p_organization_id
    and invoice.id = p_supplier_invoice_id
  for update;
  if selected_invoice.id is null then
    raise exception 'Leverantörsfakturan saknas' using errcode = 'P0002';
  end if;
  if selected_invoice.status in ('approved','exported','rejected','duplicate') then
    raise exception 'Fakturan är låst i nuvarande status' using errcode = '23514';
  end if;

  if p_supplier_id is not null and not exists (
    select 1 from public.suppliers supplier
    where supplier.organization_id = p_organization_id
      and supplier.id = p_supplier_id
      and supplier.active
  ) then
    raise exception 'Leverantören tillhör inte företaget' using errcode = '23514';
  end if;
  if p_project_id is not null and not exists (
    select 1 from public.projects project
    where project.organization_id = p_organization_id
      and project.id = p_project_id
      and project.active
  ) then
    raise exception 'Projektet tillhör inte företaget' using errcode = '23514';
  end if;
  if coalesce(p_currency, '') !~ '^[A-Z]{3}$' then
    raise exception 'Valutan måste anges med tre bokstäver' using errcode = '22023';
  end if;
  if p_invoice_date is not null and p_due_date is not null and p_due_date < p_invoice_date then
    raise exception 'Förfallodatum kan inte ligga före fakturadatum' using errcode = '22023';
  end if;
  if coalesce(p_net_amount, 0) < 0 or coalesce(p_vat_amount, 0) < 0
     or coalesce(p_total_amount, 0) < 0 then
    raise exception 'Fakturabelopp kan inte vara negativa' using errcode = '22023';
  end if;
  calculated_total := round((coalesce(p_net_amount, 0) + coalesce(p_vat_amount, 0))::numeric, 2);
  if p_total_amount is not null and abs(calculated_total - p_total_amount) > 0.02 then
    raise exception 'Belopp exklusive moms och moms stämmer inte med totalbeloppet'
      using errcode = '23514';
  end if;

  update public.supplier_invoices
  set
    supplier_id = p_supplier_id,
    project_id = p_project_id,
    invoice_number = nullif(left(btrim(coalesce(p_invoice_number, '')), 160), ''),
    invoice_date = p_invoice_date,
    due_date = p_due_date,
    currency = p_currency,
    net_amount = p_net_amount,
    vat_amount = p_vat_amount,
    total_amount = p_total_amount,
    amount_due = p_total_amount,
    ocr_reference = nullif(left(btrim(coalesce(p_ocr_reference, '')), 120), ''),
    project_reference = nullif(left(btrim(coalesce(p_project_reference, '')), 160), ''),
    status = 'matched',
    parsing_error_code = null,
    raw_metadata = raw_metadata || jsonb_build_object(
      'reviewed_at', now(),
      'reviewed_by_user_id', current_user_id
    ),
    updated_at = now()
  where organization_id = p_organization_id and id = p_supplier_invoice_id
  returning * into updated_invoice;

  update public.bynex_documents
  set project_id = p_project_id, status = 'review', updated_at = now()
  where organization_id = p_organization_id
    and supplier_invoice_id = p_supplier_invoice_id
    and status <> 'archived';

  update public.bookkeeping_documents document
  set project_id = p_project_id, status = 'parsed', updated_at = now()
  where document.organization_id = p_organization_id
    and document.supplier_invoice_id = p_supplier_invoice_id
    and document.status not in ('posted','rejected');

  return to_jsonb(updated_invoice);
end;
$$;

revoke all on function public.review_supplier_invoice(
  uuid,uuid,uuid,uuid,text,date,date,text,numeric,numeric,numeric,text,text
) from public, anon;
grant execute on function public.review_supplier_invoice(
  uuid,uuid,uuid,uuid,text,date,date,text,numeric,numeric,numeric,text,text
) to authenticated;

create or replace function public.approve_supplier_invoice(
  p_organization_id uuid,
  p_supplier_invoice_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  selected_invoice public.supplier_invoices;
  updated_invoice public.supplier_invoices;
begin
  if current_user_id is null or not private.has_organization_role(
    p_organization_id,
    array['owner','admin','office']::text[],
    current_user_id
  ) then
    raise exception 'Behörighet att attestera saknas' using errcode = '42501';
  end if;

  select * into selected_invoice
  from public.supplier_invoices invoice
  where invoice.organization_id = p_organization_id
    and invoice.id = p_supplier_invoice_id
  for update;
  if selected_invoice.id is null then
    raise exception 'Leverantörsfakturan saknas' using errcode = 'P0002';
  end if;
  if selected_invoice.status <> 'matched' then
    raise exception 'Fakturan måste vara kontrollerad före attest' using errcode = '23514';
  end if;
  if selected_invoice.supplier_id is null
     or selected_invoice.invoice_number is null
     or selected_invoice.invoice_date is null
     or selected_invoice.total_amount is null then
    raise exception 'Leverantör, nummer, datum och totalbelopp måste vara kontrollerade'
      using errcode = '23514';
  end if;

  update public.supplier_invoices
  set
    status = 'approved',
    approved_by_user_id = current_user_id,
    approved_at = now(),
    raw_metadata = raw_metadata || jsonb_build_object(
      'approval_stage', 'human_approved_for_bookkeeping_draft',
      'booked_automatically', false
    ),
    updated_at = now()
  where organization_id = p_organization_id and id = p_supplier_invoice_id
  returning * into updated_invoice;

  update public.bynex_documents
  set status = 'approved', updated_at = now()
  where organization_id = p_organization_id
    and supplier_invoice_id = p_supplier_invoice_id
    and status <> 'archived';

  update public.bookkeeping_documents document
  set status = 'validated', updated_at = now()
  where document.organization_id = p_organization_id
    and document.supplier_invoice_id = p_supplier_invoice_id
    and document.status not in ('posted','rejected');

  return to_jsonb(updated_invoice);
end;
$$;

revoke all on function public.approve_supplier_invoice(uuid,uuid)
  from public, anon;
grant execute on function public.approve_supplier_invoice(uuid,uuid)
  to authenticated;

create or replace function public.reject_supplier_invoice(
  p_organization_id uuid,
  p_supplier_invoice_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  selected_invoice public.supplier_invoices;
  updated_invoice public.supplier_invoices;
  normalized_reason text := left(btrim(coalesce(p_reason, '')), 1000);
begin
  if current_user_id is null or not private.has_organization_role(
    p_organization_id,
    array['owner','admin','office']::text[],
    current_user_id
  ) then
    raise exception 'Ekonomibehörighet krävs' using errcode = '42501';
  end if;
  if char_length(normalized_reason) < 3 then
    raise exception 'Orsak till avvisning krävs' using errcode = '22023';
  end if;

  select * into selected_invoice
  from public.supplier_invoices invoice
  where invoice.organization_id = p_organization_id
    and invoice.id = p_supplier_invoice_id
  for update;
  if selected_invoice.id is null then
    raise exception 'Leverantörsfakturan saknas' using errcode = 'P0002';
  end if;
  if selected_invoice.status in ('approved','exported') then
    raise exception 'En attesterad eller exporterad faktura kan inte avvisas här'
      using errcode = '23514';
  end if;

  update public.supplier_invoices
  set
    status = 'rejected',
    parsing_error_code = 'human_rejected',
    raw_metadata = raw_metadata || jsonb_build_object(
      'rejected_at', now(),
      'rejected_by_user_id', current_user_id,
      'rejection_reason', normalized_reason
    ),
    updated_at = now()
  where organization_id = p_organization_id and id = p_supplier_invoice_id
  returning * into updated_invoice;

  update public.bynex_documents
  set status = 'rejected', updated_at = now()
  where organization_id = p_organization_id
    and supplier_invoice_id = p_supplier_invoice_id
    and status <> 'archived';

  update public.bookkeeping_documents document
  set status = 'rejected', updated_at = now()
  where document.organization_id = p_organization_id
    and document.supplier_invoice_id = p_supplier_invoice_id
    and document.status <> 'posted';

  return to_jsonb(updated_invoice);
end;
$$;

revoke all on function public.reject_supplier_invoice(uuid,uuid,text)
  from public, anon;
grant execute on function public.reject_supplier_invoice(uuid,uuid,text)
  to authenticated;

comment on table public.supplier_invoice_inbound_messages is
  'Tenant-isolated evidence for signed inbound supplier-email events. Original files are stored privately and no user-facing hard delete is allowed.';
comment on function public.provision_bynex_supplier_inbox(uuid) is
  'Creates or returns the active, unique supplier invoice address for one Bynex organization.';
comment on function public.approve_supplier_invoice(uuid,uuid) is
  'Human approval of a reviewed supplier invoice. It validates the bookkeeping document but never creates a posted journal entry automatically.';

select pg_notify('pgrst', 'reload schema');

commit;
