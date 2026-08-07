begin;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'bynex-documents',
  'bynex-documents',
  false,
  26214400,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'text/plain',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.bynex_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  context_type text not null check (
    context_type in (
      'general',
      'bookkeeping',
      'supplier_invoice',
      'customer_invoice',
      'quote',
      'change_order',
      'project',
      'customer_portal',
      'property'
    )
  ),
  category text not null default 'other' check (
    category in (
      'receipt',
      'supplier_invoice',
      'customer_invoice_attachment',
      'quote_attachment',
      'change_order_evidence',
      'project_document',
      'contract',
      'warranty',
      'drawing',
      'photo',
      'delivery_note',
      'price_list',
      'other'
    )
  ),
  project_id uuid,
  quote_id uuid,
  change_order_id uuid,
  customer_invoice_id uuid,
  supplier_invoice_id uuid,
  property_id uuid,
  bookkeeping_document_id uuid,
  title text not null check (char_length(btrim(title)) between 2 and 240),
  original_filename text not null check (char_length(btrim(original_filename)) between 1 and 240),
  storage_bucket text not null default 'bynex-documents' check (storage_bucket = 'bynex-documents'),
  storage_path text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes between 1 and 26214400),
  checksum_sha256 text not null check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  source text not null default 'upload' check (
    source in ('upload','camera','email','api','customer_portal','worker')
  ),
  customer_visible boolean not null default false,
  status text not null default 'pending_upload' check (
    status in (
      'pending_upload',
      'uploaded',
      'analysis_pending',
      'analyzed',
      'reviewed',
      'rejected',
      'failed',
      'archived'
    )
  ),
  duplicate_of_document_id uuid,
  uploaded_by_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  uploaded_by_worker_id uuid,
  uploaded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, storage_path),
  foreign key (organization_id, project_id)
    references public.projects(organization_id, id) on delete set null (project_id),
  foreign key (organization_id, quote_id)
    references public.quotes(organization_id, id) on delete set null (quote_id),
  foreign key (organization_id, change_order_id)
    references public.change_orders(organization_id, id) on delete set null (change_order_id),
  foreign key (organization_id, customer_invoice_id)
    references public.customer_invoices(organization_id, id) on delete set null (customer_invoice_id),
  foreign key (organization_id, supplier_invoice_id)
    references public.supplier_invoices(organization_id, id) on delete set null (supplier_invoice_id),
  foreign key (organization_id, property_id)
    references public.properties(organization_id, id) on delete set null (property_id),
  foreign key (organization_id, bookkeeping_document_id)
    references public.bookkeeping_documents(organization_id, id) on delete set null (bookkeeping_document_id),
  foreign key (organization_id, uploaded_by_worker_id)
    references public.workers(organization_id, id) on delete set null (uploaded_by_worker_id),
  foreign key (organization_id, duplicate_of_document_id)
    references public.bynex_documents(organization_id, id) on delete set null (duplicate_of_document_id),
  check (
    context_type <> 'quote' or quote_id is not null
  ),
  check (
    context_type <> 'change_order' or change_order_id is not null
  ),
  check (
    context_type <> 'customer_invoice' or customer_invoice_id is not null
  ),
  check (
    context_type <> 'supplier_invoice' or supplier_invoice_id is not null or status in ('pending_upload','uploaded','analysis_pending','analyzed')
  ),
  check (
    context_type not in ('project','customer_portal') or project_id is not null
  ),
  check (
    context_type <> 'property' or property_id is not null
  ),
  check (
    storage_path = organization_id::text || '/' || id::text || '/' || original_filename
  )
);

create index if not exists bynex_documents_context_idx
  on public.bynex_documents (
    organization_id,
    context_type,
    project_id,
    created_at desc
  );

create index if not exists bynex_documents_review_queue_idx
  on public.bynex_documents (organization_id, status, created_at desc)
  where status in ('uploaded','analysis_pending','analyzed','failed');

create index if not exists bynex_documents_checksum_idx
  on public.bynex_documents (organization_id, checksum_sha256, created_at desc);

