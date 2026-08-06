begin;

alter table public.subscription_invoices
  add column document_type text not null default 'invoice'
    check (document_type in ('invoice','credit_note')),
  add column credited_invoice_id uuid references public.subscription_invoices(id) on delete restrict,
  add column credit_reason text,
  add constraint subscription_invoices_credit_source_check check (
    (document_type = 'invoice' and credited_invoice_id is null)
    or (document_type = 'credit_note' and credited_invoice_id is not null)
  );

create index subscription_invoices_credit_source_idx
  on public.subscription_invoices (credited_invoice_id, status, created_at desc)
  where credited_invoice_id is not null;

create table public.platform_subscription_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  invoice_id uuid not null references public.subscription_invoices(id) on delete restrict,
  payment_date date not null default current_date,
  amount numeric(14,2) not null check (amount > 0),
  reference text not null check (char_length(btrim(reference)) between 2 and 240),
  reason text not null check (char_length(btrim(reason)) between 3 and 2000),
  accounting_event_id uuid not null unique references private.billing_accounting_events(id) on delete restrict,
  created_by_user_id uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, invoice_id)
    references public.subscription_invoices(organization_id, id) on delete restrict
);

create index platform_subscription_payments_invoice_idx
  on public.platform_subscription_payments (invoice_id, payment_date desc, created_at desc);

alter table public.platform_subscription_payments enable row level security;
revoke all on public.platform_subscription_payments from public, anon, authenticated;

alter table private.billing_accounting_events
  drop constraint if exists billing_accounting_events_event_type_invoice_id_key;

create unique index billing_accounting_events_single_document_event_idx
  on private.billing_accounting_events (event_type, invoice_id)
  where event_type in ('invoice_issued','credit_issued');

create index billing_accounting_events_payment_invoice_idx
  on private.billing_accounting_events (invoice_id, event_date, created_at)
  where event_type = 'payment_received';

create or replace function private.guard_subscription_invoice_document_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.document_type is distinct from old.document_type
    or new.credited_invoice_id is distinct from old.credited_invoice_id
    or new.credit_reason is distinct from old.credit_reason then
    raise exception 'Fakturadokumentets typ och kreditkoppling är låsta'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_subscription_invoice_document_fields()
  from public, anon, authenticated;
create trigger guard_subscription_invoice_document_fields
  before update on public.subscription_invoices
  for each row execute function private.guard_subscription_invoice_document_fields();

