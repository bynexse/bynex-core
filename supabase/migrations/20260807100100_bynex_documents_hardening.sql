begin;

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
        or (
          d.context_type in ('bookkeeping','supplier_invoice','customer_invoice')
          and private.has_organization_role(
            d.organization_id,
            array['owner','admin','office','manager']::text[],
            p_user_id
          )
        )
        or (
          d.context_type not in ('bookkeeping','supplier_invoice','customer_invoice')
          and private.has_organization_role(
            d.organization_id,
            array['owner','admin','office','manager','supervisor']::text[],
            p_user_id
          )
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

drop policy if exists bynex_documents_member_insert on public.bynex_documents;
create policy bynex_documents_member_insert
on public.bynex_documents for insert to authenticated
with check (
  uploaded_by_user_id = (select auth.uid())
  and private.is_organization_member(organization_id, (select auth.uid()))
  and (
    private.has_organization_role(
      organization_id,
      array['owner','admin','office','manager']::text[],
      (select auth.uid())
    )
    or (
      context_type not in ('bookkeeping','supplier_invoice','customer_invoice')
      and private.has_organization_role(
        organization_id,
        array['supervisor']::text[],
        (select auth.uid())
      )
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
  v_actor_id uuid := (select auth.uid());
  v_document public.bynex_documents%rowtype;
  v_analysis public.bynex_document_analyses%rowtype;
  v_project_id uuid;
  v_description text;
  v_net numeric(16,2);
  v_vat numeric(16,2);
  v_total numeric(16,2);
  v_cost_type text;
  v_bookkeeping_document_id uuid;
  v_supplier_invoice_id uuid;
begin
  if v_actor_id is null or not private.has_organization_role(
    p_organization_id,
    array['owner','admin','office','manager']::text[],
    v_actor_id
  ) then
    raise exception 'Behörighet att godkänna dokumentunderlaget saknas'
      using errcode = '42501';
  end if;

  select d.* into v_document
  from public.bynex_documents d
  where d.organization_id = p_organization_id
    and d.id = p_document_id
  for update;

  if v_document.id is null then
    raise exception 'Dokumentet hittades inte' using errcode = 'P0002';
  end if;

  select a.* into v_analysis
  from public.bynex_document_analyses a
  where a.organization_id = p_organization_id
    and a.document_id = p_document_id
  for update;

  if v_analysis.id is null
     or v_analysis.analysis_status not in ('ready','needs_information')
     or v_analysis.proposal_status in ('rejected','applied') then
    raise exception 'Dokumentanalysen är inte klar för granskning'
      using errcode = '22023';
  end if;

  v_project_id := coalesce(
    p_project_id,
    v_analysis.suggested_project_id,
    v_document.project_id
  );

  if v_project_id is not null and not exists (
    select 1
    from public.projects p
    where p.organization_id = p_organization_id
      and p.id = v_project_id
  ) then
    raise exception 'Det valda projektet finns inte i företaget'
      using errcode = '22023';
  end if;

  v_net := round(coalesce(
    v_analysis.net_amount,
    greatest(
      coalesce(v_analysis.total_amount, 0) - coalesce(v_analysis.vat_amount, 0),
      0
    )
  ), 2);
  v_vat := round(coalesce(
    v_analysis.vat_amount,
    greatest(coalesce(v_analysis.total_amount, 0) - v_net, 0)
  ), 2);
  v_total := round(v_net + v_vat, 2);
  v_description := coalesce(
    nullif(btrim(p_description), ''),
    nullif(btrim(v_analysis.suggested_description), ''),
    v_document.title
  );
  v_cost_type := coalesce(v_analysis.suggested_cost_type, 'other');

  update public.bynex_document_analyses a
  set proposal_status = 'approved',
      suggested_project_id = v_project_id,
      suggested_account_number = coalesce(
        nullif(btrim(p_account_number), ''),
        a.suggested_account_number
      ),
      suggested_vat_code = coalesce(
        nullif(btrim(p_vat_code), ''),
        a.suggested_vat_code
      ),
      suggested_description = v_description,
      reviewed_by_user_id = v_actor_id,
      reviewed_at = now(),
      updated_at = now()
  where a.organization_id = p_organization_id
    and a.document_id = p_document_id;

  if v_project_id is not null
     and v_total > 0
     and v_analysis.document_kind in (
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
      v_project_id,
      p_document_id,
      v_cost_type,
      v_analysis.counterparty_name,
      v_description,
      coalesce(v_analysis.document_date, current_date),
      v_analysis.currency,
      v_net,
      v_vat,
      v_total,
      'approved',
      v_actor_id,
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
      approved_by_user_id = v_actor_id,
      approved_at = now(),
      updated_at = now();
  end if;

  if v_analysis.document_kind in (
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
      case v_analysis.document_kind
        when 'receipt' then 'receipt'
        when 'supplier_invoice' then 'supplier_invoice'
        when 'customer_invoice' then 'customer_invoice'
        when 'contract' then 'agreement'
        else 'other'
      end,
      case when v_document.source = 'camera' then 'camera' else 'upload' end,
      v_document.storage_bucket,
      v_document.storage_path,
      v_document.original_filename,
      v_document.mime_type,
      v_document.checksum_sha256,
      'review',
      v_analysis.document_date,
      v_analysis.counterparty_name,
      v_analysis.currency,
      v_net,
      v_vat,
      v_total,
      v_actor_id
    )
    on conflict (organization_id, checksum_sha256) do update set
      document_date = coalesce(excluded.document_date, bookkeeping_documents.document_date),
      counterparty_name = coalesce(excluded.counterparty_name, bookkeeping_documents.counterparty_name),
      currency = excluded.currency,
      net_amount = excluded.net_amount,
      vat_amount = excluded.vat_amount,
      total_amount = excluded.total_amount,
      status = case
        when bookkeeping_documents.status in ('booked','matched')
          then bookkeeping_documents.status
        else 'review'
      end,
      updated_at = now()
    returning id into v_bookkeeping_document_id;
  end if;

  v_supplier_invoice_id := v_document.supplier_invoice_id;
  if (
    v_analysis.document_kind = 'supplier_invoice'
    or v_document.context_type = 'supplier_invoice'
  ) and v_supplier_invoice_id is null then
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
      v_project_id,
      'upload',
      'bynex-document:' || p_document_id::text,
      'invoice',
      v_analysis.document_number,
      v_analysis.document_date,
      v_analysis.due_date,
      v_analysis.currency,
      v_net,
      v_vat,
      v_total,
      v_total,
      'review',
      jsonb_build_object(
        'bynex_document_id', p_document_id,
        'counterparty_name', v_analysis.counterparty_name,
        'analysis_confidence', v_analysis.confidence
      )
    ) returning id into v_supplier_invoice_id;
  end if;

  if v_bookkeeping_document_id is not null
     and v_supplier_invoice_id is not null then
    update public.bookkeeping_documents bd
    set supplier_invoice_id = v_supplier_invoice_id,
        updated_at = now()
    where bd.organization_id = p_organization_id
      and bd.id = v_bookkeeping_document_id;
  end if;

  update public.bynex_documents d
  set project_id = v_project_id,
      bookkeeping_document_id = coalesce(
        v_bookkeeping_document_id,
        v_document.bookkeeping_document_id
      ),
      supplier_invoice_id = coalesce(
        v_supplier_invoice_id,
        v_document.supplier_invoice_id
      ),
      status = 'reviewed',
      updated_at = now()
  where d.organization_id = p_organization_id
    and d.id = p_document_id;

  update public.bynex_document_analyses a
  set proposal_status = 'applied',
      updated_at = now()
  where a.organization_id = p_organization_id
    and a.document_id = p_document_id;

  return jsonb_build_object(
    'document_id', p_document_id,
    'project_id', v_project_id,
    'bookkeeping_document_id', v_bookkeeping_document_id,
    'supplier_invoice_id', v_supplier_invoice_id,
    'project_cost_applied', v_project_id is not null and v_total > 0
  );
end;
$$;

revoke all on function public.apply_bynex_document_analysis(
  uuid, uuid, uuid, text, text, text
) from public, anon;
grant execute on function public.apply_bynex_document_analysis(
  uuid, uuid, uuid, text, text, text
) to authenticated, service_role;

select pg_notify('pgrst', 'reload schema');

commit;