create table if not exists public.bynex_document_analyses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  document_id uuid not null,
  analysis_status text not null default 'pending' check (
    analysis_status in ('pending','processing','ready','needs_information','failed')
  ),
  proposal_status text not null default 'proposed' check (
    proposal_status in ('proposed','approved','rejected','applied')
  ),
  document_kind text not null default 'other' check (
    document_kind in (
      'receipt',
      'supplier_invoice',
      'customer_invoice',
      'contract',
      'quote_basis',
      'change_order_evidence',
      'drawing',
      'warranty',
      'delivery_note',
      'price_list',
      'project_photo',
      'other'
    )
  ),
  counterparty_name text,
  document_number text,
  document_date date,
  due_date date,
  currency text not null default 'SEK' check (currency ~ '^[A-Z]{3}$'),
  net_amount numeric(16,2) check (net_amount is null or net_amount >= 0),
  vat_amount numeric(16,2) check (vat_amount is null or vat_amount >= 0),
  total_amount numeric(16,2) check (total_amount is null or total_amount >= 0),
  suggested_project_id uuid,
  suggested_account_number text,
  suggested_account_name text,
  suggested_vat_code text,
  suggested_cost_type text check (
    suggested_cost_type is null or suggested_cost_type in (
      'material','subcontractor','equipment','travel','administration','other'
    )
  ),
  suggested_description text,
  suggested_action text,
  explanation text not null default '',
  confidence numeric(5,4) not null default 0 check (confidence between 0 and 1),
  line_items jsonb not null default '[]'::jsonb check (jsonb_typeof(line_items) = 'array'),
  missing_information jsonb not null default '[]'::jsonb check (jsonb_typeof(missing_information) = 'array'),
  raw_result jsonb not null default '{}'::jsonb check (jsonb_typeof(raw_result) = 'object'),
  model_source text not null default 'local' check (model_source in ('local','openai')),
  model_name text,
  workflow_version text not null default 'bynex-document-analysis-v1',
  reviewed_by_user_id uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, document_id),
  foreign key (organization_id, document_id)
    references public.bynex_documents(organization_id, id) on delete cascade,
  foreign key (organization_id, suggested_project_id)
    references public.projects(organization_id, id) on delete set null (suggested_project_id),
  check (due_date is null or document_date is null or due_date >= document_date),
  check (
    total_amount is null
    or net_amount is null
    or vat_amount is null
    or total_amount = net_amount + vat_amount
  )
);

create index if not exists bynex_document_analyses_queue_idx
  on public.bynex_document_analyses (
    organization_id,
    analysis_status,
    proposal_status,
    updated_at desc
  );

create table if not exists public.project_cost_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null,
  document_id uuid not null,
  cost_type text not null check (
    cost_type in ('material','subcontractor','equipment','travel','administration','other')
  ),
  supplier_name text,
  description text not null check (char_length(btrim(description)) between 2 and 500),
  occurred_on date not null,
  currency text not null default 'SEK' check (currency ~ '^[A-Z]{3}$'),
  net_amount numeric(16,2) not null default 0 check (net_amount >= 0),
  vat_amount numeric(16,2) not null default 0 check (vat_amount >= 0),
  total_amount numeric(16,2) not null default 0 check (total_amount = net_amount + vat_amount),
  status text not null default 'approved' check (status in ('approved','booked','rejected')),
  approved_by_user_id uuid not null references auth.users(id) on delete restrict,
  approved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, document_id),
  foreign key (organization_id, project_id)
    references public.projects(organization_id, id) on delete cascade,
  foreign key (organization_id, document_id)
    references public.bynex_documents(organization_id, id) on delete restrict
);

create index if not exists project_cost_entries_project_idx
  on public.project_cost_entries (
    organization_id,
    project_id,
    occurred_on desc,
    created_at desc
  )
  where status in ('approved','booked');

drop trigger if exists bynex_documents_set_updated_at on public.bynex_documents;
create trigger bynex_documents_set_updated_at
before update on public.bynex_documents
for each row execute function public.set_updated_at();

drop trigger if exists bynex_document_analyses_set_updated_at on public.bynex_document_analyses;
create trigger bynex_document_analyses_set_updated_at
before update on public.bynex_document_analyses
for each row execute function public.set_updated_at();

drop trigger if exists project_cost_entries_set_updated_at on public.project_cost_entries;
create trigger project_cost_entries_set_updated_at
before update on public.project_cost_entries
for each row execute function public.set_updated_at();

