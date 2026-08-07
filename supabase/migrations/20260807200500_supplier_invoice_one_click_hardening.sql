begin;

create or replace function private.create_supplier_invoice_voucher_draft()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.organization_bookkeeping_settings;
  v_period record;
  v_voucher_id uuid;
  v_line_number integer := 1;
begin
  if new.status <> 'approved'
     or (tg_op = 'UPDATE' and old.status = 'approved') then
    return new;
  end if;

  select * into v_settings
  from public.organization_bookkeeping_settings settings
  where settings.organization_id = new.organization_id
    and settings.enabled
    and settings.auto_create_supplier_invoice_vouchers;

  if v_settings.organization_id is null
     or new.invoice_date is null
     or new.total_amount is null
     or new.net_amount is null
     or new.vat_amount is null then
    return new;
  end if;

  select * into v_period
  from private.find_open_bookkeeping_period(
    new.organization_id,
    new.invoice_date
  );

  if v_period.fiscal_year_id is null or v_period.period_id is null then
    return new;
  end if;

  insert into public.bookkeeping_vouchers(
    organization_id,
    fiscal_year_id,
    period_id,
    voucher_date,
    source_type,
    source_id,
    description,
    status,
    bynex_smart_assisted,
    created_by_user_id
  ) values (
    new.organization_id,
    v_period.fiscal_year_id,
    v_period.period_id,
    new.invoice_date,
    'supplier_invoice',
    new.id,
    'Leverantörsfaktura ' || coalesce(new.invoice_number, new.id::text),
    'review',
    true,
    new.approved_by_user_id
  )
  on conflict (organization_id, source_type, source_id) do nothing
  returning id into v_voucher_id;

  if v_voucher_id is null then
    return new;
  end if;

  insert into public.bookkeeping_voucher_lines(
    organization_id,
    voucher_id,
    line_number,
    account_id,
    description,
    debit_amount,
    credit_amount,
    project_id
  ) values (
    new.organization_id,
    v_voucher_id,
    v_line_number,
    private.bookkeeping_account_id(
      new.organization_id,
      v_settings.default_expense_account
    ),
    'Kostnad',
    new.net_amount,
    0,
    new.project_id
  );
  v_line_number := v_line_number + 1;

  if new.vat_amount > 0 then
    insert into public.bookkeeping_voucher_lines(
      organization_id,
      voucher_id,
      line_number,
      account_id,
      description,
      debit_amount,
      credit_amount
    ) values (
      new.organization_id,
      v_voucher_id,
      v_line_number,
      private.bookkeeping_account_id(
        new.organization_id,
        v_settings.input_vat_account
      ),
      'Ingående moms',
      new.vat_amount,
      0
    );
    v_line_number := v_line_number + 1;
  end if;

  insert into public.bookkeeping_voucher_lines(
    organization_id,
    voucher_id,
    line_number,
    account_id,
    description,
    debit_amount,
    credit_amount
  ) values (
    new.organization_id,
    v_voucher_id,
    v_line_number,
    private.bookkeeping_account_id(
      new.organization_id,
      v_settings.default_supplier_payable_account
    ),
    'Leverantörsskuld',
    0,
    new.total_amount
  );

  return new;
end;
$$;

revoke all on function private.create_supplier_invoice_voucher_draft()
  from public, anon, authenticated;

