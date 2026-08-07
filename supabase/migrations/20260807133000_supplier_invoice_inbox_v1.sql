begin;

-- System-received documents are created by the verified inbound worker rather
-- than by an interactive user. Human uploads still require a user id through
-- the existing RLS policy.
alter table public.bynex_documents
  alter column uploaded_by_user_id drop not null;

alter table public.bynex_documents
  drop constraint if exists bynex_documents_system_uploader_check,
  add constraint bynex_documents_system_uploader_check
    check (uploaded_by_user_id is not null or source in ('email','api'));

create table if not exists public.supplier_invoice_inbound_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  inbox_id uuid not null,
  provider text not null default 'resend'
    check (provider in ('resend','postmark','manual','other')),
  provider_event_id text not null,
  provider_email_id text not null,
  message_id text,
  from_email text not null,
  from_name text,
  recipients text[] not null default '{}'::text[],
  subject text not null default '',
  received_at timestamptz not null,
  attachment_count integer not null default 0
    check (attachment_count between 0 and 100),
  accepted_attachment_count integer not null default 0
    check (accepted_attachment_count between 0 and 100),
  status text not null default 'received'
    check (status in ('received','processing','processed','quarantined','failed','duplicate')),
  body_preview text,
  headers jsonb not null default '{}'::jsonb
    check (jsonb_typeof(headers) = 'object'),
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (provider,provider_event_id),
  unique (provider,provider_email_id),
  foreign key (organization_id,inbox_id)
    references public.invoice_inboxes(organization_id,id) on delete restrict,
  check (from_email = lower(btrim(from_email))),
  check (from_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  check (cardinality(recipients) between 1 and 50),
  check (char_length(provider_event_id) between 3 and 240),
  check (char_length(provider_email_id) between 3 and 240),
  check (message_id is null or char_length(message_id) <= 500),
  check (from_name is null or char_length(from_name) <= 240),
  check (char_length(subject) <= 1000),
  check (body_preview is null or char_length(body_preview) <= 4000),
  check ((status = 'failed' and error_message is not null) or status <> 'failed')
);

create index if not exists supplier_invoice_inbound_messages_org_received_idx
  on public.supplier_invoice_inbound_messages(organization_id,received_at desc);
create index if not exists supplier_invoice_inbound_messages_org_status_idx
  on public.supplier_invoice_inbound_messages(organization_id,status,updated_at desc);

alter table public.supplier_invoices
  add column if not exists inbound_message_id uuid;

alter table public.supplier_invoices
  drop constraint if exists supplier_invoices_inbound_message_tenant_fkey,
  add constraint supplier_invoices_inbound_message_tenant_fkey
    foreign key (organization_id,inbound_message_id)
    references public.supplier_invoice_inbound_messages(organization_id,id)
    on delete set null (inbound_message_id);

create unique index if not exists supplier_invoices_email_source_reference_uidx
  on public.supplier_invoices(organization_id,source_reference)
  where source='email' and source_reference is not null;

alter table public.supplier_invoice_files
  add column if not exists bynex_document_id uuid,
  add column if not exists bookkeeping_document_id uuid;

alter table public.supplier_invoice_files
  drop constraint if exists supplier_invoice_files_storage_bucket_check,
  add constraint supplier_invoice_files_storage_bucket_check
    check (storage_bucket in ('supplier-invoices','bynex-documents')),
  drop constraint if exists supplier_invoice_files_bynex_document_tenant_fkey,
  add constraint supplier_invoice_files_bynex_document_tenant_fkey
    foreign key (organization_id,bynex_document_id)
    references public.bynex_documents(organization_id,id)
    on delete set null (bynex_document_id),
  drop constraint if exists supplier_invoice_files_bookkeeping_document_tenant_fkey,
  add constraint supplier_invoice_files_bookkeeping_document_tenant_fkey
    foreign key (organization_id,bookkeeping_document_id)
    references public.bookkeeping_documents(organization_id,id)
    on delete set null (bookkeeping_document_id);

create unique index if not exists supplier_invoice_files_bynex_document_uidx
  on public.supplier_invoice_files(organization_id,bynex_document_id)
  where bynex_document_id is not null;
create unique index if not exists supplier_invoice_files_bookkeeping_document_uidx
  on public.supplier_invoice_files(organization_id,bookkeeping_document_id)
  where bookkeeping_document_id is not null;

alter table public.supplier_invoice_inbound_messages enable row level security;
alter table public.supplier_invoice_inbound_messages force row level security;