create or replace function private.can_access_bynex_document(
  p_organization_id uuid,
  p_document_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.bynex_documents d
    where d.organization_id = p_organization_id
      and d.id = p_document_id
      and (
        d.uploaded_by_user_id = p_user_id
        or private.has_organization_role(
          d.organization_id,
          array['owner','admin','office','manager','supervisor']::text[],
          p_user_id
        )
        or (
          d.context_type in ('project','change_order','customer_portal','general')
          and private.is_organization_member(d.organization_id, p_user_id)
          and (
            d.project_id is null
            or private.can_work_on_project(d.organization_id, d.project_id, p_user_id)
          )
        )
      )
  )
$$;

revoke all on function private.can_access_bynex_document(uuid, uuid, uuid)
  from public, anon, authenticated;

grant execute on function private.can_access_bynex_document(uuid, uuid, uuid)
  to authenticated;

create or replace function private.can_access_bynex_document_object(
  object_name text,
  p_user_id uuid default auth.uid()
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  path_parts text[] := string_to_array(object_name, '/');
  organization_id uuid;
  document_id uuid;
begin
  if cardinality(path_parts) <> 3 then return false; end if;
  begin
    organization_id := path_parts[1]::uuid;
    document_id := path_parts[2]::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  return private.can_access_bynex_document(
    organization_id,
    document_id,
    p_user_id
  );
end;
$$;

revoke all on function private.can_access_bynex_document_object(text, uuid)
  from public, anon, authenticated;
grant execute on function private.can_access_bynex_document_object(text, uuid)
  to authenticated;

alter table public.bynex_documents enable row level security;
alter table public.bynex_documents force row level security;
alter table public.bynex_document_analyses enable row level security;
alter table public.bynex_document_analyses force row level security;
alter table public.project_cost_entries enable row level security;
alter table public.project_cost_entries force row level security;

drop policy if exists bynex_documents_member_select on public.bynex_documents;
create policy bynex_documents_member_select
on public.bynex_documents for select to authenticated
using (
  private.can_access_bynex_document(
    organization_id,
    id,
    (select auth.uid())
  )
);

drop policy if exists bynex_documents_member_insert on public.bynex_documents;
create policy bynex_documents_member_insert
on public.bynex_documents for insert to authenticated
with check (
  uploaded_by_user_id = (select auth.uid())
  and private.is_organization_member(organization_id, (select auth.uid()))
  and (
    private.has_organization_role(
      organization_id,
      array['owner','admin','office','manager','supervisor']::text[],
      (select auth.uid())
    )
    or (
      uploaded_by_worker_id is not null
      and private.is_own_worker(
        organization_id,
        uploaded_by_worker_id,
        (select auth.uid())
      )
      and context_type in ('project','change_order','customer_portal','general')
      and (
        project_id is null
        or private.can_work_on_project(
          organization_id,
          project_id,
          (select auth.uid())
        )
      )
    )
  )
);

drop policy if exists bynex_documents_member_update on public.bynex_documents;
create policy bynex_documents_member_update
on public.bynex_documents for update to authenticated
using (
  private.can_access_bynex_document(
    organization_id,
    id,
    (select auth.uid())
  )
)
with check (
  private.can_access_bynex_document(
    organization_id,
    id,
    (select auth.uid())
  )
);

drop policy if exists bynex_documents_delete on public.bynex_documents;
create policy bynex_documents_delete
on public.bynex_documents for delete to authenticated
using (
  private.has_organization_role(
    organization_id,
    array['owner','admin','office','manager']::text[],
    (select auth.uid())
  )
  or (
    uploaded_by_user_id = (select auth.uid())
    and status in ('pending_upload','uploaded','failed')
  )
);

drop policy if exists bynex_document_analyses_select on public.bynex_document_analyses;
create policy bynex_document_analyses_select
on public.bynex_document_analyses for select to authenticated
using (
  private.can_access_bynex_document(
    organization_id,
    document_id,
    (select auth.uid())
  )
);

drop policy if exists bynex_document_analyses_insert on public.bynex_document_analyses;
create policy bynex_document_analyses_insert
on public.bynex_document_analyses for insert to authenticated
with check (
  private.can_access_bynex_document(
    organization_id,
    document_id,
    (select auth.uid())
  )
);

drop policy if exists bynex_document_analyses_update on public.bynex_document_analyses;
create policy bynex_document_analyses_update
on public.bynex_document_analyses for update to authenticated
using (
  private.can_access_bynex_document(
    organization_id,
    document_id,
    (select auth.uid())
  )
)
with check (
  private.can_access_bynex_document(
    organization_id,
    document_id,
    (select auth.uid())
  )
);

drop policy if exists project_cost_entries_finance_select on public.project_cost_entries;
create policy project_cost_entries_finance_select
on public.project_cost_entries for select to authenticated
using (
  private.has_organization_role(
    organization_id,
    array['owner','admin','office','manager']::text[],
    (select auth.uid())
  )
);

drop policy if exists project_cost_entries_finance_write on public.project_cost_entries;
create policy project_cost_entries_finance_write
on public.project_cost_entries for all to authenticated
using (
  private.has_organization_role(
    organization_id,
    array['owner','admin','office','manager']::text[],
    (select auth.uid())
  )
)
with check (
  private.has_organization_role(
    organization_id,
    array['owner','admin','office','manager']::text[],
    (select auth.uid())
  )
);

drop policy if exists bynex_documents_storage_select on storage.objects;
create policy bynex_documents_storage_select
on storage.objects for select to authenticated
using (
  bucket_id = 'bynex-documents'
  and private.can_access_bynex_document_object(name, (select auth.uid()))
);

drop policy if exists bynex_documents_storage_insert on storage.objects;
create policy bynex_documents_storage_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'bynex-documents'
  and private.can_access_bynex_document_object(name, (select auth.uid()))
);