create or replace function public.book_supplier_invoice_one_click(
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
  v_settings public.organization_bookkeeping_settings;
  v_voucher public.bookkeeping_vouchers;
  v_period record;
  v_analysis public.bynex_document_analyses;
  v_expense_account_number text;
  v_expense_account_id uuid;
  v_description text;
  v_voucher_number text;
  v_smart_confidence numeric := 0;
  v_line_number integer := 1;
  v_metadata_confidence text;
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

  select * into v_voucher
  from public.bookkeeping_vouchers voucher
  where voucher.organization_id = p_organization_id
    and voucher.source_type = 'supplier_invoice'
    and voucher.source_id = p_supplier_invoice_id
  for update;

  if v_voucher.id is not null and v_voucher.status = 'posted' then
    update public.bookkeeping_documents
    set status = 'booked',
        voucher_id = v_voucher.id,
        updated_at = statement_timestamp()
    where organization_id = p_organization_id
      and supplier_invoice_id = p_supplier_invoice_id
      and status <> 'booked';

    return query select
      v_invoice.id,
      v_voucher.id,
      v_voucher.voucher_number,
      v_voucher.suggestion_confidence,
      (
        select account.account_number
        from public.bookkeeping_voucher_lines line
        join public.ledger_accounts account
          on account.organization_id = line.organization_id
         and account.id = line.account_id
        where line.organization_id = p_organization_id
          and line.voucher_id = v_voucher.id
          and line.line_number = 1
      );
    return;
  end if;

  if v_invoice.status not in ('review','matched','approved') then
    raise exception 'Underlaget måste vara granskat innan enklicksbokföring'
      using errcode = '23514';
  end if;

  if v_invoice.duplicate_of_invoice_id is not null
     or v_invoice.status in ('duplicate','rejected','exported') then
    raise exception 'Dubbletter, avvisade eller exporterade underlag kan inte enklicksbokföras'
      using errcode = '23514';
  end if;

  if v_invoice.supplier_id is null
     or nullif(btrim(coalesce(v_invoice.invoice_number, '')), '') is null
     or v_invoice.invoice_date is null
     or v_invoice.due_date is null
     or v_invoice.net_amount is null
     or v_invoice.vat_amount is null
     or v_invoice.total_amount is null then
    raise exception 'Leverantör, fakturanummer, datum och kompletta belopp krävs'
      using errcode = '23514';
  end if;

  if v_invoice.due_date < v_invoice.invoice_date then
    raise exception 'Förfallodatum kan inte ligga före fakturadatum'
      using errcode = '23514';
  end if;

  if v_invoice.net_amount < 0
     or v_invoice.vat_amount < 0
     or v_invoice.total_amount <= 0
     or abs(v_invoice.total_amount - v_invoice.net_amount - v_invoice.vat_amount) > 0.02 then
    raise exception 'Totalbeloppet måste motsvara netto plus moms'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.supplier_invoices other_invoice
    where other_invoice.organization_id = p_organization_id
      and other_invoice.id <> p_supplier_invoice_id
      and other_invoice.supplier_id = v_invoice.supplier_id
      and lower(btrim(coalesce(other_invoice.invoice_number, ''))) =
          lower(btrim(v_invoice.invoice_number))
      and other_invoice.currency = v_invoice.currency
      and abs(coalesce(other_invoice.total_amount, 0) - v_invoice.total_amount) <= 0.02
      and other_invoice.status not in ('duplicate','rejected')
  ) then
    raise exception 'En möjlig dubblett med samma leverantör, fakturanummer och belopp finns'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.supplier_invoice_files file
    where file.organization_id = p_organization_id
      and file.supplier_invoice_id = p_supplier_invoice_id
  ) then
    raise exception 'Originalunderlaget saknas' using errcode = '23514';
  end if;

  select * into v_settings
  from public.organization_bookkeeping_settings settings
  where settings.organization_id = p_organization_id
    and settings.enabled;

  if v_settings.organization_id is null then
    raise exception 'Bynex Bokföring måste vara aktiverat'
      using errcode = '23514';
  end if;

  select analysis.* into v_analysis
  from public.supplier_invoice_files file
  join public.bynex_document_analyses analysis
    on analysis.organization_id = file.organization_id
   and analysis.document_id = file.bynex_document_id
  where file.organization_id = p_organization_id
    and file.supplier_invoice_id = p_supplier_invoice_id
    and analysis.analysis_status in ('ready','needs_information')
  order by
    case
      when analysis.id::text = v_invoice.raw_metadata ->> 'bynex_smart_analysis_id'
        then 0
      else 1
    end,
    analysis.reviewed_at desc nulls last,
    analysis.created_at desc
  limit 1;

  v_metadata_confidence := nullif(
    btrim(v_invoice.raw_metadata ->> 'smart_confidence'),
    ''
  );
  v_smart_confidence := coalesce(
    v_analysis.confidence,
    case
      when v_metadata_confidence ~ '^(0(\.[0-9]+)?|1(\.0+)?)$'
        then v_metadata_confidence::numeric
      else null
    end,
    0
  );

  v_expense_account_number := coalesce(
    nullif(btrim(v_analysis.suggested_account_number), ''),
    nullif(btrim(v_invoice.raw_metadata ->> 'suggested_account_number'), ''),
    v_settings.default_expense_account
  );

  select account.id, account.account_number
  into v_expense_account_id, v_expense_account_number
  from public.ledger_accounts account
  where account.organization_id = p_organization_id
    and account.account_number = v_expense_account_number
    and account.active
    and account.account_type in ('asset','expense')
    and account.account_number not in (
      v_settings.input_vat_account,
      v_settings.default_supplier_payable_account
    )
  limit 1;

  if v_expense_account_id is null then
    v_expense_account_number := v_settings.default_expense_account;
    v_expense_account_id := private.bookkeeping_account_id(
      p_organization_id,
      v_expense_account_number
    );
  end if;

  v_description := left(
    coalesce(
      nullif(btrim(v_analysis.suggested_description), ''),
      nullif(btrim(v_invoice.raw_metadata ->> 'suggested_description'), ''),
      'Leverantörsfaktura ' || v_invoice.invoice_number
    ),
    1000
  );

  if v_invoice.status <> 'approved' then
    perform public.approve_supplier_invoice(
      p_organization_id,
      p_supplier_invoice_id
    );

    select * into v_invoice
    from public.supplier_invoices invoice
    where invoice.organization_id = p_organization_id
      and invoice.id = p_supplier_invoice_id
    for update;
  end if;

  select * into v_voucher
  from public.bookkeeping_vouchers voucher
  where voucher.organization_id = p_organization_id
    and voucher.source_type = 'supplier_invoice'
    and voucher.source_id = p_supplier_invoice_id
  for update;

  if v_voucher.id is null then
    select * into v_period
    from private.find_open_bookkeeping_period(
      p_organization_id,
      v_invoice.invoice_date
    );

    if v_period.fiscal_year_id is null or v_period.period_id is null then
      raise exception 'Ingen öppen bokföringsperiod finns för fakturadatumet'
        using errcode = '23514';
    end if;

    insert into public.bookkeeping_vouchers(
      organization_id,
      fiscal_year_id,
      period_id,
      voucher_date,
      source_type,
      source_id,
      description,
      status,
      bynex_smart_assisted,
      suggestion_confidence,
      created_by_user_id
    ) values (
      p_organization_id,
      v_period.fiscal_year_id,
      v_period.period_id,
      v_invoice.invoice_date,
      'supplier_invoice',
      p_supplier_invoice_id,
      v_description,
      'review',
      true,
      v_smart_confidence,
      v_actor_user_id
    )
    returning * into v_voucher;

    insert into public.bookkeeping_voucher_lines(
      organization_id,
      voucher_id,
      line_number,
      account_id,
      description,
      debit_amount,
      credit_amount,
      project_id,
      tax_code
    ) values (
      p_organization_id,
      v_voucher.id,
      v_line_number,
      v_expense_account_id,
      left(coalesce(v_description, 'Kostnad'), 1000),
      v_invoice.net_amount,
      0,
      v_invoice.project_id,
      coalesce(
        nullif(btrim(v_analysis.suggested_vat_code), ''),
        nullif(btrim(v_invoice.raw_metadata ->> 'suggested_vat_code'), '')
      )
    );
    v_line_number := v_line_number + 1;

    if v_invoice.vat_amount > 0 then
      insert into public.bookkeeping_voucher_lines(
        organization_id,
        voucher_id,
        line_number,
        account_id,
        description,
        debit_amount,
        credit_amount
      ) values (
        p_organization_id,
        v_voucher.id,
        v_line_number,
        private.bookkeeping_account_id(
          p_organization_id,
          v_settings.input_vat_account
        ),
        'Ingående moms',
        v_invoice.vat_amount,
        0
      );
      v_line_number := v_line_number + 1;
    end if;

    insert into public.bookkeeping_voucher_lines(
      organization_id,
      voucher_id,
      line_number,
      account_id,
      description,
      debit_amount,
      credit_amount
    ) values (
      p_organization_id,
      v_voucher.id,
      v_line_number,
      private.bookkeeping_account_id(
        p_organization_id,
        v_settings.default_supplier_payable_account
      ),
      'Leverantörsskuld',
      0,
      v_invoice.total_amount
    );
  elsif v_voucher.status not in ('draft','review') then
    raise exception 'Det befintliga verifikationsutkastet kan inte bokföras i nuvarande status'
      using errcode = '23514';
  else
    update public.bookkeeping_vouchers
    set description = v_description,
        bynex_smart_assisted = true,
        suggestion_confidence = v_smart_confidence,
        reviewed_by_user_id = v_actor_user_id,
        reviewed_at = statement_timestamp(),
        updated_at = statement_timestamp()
    where organization_id = p_organization_id
      and id = v_voucher.id;

    update public.bookkeeping_voucher_lines
    set account_id = v_expense_account_id,
        description = left(coalesce(v_description, description, 'Kostnad'), 1000),
        project_id = v_invoice.project_id,
        tax_code = coalesce(
          nullif(btrim(v_analysis.suggested_vat_code), ''),
          nullif(btrim(v_invoice.raw_metadata ->> 'suggested_vat_code'), ''),
          tax_code
        ),
        updated_at = statement_timestamp()
    where organization_id = p_organization_id
      and voucher_id = v_voucher.id
      and line_number = 1;
  end if;

  v_voucher_number := public.post_bookkeeping_voucher(
    p_organization_id,
    v_voucher.id
  );

  update public.bookkeeping_documents
  set status = 'booked',
      voucher_id = v_voucher.id,
      updated_at = statement_timestamp()
  where organization_id = p_organization_id
    and supplier_invoice_id = p_supplier_invoice_id;

  update public.supplier_invoices
  set raw_metadata = coalesce(raw_metadata, '{}'::jsonb) || jsonb_build_object(
        'one_click_booked_by_user_id', v_actor_user_id,
        'one_click_booked_at', statement_timestamp(),
        'bookkeeping_voucher_id', v_voucher.id,
        'bookkeeping_voucher_number', v_voucher_number,
        'bookkeeping_account_number', v_expense_account_number,
        'bookkeeping_smart_confidence', v_smart_confidence
      ),
      updated_at = statement_timestamp()
  where organization_id = p_organization_id
    and id = p_supplier_invoice_id;

  return query select
    p_supplier_invoice_id,
    v_voucher.id,
    v_voucher_number,
    v_smart_confidence,
    v_expense_account_number;
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
  from public.book_supplier_invoice_one_click(
    p_organization_id,
    p_supplier_invoice_id
  );
end;
$$;

revoke all on function public.book_supplier_invoice_one_click(uuid, uuid)
  from public, anon;
revoke all on function public.review_and_book_supplier_invoice_one_click(
  uuid, uuid, uuid, uuid, text, date, date, text, numeric, numeric, numeric,
  text, text, text
) from public, anon;
grant execute on function public.book_supplier_invoice_one_click(uuid, uuid)
  to authenticated;
grant execute on function public.review_and_book_supplier_invoice_one_click(
  uuid, uuid, uuid, uuid, text, date, date, text, numeric, numeric, numeric,
  text, text, text
) to authenticated;

comment on function public.review_and_book_supplier_invoice_one_click(
  uuid, uuid, uuid, uuid, text, date, date, text, numeric, numeric, numeric,
  text, text, text
) is
  'Validates the visible supplier invoice fields and posts the invoice in one atomic human action.';

select pg_notify('pgrst', 'reload schema');

commit;