drop policy if exists supplier_invoice_inbound_messages_finance_select
  on public.supplier_invoice_inbound_messages;
create policy supplier_invoice_inbound_messages_finance_select
on public.supplier_invoice_inbound_messages
for select to authenticated
using (
  private.has_organization_role(
    organization_id,
    array['owner','admin','office']::text[],
    (select auth.uid())
  )
);

revoke all on public.supplier_invoice_inbound_messages
  from public,anon,authenticated;
grant select on public.supplier_invoice_inbound_messages to authenticated;
grant select,insert,update on public.supplier_invoice_inbound_messages to service_role;

grant select,insert,update on public.supplier_invoices to service_role;
grant select,insert,update on public.supplier_invoice_files to service_role;
grant select,insert,update on public.bookkeeping_documents to service_role;
grant select,insert,update on public.bynex_documents to service_role;

create trigger supplier_invoice_inbound_messages_set_updated_at
before update on public.supplier_invoice_inbound_messages
for each row execute function public.set_updated_at();

create trigger supplier_invoice_inbound_messages_write_audit_log
after insert or update on public.supplier_invoice_inbound_messages
for each row execute function private.write_audit_log();

create or replace function public.provision_invoice_inbox(p_organization_id uuid)
returns public.invoice_inboxes
language plpgsql
security definer
set search_path=''
as $$
declare
  existing_inbox public.invoice_inboxes;
  created_inbox public.invoice_inboxes;
  customer_code text;
  generated_local_part text;
begin
  if not private.has_organization_role(
    p_organization_id,
    array['owner','admin','office']::text[],
    (select auth.uid())
  ) then
    raise exception 'Behörighet till leverantörsinkorgen saknas'
      using errcode='42501';
  end if;

  select i.* into existing_inbox
  from public.invoice_inboxes i
  where i.organization_id=p_organization_id
    and i.is_primary
    and i.status='active'
  order by i.created_at
  limit 1;

  if found then return existing_inbox; end if;

  select regexp_replace(lower(coalesce(o.customer_number,'')),'[^a-z0-9]+','','g')
    into customer_code
  from public.organizations o
  where o.id=p_organization_id and o.status='active';

  if customer_code is null then
    raise exception 'Företaget hittades inte' using errcode='P0002';
  end if;
  if char_length(customer_code) < 4 then customer_code := 'kund'; end if;

  loop
    generated_local_part :=
      'lev-' || left(customer_code,30) || '-' || encode(extensions.gen_random_bytes(6),'hex');
    begin
      insert into public.invoice_inboxes(
        organization_id,local_part,email_address,provider,is_primary,status
      ) values (
        p_organization_id,
        generated_local_part,
        generated_local_part || '@inbox.bynex.se',
        'resend',
        true,
        'active'
      ) returning * into created_inbox;
      exit;
    exception when unique_violation then
      null;
    end;
  end loop;

  return created_inbox;
end;
$$;

revoke all on function public.provision_invoice_inbox(uuid) from public,anon;
grant execute on function public.provision_invoice_inbox(uuid) to authenticated;

create or replace function public.review_supplier_invoice(
  p_organization_id uuid,
  p_supplier_invoice_id uuid,
  p_supplier_id uuid,
  p_project_id uuid,
  p_invoice_number text,
  p_invoice_date date,
  p_due_date date,
  p_currency text,
  p_net_amount numeric,
  p_vat_amount numeric,
  p_total_amount numeric,
  p_ocr_reference text,
  p_purchase_order_reference text,
  p_project_reference text
)
returns public.supplier_invoices
language plpgsql
security definer
set search_path=''
as $$
declare
  current_user_id uuid := (select auth.uid());
  selected_invoice public.supplier_invoices;
  updated_invoice public.supplier_invoices;