drop policy if exists bynex_documents_storage_update on storage.objects;
create policy bynex_documents_storage_update
on storage.objects for update to authenticated
using (
  bucket_id = 'bynex-documents'
  and private.can_access_bynex_document_object(name, (select auth.uid()))
)
with check (
  bucket_id = 'bynex-documents'
  and private.can_access_bynex_document_object(name, (select auth.uid()))
);

drop policy if exists bynex_documents_storage_delete on storage.objects;
create policy bynex_documents_storage_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'bynex-documents'
  and private.can_access_bynex_document_object(name, (select auth.uid()))
);

revoke all on public.bynex_documents from public, anon, authenticated;
grant select, insert, update, delete on public.bynex_documents to authenticated;
revoke all on public.bynex_document_analyses from public, anon, authenticated;
grant select, insert, update on public.bynex_document_analyses to authenticated;
revoke all on public.project_cost_entries from public, anon, authenticated;
grant select, insert, update, delete on public.project_cost_entries to authenticated;

create or replace function public.apply_bynex_document_analysis(
  p_organization_id uuid,
  p_document_id uuid,
  p_project_id uuid default null,
  p_account_number text default null,
  p_vat_code text default null,
  p_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  document_row public.bynex_documents%rowtype;
  analysis_row public.bynex_document_analyses%rowtype;
  resolved_project_id uuid;
  resolved_description text;
  resolved_net numeric(16,2);
  resolved_vat numeric(16,2);
  resolved_total numeric(16,2);
  resolved_cost_type text;
  bookkeeping_document_id uuid;
  supplier_invoice_id uuid;
begin
  if actor_id is null or not private.has_organization_role(
    p_organization_id,
    array['owner','admin','office','manager']::text[],
    actor_id
  ) then
    raise exception 'Behörighet att godkänna dokumentunderlaget saknas'
      using errcode = '42501';
  end if;

  select * into document_row
  from public.bynex_documents
  where organization_id = p_organization_id
    and id = p_document_id
  for update;

  if document_row.id is null then
    raise exception 'Dokumentet hittades inte' using errcode = 'P0002';
  end if;

  select * into analysis_row
  from public.bynex_document_analyses
  where organization_id = p_organization_id
    and document_id = p_document_id
  for update;

  if analysis_row.id is null
     or analysis_row.analysis_status not in ('ready','needs_information')
     or analysis_row.proposal_status in ('rejected','applied') then
    raise exception 'Dokumentanalysen är inte klar för granskning'
      using errcode = '22023';
  end if;

  resolved_project_id := coalesce(
    p_project_id,
    analysis_row.suggested_project_id,
    document_row.project_id
  );

  if resolved_project_id is not null and not exists (
    select 1 from public.projects p
    where p.organization_id = p_organization_id
      and p.id = resolved_project_id
  ) then
    raise exception 'Det valda projektet finns inte i företaget'
      using errcode = '22023';
  end if;

  resolved_net := round(coalesce(
    analysis_row.net_amount,
    greatest(coalesce(analysis_row.total_amount, 0) - coalesce(analysis_row.vat_amount, 0), 0)
  ), 2);
  resolved_vat := round(coalesce(
    analysis_row.vat_amount,
    greatest(coalesce(analysis_row.total_amount, 0) - resolved_net, 0)
  ), 2);
  resolved_total := round(resolved_net + resolved_vat, 2);
  resolved_description := coalesce(
    nullif(btrim(p_description), ''),
    nullif(btrim(analysis_row.suggested_description), ''),
    document_row.title
  );
  resolved_cost_type := coalesce(analysis_row.suggested_cost_type, 'other');

  update public.bynex_document_analyses
  set proposal_status = 'approved',
      suggested_project_id = resolved_project_id,
      suggested_account_number = coalesce(
        nullif(btrim(p_account_number), ''),
        suggested_account_number
      ),
      suggested_vat_code = coalesce(
        nullif(btrim(p_vat_code), ''),
        suggested_vat_code
      ),
      suggested_description = resolved_description,
      reviewed_by_user_id = actor_id,
      reviewed_at = now(),
      updated_at = now()
  where organization_id = p_organization_id
    and document_id = p_document_id;

  if resolved_project_id is not null and resolved_total > 0
     and analysis_row.document_kind in (
       'receipt','supplier_invoice','delivery_note','other'
     ) then
    insert into public.project_cost_entries (
      organization_id,
      project_id,
      document_id,
      cost_type,
      supplier_name,
      description,
      occurred_on,
      currency,
      net_amount,
      vat_amount,
      total_amount,
      status,
      approved_by_user_id,
      approved_at
    ) values (
      p_organization_id,
      resolved_project_id,
      p_document_id,
      resolved_cost_type,
      analysis_row.counterparty_name,
      resolved_description,
      coalesce(analysis_row.document_date, current_date),
      analysis_row.currency,
      resolved_net,
      resolved_vat,
      resolved_total,
      'approved',
      actor_id,
      now()
    )
    on conflict (organization_id, document_id) do update set
      project_id = excluded.project_id,
      cost_type = excluded.cost_type,
      supplier_name = excluded.supplier_name,
      description = excluded.description,
      occurred_on = excluded.occurred_on,
      currency = excluded.currency,
      net_amount = excluded.net_amount,
      vat_amount = excluded.vat_amount,
      total_amount = excluded.total_amount,
      status = 'approved',
      approved_by_user_id = actor_id,
      approved_at = now(),
      updated_at = now();
  end if;

  if analysis_row.document_kind in (
    'receipt','supplier_invoice','customer_invoice','contract','other'
  ) then
    insert into public.bookkeeping_documents (
      organization_id,
      document_type,
      capture_source,
      storage_bucket,
      storage_path,
      original_filename,
      media_type,
      checksum_sha256,
      status,
      document_date,
      counterparty_name,
      currency,
      net_amount,
      vat_amount,
      total_amount,
      created_by_user_id
    ) values (
      p_organization_id,
      case analysis_row.document_kind
        when 'receipt' then 'receipt'
        when 'supplier_invoice' then 'supplier_invoice'
        when 'customer_invoice' then 'customer_invoice'
        when 'contract' then 'agreement'
        else 'other'
      end,
      case when document_row.source = 'camera' then 'camera' else 'upload' end,
      document_row.storage_bucket,
      document_row.storage_path,
      document_row.original_filename,
      document_row.mime_type,
      document_row.checksum_sha256,
      'review',
      analysis_row.document_date,
      analysis_row.counterparty_name,
      analysis_row.currency,
      resolved_net,
      resolved_vat,
      resolved_total,
      actor_id
    )
    on conflict (organization_id, checksum_sha256) do update set
      document_date = coalesce(excluded.document_date, public.bookkeeping_documents.document_date),
      counterparty_name = coalesce(excluded.counterparty_name, public.bookkeeping_documents.counterparty_name),
      currency = excluded.currency,
      net_amount = excluded.net_amount,
      vat_amount = excluded.vat_amount,
      total_amount = excluded.total_amount,
      status = case
        when public.bookkeeping_documents.status in ('booked','matched')
          then public.bookkeeping_documents.status
        else 'review'
      end,
      updated_at = now()
    returning id into bookkeeping_document_id;
  end if;

  supplier_invoice_id := document_row.supplier_invoice_id;
  if analysis_row.document_kind = 'supplier_invoice'
     and supplier_invoice_id is null then
    insert into public.supplier_invoices (
      organization_id,
      project_id,
      source,
      source_reference,
      invoice_kind,
      invoice_number,
      invoice_date,
      due_date,
      currency,
      net_amount,
      vat_amount,
      total_amount,
      amount_due,
      status,
      raw_metadata
    ) values (
      p_organization_id,
      resolved_project_id,
      'upload',
      'bynex-document:' || p_document_id::text,
      'invoice',
      analysis_row.document_number,
      analysis_row.document_date,
      analysis_row.due_date,
      analysis_row.currency,
      resolved_net,
      resolved_vat,
      resolved_total,
      resolved_total,
      'review',
      jsonb_build_object(
        'bynex_document_id', p_document_id,
        'counterparty_name', analysis_row.counterparty_name,
        'analysis_confidence', analysis_row.confidence
      )
    ) returning id into supplier_invoice_id;
  end if;

  if bookkeeping_document_id is not null and supplier_invoice_id is not null then
    update public.bookkeeping_documents
    set supplier_invoice_id = supplier_invoice_id,
        updated_at = now()
    where organization_id = p_organization_id
      and id = bookkeeping_document_id;
  end if;

  update public.bynex_documents
  set project_id = resolved_project_id,
      bookkeeping_document_id = coalesce(
        bookkeeping_document_id,
        document_row.bookkeeping_document_id
      ),
      supplier_invoice_id = coalesce(
        supplier_invoice_id,
        document_row.supplier_invoice_id
      ),
      status = 'reviewed',
      updated_at = now()
  where organization_id = p_organization_id
    and id = p_document_id;

  update public.bynex_document_analyses
  set proposal_status = 'applied',
      updated_at = now()
  where organization_id = p_organization_id
    and document_id = p_document_id;

  return jsonb_build_object(
    'document_id', p_document_id,
    'project_id', resolved_project_id,
    'bookkeeping_document_id', bookkeeping_document_id,
    'supplier_invoice_id', supplier_invoice_id,
    'project_cost_applied', resolved_project_id is not null and resolved_total > 0
  );
end;
$$;

revoke all on function public.apply_bynex_document_analysis(
  uuid, uuid, uuid, text, text, text
) from public, anon;
grant execute on function public.apply_bynex_document_analysis(
  uuid, uuid, uuid, text, text, text
) to authenticated, service_role;

create or replace view public.project_document_cost_summary
with (security_invoker = true)
as
select
  pce.organization_id,
  pce.project_id,
  count(*) filter (where pce.status in ('approved','booked')) as document_cost_count,
  coalesce(sum(pce.net_amount) filter (where pce.status in ('approved','booked')), 0)::numeric(16,2) as document_cost_ex_vat,
  coalesce(sum(pce.vat_amount) filter (where pce.status in ('approved','booked')), 0)::numeric(16,2) as document_vat_amount,
  coalesce(sum(pce.total_amount) filter (where pce.status in ('approved','booked')), 0)::numeric(16,2) as document_cost_inc_vat
from public.project_cost_entries pce
group by pce.organization_id, pce.project_id;

grant select on public.project_document_cost_summary to authenticated;

comment on table public.bynex_documents is
  'Universal tenant-isolated upload registry used by invoice, quote, ÄTA, project, customer portal, property binder and bookkeeping flows.';
comment on table public.bynex_document_analyses is
  'Bynex Smart proposals extracted from documents. Proposals are advisory until a permitted human applies them.';
comment on table public.project_cost_entries is
  'Human-approved project costs originating from uploaded Bynex documents.';

select pg_notify('pgrst', 'reload schema');

commit;