create or replace function public.get_platform_hq_billing(requested_organization_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_staff(array['platform_owner','platform_admin','sales','support','finance','read_only']) then
    raise exception 'Platform staff access required' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'discounts', coalesce((
      select jsonb_agg(to_jsonb(discount) order by discount.created_at desc)
      from public.platform_subscription_discounts discount
      where requested_organization_id is null
        or discount.organization_id = requested_organization_id
    ), '[]'::jsonb),
    'manual_charges', coalesce((
      select jsonb_agg(to_jsonb(charge) order by charge.created_at desc)
      from public.platform_manual_subscription_charges charge
      where requested_organization_id is null
        or charge.organization_id = requested_organization_id
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(to_jsonb(payment) order by payment.payment_date desc, payment.created_at desc)
      from public.platform_subscription_payments payment
      where requested_organization_id is null
        or payment.organization_id = requested_organization_id
    ), '[]'::jsonb),
    'credit_notes', coalesce((
      select jsonb_agg(to_jsonb(invoice) order by invoice.invoice_date desc, invoice.created_at desc)
      from public.subscription_invoices invoice
      where invoice.document_type = 'credit_note'
        and (requested_organization_id is null
          or invoice.organization_id = requested_organization_id)
    ), '[]'::jsonb),
    'delivery_jobs', coalesce((
      select jsonb_agg(to_jsonb(job) order by job.created_at desc)
      from (
        select candidate.*
        from public.subscription_invoice_delivery_jobs candidate
        where requested_organization_id is null
          or candidate.organization_id = requested_organization_id
        order by candidate.created_at desc
        limit 300
      ) job
    ), '[]'::jsonb),
    'organization_balances', coalesce((
      select jsonb_agg(to_jsonb(balance) order by balance.outstanding_inc_vat desc, balance.organization_id)
      from (
        select organization.id as organization_id,
          coalesce(sum(
            case
              when invoice.id is null or invoice.document_type <> 'invoice'
                or invoice.status in ('void','credited') then 0
              else greatest(
                invoice.amount_inc_vat
                  - invoice.amount_paid
                  - coalesce(credit.total_inc_vat, 0),
                0
              )
            end
          ), 0) as outstanding_inc_vat
        from public.organizations organization
        left join public.subscription_invoices invoice
          on invoice.organization_id = organization.id
        left join lateral (
          select coalesce(sum(note.amount_inc_vat), 0) as total_inc_vat
          from public.subscription_invoices note
          where note.document_type = 'credit_note'
            and note.credited_invoice_id = invoice.id
            and note.status <> 'void'
        ) credit on true
        where requested_organization_id is null
          or organization.id = requested_organization_id
        group by organization.id
      ) balance
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.platform_record_subscription_payment(
  p_invoice_id uuid,
  p_amount numeric,
  p_reason text
)
returns public.subscription_invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  invoice public.subscription_invoices;
  updated_invoice public.subscription_invoices;
  issuer private.billing_legal_entities;
  accounting_event_id uuid;
  payment_id uuid;
  credited_amount numeric(14,2);
  outstanding_amount numeric(14,2);
  new_paid numeric(14,2);
  new_status text;
begin
  if not private.is_platform_staff(array['platform_owner','platform_admin','finance']) then
    raise exception 'Platform payment access required' using errcode = '42501';
  end if;
  if p_amount <= 0 or char_length(btrim(p_reason)) < 3 then
    raise exception 'Amount and reason required' using errcode = '22023';
  end if;

  select * into invoice
  from public.subscription_invoices
  where id = p_invoice_id
  for update;

  if invoice.id is null then
    raise exception 'Invoice not found' using errcode = 'P0002';
  end if;
  if invoice.document_type <> 'invoice'
    or invoice.status in ('void','credited') then
    raise exception 'Invoice cannot receive payment' using errcode = '23514';
  end if;

  select coalesce(sum(note.amount_inc_vat), 0)
  into credited_amount
  from public.subscription_invoices note
  where note.document_type = 'credit_note'
    and note.credited_invoice_id = invoice.id
    and note.status <> 'void';

  outstanding_amount := invoice.amount_inc_vat - invoice.amount_paid - credited_amount;
  if p_amount > outstanding_amount then
    raise exception 'Payment exceeds outstanding amount' using errcode = '23514';
  end if;

  select * into issuer
  from private.billing_legal_entities
  where id = invoice.issuer_entity_id;
  if issuer.id is null then
    raise exception 'Invoice issuer not found' using errcode = 'P0002';
  end if;

  payment_id := gen_random_uuid();
  insert into private.billing_accounting_events (
    issuer_entity_id, organization_id, invoice_id, event_type, event_date, reference
  ) values (
    invoice.issuer_entity_id, invoice.organization_id, invoice.id,
    'payment_received', current_date,
    invoice.invoice_number || '/BET/' || upper(substr(replace(payment_id::text, '-', ''), 1, 8))
  ) returning id into accounting_event_id;

  insert into private.billing_accounting_lines (
    accounting_event_id, line_number, account_number, debit_amount, credit_amount, description
  ) values
    (accounting_event_id, 1, issuer.bank_account, p_amount, 0,
      'Inbetalning ' || invoice.invoice_number),
    (accounting_event_id, 2, issuer.accounts_receivable_account, 0, p_amount,
      'Minskad kundfordran ' || invoice.invoice_number);

  insert into public.platform_subscription_payments (
    id, organization_id, invoice_id, payment_date, amount, reference,
    reason, accounting_event_id, created_by_user_id
  ) values (
    payment_id, invoice.organization_id, invoice.id, current_date, p_amount,
    btrim(p_reason), btrim(p_reason), accounting_event_id, (select auth.uid())
  );

  new_paid := invoice.amount_paid + p_amount;
  new_status := case
    when new_paid + credited_amount >= invoice.amount_inc_vat
      and credited_amount > 0 then 'credited'
    when new_paid >= invoice.amount_inc_vat then 'paid'
    else invoice.status
  end;

  update public.subscription_invoices
  set amount_paid = new_paid,
      status = new_status,
      paid_at = case when new_status = 'paid' then now() else paid_at end,
      updated_at = now()
  where id = invoice.id
  returning * into updated_invoice;

  insert into public.platform_admin_audit_events (staff_user_id, action, metadata)
  values (
    (select auth.uid()), 'record_subscription_payment',
    jsonb_build_object(
      'organization_id', invoice.organization_id,
      'invoice_id', invoice.id,
      'payment_id', payment_id,
      'accounting_event_id', accounting_event_id,
      'amount', p_amount,
      'reason', p_reason
    )
  );

  return updated_invoice;
end;
$$;

create or replace function public.platform_create_subscription_credit_note(
  p_invoice_id uuid,
  p_amount_ex_vat numeric,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_invoice public.subscription_invoices;
  credit_note_id uuid;
  accounting_event_id uuid;
  credit_number text;
  credited_ex_vat numeric(14,2);
  credited_vat numeric(14,2);
  credited_inc_vat numeric(14,2);
  credit_vat numeric(14,2);
  credit_inc_vat numeric(14,2);
  effective_vat_rate numeric(8,4);
  outstanding_inc_vat numeric(14,2);
  credit_hash text;
  resulting_status text;
begin
  if not private.is_platform_staff(array['platform_owner','platform_admin','finance']) then
    raise exception 'Platform credit note access required' using errcode = '42501';
  end if;
  if p_amount_ex_vat <= 0 or char_length(btrim(p_reason)) < 3 then
    raise exception 'Credit amount and reason required' using errcode = '22023';
  end if;

  select * into source_invoice
  from public.subscription_invoices
  where id = p_invoice_id
  for update;

  if source_invoice.id is null then
    raise exception 'Invoice not found' using errcode = 'P0002';
  end if;
  if source_invoice.document_type <> 'invoice'
    or source_invoice.status = 'void' then
    raise exception 'Only issued invoices can be credited' using errcode = '23514';
  end if;
  if source_invoice.amount_ex_vat <= 0 then
    raise exception 'Invoice has no creditable net amount' using errcode = '23514';
  end if;

  select coalesce(sum(note.amount_ex_vat), 0),
    coalesce(sum(note.vat_amount), 0),
    coalesce(sum(note.amount_inc_vat), 0)
  into credited_ex_vat, credited_vat, credited_inc_vat
  from public.subscription_invoices note
  where note.document_type = 'credit_note'
    and note.credited_invoice_id = source_invoice.id
    and note.status <> 'void';

  if p_amount_ex_vat > source_invoice.amount_ex_vat - credited_ex_vat then
    raise exception 'Credit exceeds remaining net amount' using errcode = '23514';
  end if;

  if p_amount_ex_vat = source_invoice.amount_ex_vat - credited_ex_vat then
    credit_vat := source_invoice.vat_amount - credited_vat;
  else
    credit_vat := round(
      p_amount_ex_vat * source_invoice.vat_amount / source_invoice.amount_ex_vat,
      2
    );
  end if;
  credit_inc_vat := p_amount_ex_vat + credit_vat;
  outstanding_inc_vat := source_invoice.amount_inc_vat
    - source_invoice.amount_paid
    - credited_inc_vat;

  if credit_inc_vat > outstanding_inc_vat then
    raise exception 'Credit exceeds outstanding amount' using errcode = '23514';
  end if;

  effective_vat_rate := round(
    source_invoice.vat_amount / source_invoice.amount_ex_vat * 100,
    4
  );
  credit_number := private.allocate_subscription_invoice_number(source_invoice.issuer_entity_id);
  credit_note_id := gen_random_uuid();
  credit_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'document_type', 'credit_note',
    'credited_invoice_id', source_invoice.id,
    'organization_id', source_invoice.organization_id,
    'subscription_id', source_invoice.subscription_id,
    'agreement_id', source_invoice.agreement_id,
    'issuer_entity_id', source_invoice.issuer_entity_id,
    'invoice_number', credit_number,
    'invoice_date', current_date,
    'amount_ex_vat', p_amount_ex_vat,
    'vat_amount', credit_vat,
    'amount_inc_vat', credit_inc_vat,
    'reason', btrim(p_reason)
  )::text, 'UTF8'), 'sha256'), 'hex');

  insert into public.subscription_invoices (
    id, organization_id, subscription_id, agreement_id, schedule_id,
    issuer_entity_id, invoice_number, status, invoice_date, due_date,
    service_period_starts_on, service_period_ends_on, currency,
    amount_ex_vat, vat_amount, amount_inc_vat, amount_paid,
    seat_count_snapshot, delivery_channel, customer_snapshot, issuer_snapshot,
    content_hash, origin, manual_charge_id, document_type,
    credited_invoice_id, credit_reason
  ) values (
    credit_note_id, source_invoice.organization_id, source_invoice.subscription_id,
    source_invoice.agreement_id, null, source_invoice.issuer_entity_id,
    credit_number, 'queued', current_date, current_date,
    source_invoice.service_period_starts_on, source_invoice.service_period_ends_on,
    source_invoice.currency, p_amount_ex_vat, credit_vat, credit_inc_vat, 0,
    source_invoice.seat_count_snapshot, source_invoice.delivery_channel,
    source_invoice.customer_snapshot || jsonb_build_object(
      'credit_note', jsonb_build_object(
        'credited_invoice_id', source_invoice.id,
        'credited_invoice_number', source_invoice.invoice_number,
        'reason', btrim(p_reason),
        'source_status_before_credit', source_invoice.status
      )
    ),
    source_invoice.issuer_snapshot, credit_hash, 'manual', null,
    'credit_note', source_invoice.id, btrim(p_reason)
  );

  insert into public.subscription_invoice_lines (
    organization_id, invoice_id, line_number, item_code, description,
    quantity, unit, unit_price_ex_vat, discount_percent,
    line_amount_ex_vat, vat_rate, vat_amount
  ) values (
    source_invoice.organization_id, credit_note_id, 1, 'BYNEX-CREDIT',
    'Kreditering av faktura ' || source_invoice.invoice_number || ' – ' || btrim(p_reason),
    1, 'st', p_amount_ex_vat, 0, p_amount_ex_vat,
    effective_vat_rate, credit_vat
  );

  insert into public.subscription_invoice_delivery_jobs (
    organization_id, invoice_id, channel, idempotency_key
  ) values (
    source_invoice.organization_id, credit_note_id, source_invoice.delivery_channel,
    'subscription-credit-note:' || credit_note_id::text || ':' || source_invoice.delivery_channel
  );

  insert into private.billing_accounting_events (
    issuer_entity_id, organization_id, invoice_id, event_type, event_date, reference
  ) values (
    source_invoice.issuer_entity_id, source_invoice.organization_id,
    credit_note_id, 'credit_issued', current_date, credit_number
  ) returning id into accounting_event_id;

  insert into private.billing_accounting_lines (
    accounting_event_id, line_number, account_number, debit_amount, credit_amount, description
  )
  select accounting_event_id, 1, issuer.revenue_account,
      p_amount_ex_vat, 0, 'Krediterad abonnemangsintäkt ' || credit_number
  from private.billing_legal_entities issuer
  where issuer.id = source_invoice.issuer_entity_id
  union all
  select accounting_event_id, 2, issuer.output_vat_account,
      credit_vat, 0, 'Krediterad utgående moms ' || credit_number
  from private.billing_legal_entities issuer
  where issuer.id = source_invoice.issuer_entity_id
  union all
  select accounting_event_id, 3, issuer.accounts_receivable_account,
      0, credit_inc_vat, 'Minskad kundfordran ' || credit_number
  from private.billing_legal_entities issuer
  where issuer.id = source_invoice.issuer_entity_id;

  resulting_status := case
    when source_invoice.amount_paid + credited_inc_vat + credit_inc_vat
      >= source_invoice.amount_inc_vat then 'credited'
    else source_invoice.status
  end;

  update public.subscription_invoices
  set status = resulting_status,
      updated_at = now()
  where id = source_invoice.id;

  insert into public.platform_admin_audit_events (staff_user_id, action, metadata)
  values (
    (select auth.uid()), 'create_subscription_credit_note',
    jsonb_build_object(
      'organization_id', source_invoice.organization_id,
      'source_invoice_id', source_invoice.id,
      'credit_note_id', credit_note_id,
      'credit_note_number', credit_number,
      'amount_ex_vat', p_amount_ex_vat,
      'vat_amount', credit_vat,
      'reason', p_reason
    )
  );

  return credit_note_id;