begin
  if current_user_id is null or not private.has_organization_role(
    p_organization_id,array['owner','admin','office']::text[],current_user_id
  ) then
    raise exception 'Ekonomibehörighet krävs' using errcode='42501';
  end if;

  select * into selected_invoice
  from public.supplier_invoices i
  where i.organization_id=p_organization_id and i.id=p_supplier_invoice_id
  for update;
  if selected_invoice.id is null then
    raise exception 'Leverantörsfakturan hittades inte' using errcode='P0002';
  end if;
  if selected_invoice.status in ('approved','exported','duplicate','rejected') then
    raise exception 'Leverantörsfakturan är låst i nuvarande status'
      using errcode='23514';
  end if;
  if p_supplier_id is not null and not exists(
    select 1 from public.suppliers s
    where s.organization_id=p_organization_id and s.id=p_supplier_id and s.active
  ) then
    raise exception 'Leverantören finns inte i företaget' using errcode='23514';
  end if;
  if p_project_id is not null and not exists(
    select 1 from public.projects p
    where p.organization_id=p_organization_id and p.id=p_project_id and p.active
  ) then
    raise exception 'Projektet finns inte i företaget' using errcode='23514';
  end if;
  if p_due_date is not null and p_invoice_date is not null and p_due_date<p_invoice_date then
    raise exception 'Förfallodatum kan inte ligga före fakturadatum'
      using errcode='23514';
  end if;
  if coalesce(p_currency,'') !~ '^[A-Z]{3}$' then
    raise exception 'Valutan är ogiltig' using errcode='23514';
  end if;
  if p_net_amount<0 or p_vat_amount<0 or p_total_amount<0 then
    raise exception 'Beloppen får inte vara negativa' using errcode='23514';
  end if;
  if p_total_amount is not null and p_net_amount is not null and p_vat_amount is not null
     and abs(p_total_amount-p_net_amount-p_vat_amount)>0.02 then
    raise exception 'Totalbeloppet måste motsvara netto plus moms'
      using errcode='23514';
  end if;

  update public.supplier_invoices
  set supplier_id=p_supplier_id,
      project_id=p_project_id,
      invoice_number=nullif(left(btrim(coalesce(p_invoice_number,'')),160),''),
      invoice_date=p_invoice_date,
      due_date=p_due_date,
      currency=upper(p_currency),
      net_amount=p_net_amount,
      vat_amount=p_vat_amount,
      total_amount=p_total_amount,
      amount_due=p_total_amount,
      ocr_reference=nullif(left(btrim(coalesce(p_ocr_reference,'')),100),''),
      purchase_order_reference=nullif(left(btrim(coalesce(p_purchase_order_reference,'')),160),''),
      project_reference=nullif(left(btrim(coalesce(p_project_reference,'')),160),''),
      status='review',
      parsing_error_code=null,
      raw_metadata=coalesce(raw_metadata,'{}'::jsonb) || jsonb_build_object(
        'last_reviewed_by_user_id',current_user_id,
        'last_reviewed_at',now()
      ),
      updated_at=now()
  where organization_id=p_organization_id and id=p_supplier_invoice_id
  returning * into updated_invoice;

  update public.bookkeeping_documents
  set document_date=p_invoice_date,
      currency=upper(p_currency),
      net_amount=p_net_amount,
      vat_amount=p_vat_amount,
      total_amount=p_total_amount,
      status='review',
      updated_at=now()
  where organization_id=p_organization_id
    and supplier_invoice_id=p_supplier_invoice_id;

  return updated_invoice;
end;
$$;

create or replace function public.approve_supplier_invoice(
  p_organization_id uuid,
  p_supplier_invoice_id uuid
)
returns public.supplier_invoices
language plpgsql
security definer
set search_path=''
as $$
declare
  current_user_id uuid := (select auth.uid());
  selected_invoice public.supplier_invoices;
  updated_invoice public.supplier_invoices;
begin
  if current_user_id is null or not private.has_organization_role(
    p_organization_id,array['owner','admin','office']::text[],current_user_id
  ) then
    raise exception 'Ekonomibehörighet krävs' using errcode='42501';
  end if;

  select * into selected_invoice
  from public.supplier_invoices i
  where i.organization_id=p_organization_id and i.id=p_supplier_invoice_id
  for update;
  if selected_invoice.id is null then
    raise exception 'Leverantörsfakturan hittades inte' using errcode='P0002';
  end if;
  if selected_invoice.status not in ('review','matched') then
    raise exception 'Leverantörsfakturan måste granskas före attest'
      using errcode='23514';
  end if;
  if selected_invoice.supplier_id is null
     or nullif(btrim(coalesce(selected_invoice.invoice_number,'')),'') is null
     or selected_invoice.invoice_date is null
     or selected_invoice.due_date is null
     or selected_invoice.net_amount is null
     or selected_invoice.vat_amount is null
     or selected_invoice.total_amount is null then
    raise exception 'Leverantör, fakturanummer, datum och kompletta belopp krävs'
      using errcode='23514';
  end if;
  if abs(selected_invoice.total_amount-selected_invoice.net_amount-selected_invoice.vat_amount)>0.02 then
    raise exception 'Totalbeloppet måste motsvara netto plus moms'
      using errcode='23514';
  end if;
  if not exists(
    select 1 from public.supplier_invoice_files f
    where f.organization_id=p_organization_id
      and f.supplier_invoice_id=p_supplier_invoice_id
  ) then
    raise exception 'Originalunderlaget saknas' using errcode='23514';
  end if;

  update public.supplier_invoices
  set status='approved',
      approved_by_user_id=current_user_id,
      approved_at=now(),
      amount_due=coalesce(amount_due,total_amount),
      updated_at=now()
  where organization_id=p_organization_id and id=p_supplier_invoice_id
  returning * into updated_invoice;

  update public.bookkeeping_documents
  set status='matched',updated_at=now()
  where organization_id=p_organization_id
    and supplier_invoice_id=p_supplier_invoice_id;

  return updated_invoice;
