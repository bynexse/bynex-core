begin;

create or replace function public.book_supplier_invoice_one_click_safe(
  p_organization_id uuid,
  p_supplier_invoice_id uuid
)
returns table(
  supplier_invoice_id uuid,
  voucher_id uuid,
  voucher_number text,
  smart_confidence numeric,
  used_account_number text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := (select auth.uid());
  v_invoice public.supplier_invoices;
begin
  if v_actor_user_id is null or not private.has_organization_role(
    p_organization_id,
    array['owner','admin','office']::text[],
    v_actor_user_id
  ) then
    raise exception 'Ekonomibehörighet krävs' using errcode = '42501';
  end if;

  select * into v_invoice
  from public.supplier_invoices invoice
  where invoice.organization_id = p_organization_id
    and invoice.id = p_supplier_invoice_id
  for update;

  if v_invoice.id is null then
    raise exception 'Leverantörsfakturan hittades inte' using errcode = 'P0002';
  end if;

  if v_invoice.invoice_kind <> 'invoice' then
    raise exception 'Kreditnotor kräver ett separat korrigeringsflöde'
      using errcode = '23514';
  end if;

  if v_invoice.currency <> 'SEK' then
    raise exception 'Fakturor i utländsk valuta kräver valutakurs och separat kontroll'
      using errcode = '23514';
  end if;

  if coalesce(v_invoice.net_amount, 0) <= 0 then
    raise exception 'Ett positivt nettobelopp krävs för enklicksbokföring'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.bookkeeping_documents document
    where document.organization_id = p_organization_id
      and document.supplier_invoice_id = p_supplier_invoice_id
      and document.duplicate_of_document_id is not null
  ) then
    raise exception 'Originalunderlaget är markerat som dubblett'
      using errcode = '23514';
  end if;

  return query
  select *
  from public.book_supplier_invoice_one_click(
    p_organization_id,
    p_supplier_invoice_id
  );
end;
$$;

create or replace function public.review_and_book_supplier_invoice_one_click(
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
returns table(
  supplier_invoice_id uuid,
  voucher_id uuid,
  voucher_number text,
  smart_confidence numeric,
  used_account_number text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.review_supplier_invoice(
    p_organization_id,
    p_supplier_invoice_id,
    p_supplier_id,
    p_project_id,
    p_invoice_number,
    p_invoice_date,
    p_due_date,
    p_currency,
    p_net_amount,
    p_vat_amount,
    p_total_amount,
    p_ocr_reference,
    p_purchase_order_reference,
    p_project_reference
  );

  return query
  select *
  from public.book_supplier_invoice_one_click_safe(
    p_organization_id,
    p_supplier_invoice_id
  );
end;
$$;

revoke all on function public.book_supplier_invoice_one_click(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.book_supplier_invoice_one_click_safe(uuid, uuid)
  from public, anon;
revoke all on function public.review_and_book_supplier_invoice_one_click(
  uuid, uuid, uuid, uuid, text, date, date, text, numeric, numeric, numeric,
  text, text, text
) from public, anon;
grant execute on function public.book_supplier_invoice_one_click_safe(uuid, uuid)
  to authenticated;
grant execute on function public.review_and_book_supplier_invoice_one_click(
  uuid, uuid, uuid, uuid, text, date, date, text, numeric, numeric, numeric,
  text, text, text
) to authenticated;

comment on function public.book_supplier_invoice_one_click_safe(uuid, uuid) is
  'Public one-click entry point. It blocks credit notes, foreign currency and duplicate source documents before the atomic posting function runs.';

select pg_notify('pgrst', 'reload schema');

commit;