end;
$$;

create or replace function public.platform_void_subscription_invoice(
  p_invoice_id uuid,
  p_reason text
)
returns public.subscription_invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  invoice public.subscription_invoices;
  updated_invoice public.subscription_invoices;
  source_invoice public.subscription_invoices;
  issuer private.billing_legal_entities;
  reversal_event_id uuid;
  remaining_credit_amount numeric(14,2);
  restored_status text;
begin
  if not private.is_platform_staff(array['platform_owner','platform_admin','finance']) then
    raise exception 'Platform invoice access required' using errcode = '42501';
  end if;
  if char_length(btrim(p_reason)) < 3 then
    raise exception 'Reason required' using errcode = '22023';
  end if;

  select * into invoice
  from public.subscription_invoices
  where id = p_invoice_id
  for update;

  if invoice.id is null then
    raise exception 'Invoice not found' using errcode = 'P0002';
  end if;
  if invoice.status <> 'queued' or invoice.amount_paid > 0 then
    raise exception 'Only unpaid queued documents can be voided' using errcode = '23514';
  end if;

  select * into issuer
  from private.billing_legal_entities
  where id = invoice.issuer_entity_id;
  if issuer.id is null then
    raise exception 'Invoice issuer not found' using errcode = 'P0002';
  end if;

  if invoice.document_type = 'invoice' then
    insert into private.billing_accounting_events (
      issuer_entity_id, organization_id, invoice_id, event_type, event_date, reference
    ) values (
      invoice.issuer_entity_id, invoice.organization_id, invoice.id,
      'credit_issued', current_date, invoice.invoice_number || '/MAK'
    ) returning id into reversal_event_id;

    insert into private.billing_accounting_lines (
      accounting_event_id, line_number, account_number, debit_amount, credit_amount, description
    ) values
      (reversal_event_id, 1, issuer.revenue_account, invoice.amount_ex_vat, 0,
        'Makulering intäkt ' || invoice.invoice_number),
      (reversal_event_id, 2, issuer.output_vat_account, invoice.vat_amount, 0,
        'Makulering moms ' || invoice.invoice_number),
      (reversal_event_id, 3, issuer.accounts_receivable_account, 0, invoice.amount_inc_vat,
        'Makulering kundfordran ' || invoice.invoice_number);
  else
    insert into private.billing_accounting_events (
      issuer_entity_id, organization_id, invoice_id, event_type, event_date, reference
    ) values (
      invoice.issuer_entity_id, invoice.organization_id, invoice.id,
      'invoice_issued', current_date, invoice.invoice_number || '/MAK'
    ) returning id into reversal_event_id;

    insert into private.billing_accounting_lines (
      accounting_event_id, line_number, account_number, debit_amount, credit_amount, description
    ) values
      (reversal_event_id, 1, issuer.accounts_receivable_account, invoice.amount_inc_vat, 0,
        'Återförd kreditfordran ' || invoice.invoice_number),
      (reversal_event_id, 2, issuer.revenue_account, 0, invoice.amount_ex_vat,
        'Återförd kreditintäkt ' || invoice.invoice_number),
      (reversal_event_id, 3, issuer.output_vat_account, 0, invoice.vat_amount,
        'Återförd kreditmoms ' || invoice.invoice_number);

    select * into source_invoice
    from public.subscription_invoices
    where id = invoice.credited_invoice_id
    for update;

    select coalesce(sum(note.amount_inc_vat), 0)
    into remaining_credit_amount
    from public.subscription_invoices note
    where note.document_type = 'credit_note'
      and note.credited_invoice_id = source_invoice.id
      and note.id <> invoice.id
      and note.status <> 'void';

    restored_status := case
      when source_invoice.amount_paid >= source_invoice.amount_inc_vat then 'paid'
      when source_invoice.amount_paid + remaining_credit_amount >= source_invoice.amount_inc_vat then 'credited'
      else coalesce(
        nullif(invoice.customer_snapshot -> 'credit_note' ->> 'source_status_before_credit', ''),
        'delivered'
      )
    end;

    update public.subscription_invoices
    set status = restored_status,
        updated_at = now()
    where id = source_invoice.id;
  end if;

  update public.subscription_invoices
  set status = 'void',
      updated_at = now()
  where id = invoice.id
  returning * into updated_invoice;

  update public.subscription_invoice_delivery_jobs
  set status = 'cancelled',
      updated_at = now()
  where invoice_id = invoice.id
    and status in ('pending','retry');

  insert into public.platform_admin_audit_events (staff_user_id, action, metadata)
  values (
    (select auth.uid()), 'void_subscription_invoice',
    jsonb_build_object(
      'organization_id', invoice.organization_id,
      'invoice_id', invoice.id,
      'document_type', invoice.document_type,
      'reversal_event_id', reversal_event_id,
      'reason', p_reason
    )
  );

  return updated_invoice;
end;
$$;

revoke all on function public.get_platform_hq_billing(uuid) from public, anon;
revoke all on function public.platform_record_subscription_payment(uuid,numeric,text) from public, anon;
revoke all on function public.platform_create_subscription_credit_note(uuid,numeric,text) from public, anon;
revoke all on function public.platform_void_subscription_invoice(uuid,text) from public, anon;

grant execute on function public.get_platform_hq_billing(uuid) to authenticated;
grant execute on function public.platform_record_subscription_payment(uuid,numeric,text) to authenticated;
grant execute on function public.platform_create_subscription_credit_note(uuid,numeric,text) to authenticated;
grant execute on function public.platform_void_subscription_invoice(uuid,text) to authenticated;

commit;