end;
$$;

create or replace function public.reject_supplier_invoice(
  p_organization_id uuid,
  p_supplier_invoice_id uuid,
  p_reason text
)
returns public.supplier_invoices
language plpgsql
security definer
set search_path=''
as $$
declare
  current_user_id uuid := (select auth.uid());
  selected_invoice public.supplier_invoices;
  updated_invoice public.supplier_invoices;
  normalized_reason text := left(btrim(coalesce(p_reason,'')),1000);
begin
  if current_user_id is null or not private.has_organization_role(
    p_organization_id,array['owner','admin','office']::text[],current_user_id
  ) then
    raise exception 'Ekonomibehörighet krävs' using errcode='42501';
  end if;
  if char_length(normalized_reason)<2 then
    raise exception 'Ange varför underlaget avvisas' using errcode='23514';
  end if;

  select * into selected_invoice
  from public.supplier_invoices i
  where i.organization_id=p_organization_id and i.id=p_supplier_invoice_id
  for update;
  if selected_invoice.id is null then
    raise exception 'Leverantörsfakturan hittades inte' using errcode='P0002';
  end if;
  if selected_invoice.status in ('approved','exported') then
    raise exception 'En attesterad faktura rättas genom ett separat spår'
      using errcode='23514';
  end if;

  update public.supplier_invoices
  set status='rejected',
      raw_metadata=coalesce(raw_metadata,'{}'::jsonb) || jsonb_build_object(
        'rejected_by_user_id',current_user_id,
        'rejected_at',now(),
        'rejection_reason',normalized_reason
      ),
      updated_at=now()
  where organization_id=p_organization_id and id=p_supplier_invoice_id
  returning * into updated_invoice;

  update public.bookkeeping_documents
  set status='failed',updated_at=now()
  where organization_id=p_organization_id
    and supplier_invoice_id=p_supplier_invoice_id;

  return updated_invoice;
end;
$$;

create or replace function public.apply_supplier_invoice_document_analysis(
  p_organization_id uuid,
  p_supplier_invoice_id uuid,
  p_document_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
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
    p_organization_id,array['owner','admin','office']::text[],current_user_id
  ) then
    raise exception 'Ekonomibehörighet krävs' using errcode='42501';
  end if;

  select * into selected_invoice
  from public.supplier_invoices i
  where i.organization_id=p_organization_id and i.id=p_supplier_invoice_id
  for update;
  if selected_invoice.id is null then
    raise exception 'Leverantörsfakturan hittades inte' using errcode='P0002';
  end if;
  if selected_invoice.status in ('approved','exported','duplicate','rejected') then
    raise exception 'Leverantörsfakturan är låst i nuvarande status'
      using errcode='23514';
  end if;

  select * into selected_document
  from public.bynex_documents d
  where d.organization_id=p_organization_id
    and d.id=p_document_id
    and d.supplier_invoice_id=p_supplier_invoice_id;
  if selected_document.id is null then
    raise exception 'Dokumentet hör inte till leverantörsfakturan'
      using errcode='23514';
  end if;

  select * into selected_analysis
  from public.bynex_document_analyses a
  where a.organization_id=p_organization_id
    and a.document_id=p_document_id
    and a.analysis_status in ('ready','needs_information')
    and a.proposal_status='proposed'
  for update;
  if selected_analysis.id is null then
    raise exception 'Ett färdigt Smart-förslag saknas' using errcode='23514';
  end if;

  if selected_analysis.counterparty_name is not null then
    select s.id into matched_supplier_id
    from public.suppliers s
    where s.organization_id=p_organization_id
      and s.active
      and lower(btrim(s.name))=lower(btrim(selected_analysis.counterparty_name))
    order by s.created_at
    limit 1;
  end if;

  update public.supplier_invoices
  set supplier_id=coalesce(supplier_id,matched_supplier_id),
      project_id=coalesce(project_id,selected_analysis.suggested_project_id),
      invoice_number=coalesce(invoice_number,selected_analysis.document_number),
      invoice_date=coalesce(invoice_date,selected_analysis.document_date),
      due_date=coalesce(due_date,selected_analysis.due_date),
      currency=coalesce(nullif(selected_analysis.currency,''),currency),
      net_amount=coalesce(net_amount,selected_analysis.net_amount),
      vat_amount=coalesce(vat_amount,selected_analysis.vat_amount),
      total_amount=coalesce(total_amount,selected_analysis.total_amount),
      amount_due=coalesce(amount_due,selected_analysis.total_amount),
      status='review',
      parsing_error_code=null,
      raw_metadata=coalesce(raw_metadata,'{}'::jsonb) || jsonb_build_object(
        'bynex_smart_analysis_id',selected_analysis.id,
        'counterparty_name',selected_analysis.counterparty_name,
        'suggested_account_number',selected_analysis.suggested_account_number,
        'suggested_account_name',selected_analysis.suggested_account_name,
        'suggested_vat_code',selected_analysis.suggested_vat_code,
        'suggested_cost_type',selected_analysis.suggested_cost_type,
        'suggested_description',selected_analysis.suggested_description,
        'smart_confidence',selected_analysis.confidence,
        'smart_applied_by_user_id',current_user_id,
        'smart_applied_at',now()
      ),
      updated_at=now()
  where organization_id=p_organization_id and id=p_supplier_invoice_id
  returning * into updated_invoice;

  update public.bookkeeping_documents
  set document_date=coalesce(document_date,selected_analysis.document_date),
      counterparty_name=coalesce(counterparty_name,selected_analysis.counterparty_name),
      currency=coalesce(nullif(selected_analysis.currency,''),currency),
      net_amount=coalesce(net_amount,selected_analysis.net_amount),
      vat_amount=coalesce(vat_amount,selected_analysis.vat_amount),
      total_amount=coalesce(total_amount,selected_analysis.total_amount),
      status='review',
      updated_at=now()
  where organization_id=p_organization_id
    and supplier_invoice_id=p_supplier_invoice_id;

  update public.bynex_document_analyses
  set proposal_status='applied',
      reviewed_by_user_id=current_user_id,
      reviewed_at=now(),
      updated_at=now()
  where organization_id=p_organization_id and id=selected_analysis.id;

  update public.bynex_documents
  set status='reviewed',updated_at=now()
  where organization_id=p_organization_id and id=p_document_id;

  return jsonb_build_object(
    'supplier_invoice_id',updated_invoice.id,
    'status',updated_invoice.status,
    'supplier_id',updated_invoice.supplier_id,
    'project_id',updated_invoice.project_id,
    'analysis_id',selected_analysis.id,
    'confidence',selected_analysis.confidence,
    'missing_information',selected_analysis.missing_information
  );
end;
$$;

revoke all on function public.review_supplier_invoice(
  uuid,uuid,uuid,uuid,text,date,date,text,numeric,numeric,numeric,text,text,text
) from public,anon;
revoke all on function public.approve_supplier_invoice(uuid,uuid) from public,anon;
revoke all on function public.reject_supplier_invoice(uuid,uuid,text) from public,anon;
revoke all on function public.apply_supplier_invoice_document_analysis(uuid,uuid,uuid)
  from public,anon;

grant execute on function public.review_supplier_invoice(
  uuid,uuid,uuid,uuid,text,date,date,text,numeric,numeric,numeric,text,text,text
) to authenticated;
grant execute on function public.approve_supplier_invoice(uuid,uuid) to authenticated;
grant execute on function public.reject_supplier_invoice(uuid,uuid,text) to authenticated;
grant execute on function public.apply_supplier_invoice_document_analysis(uuid,uuid,uuid)
  to authenticated;

comment on table public.supplier_invoice_inbound_messages is
  'Immutable supplier-invoice email envelope and processing evidence. Message bodies are limited to a short finance-only preview; attachments are stored privately as Bynex documents.';

select pg_notify('pgrst','reload schema');

commit;
