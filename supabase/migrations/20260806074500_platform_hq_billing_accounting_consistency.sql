begin;

create or replace function private.apply_hq_discount_to_subscription_accounting_line()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invoice public.subscription_invoices;
  accounting_event private.billing_accounting_events;
begin
  select * into accounting_event
  from private.billing_accounting_events event
  where event.id = new.accounting_event_id;

  if accounting_event.id is null or accounting_event.event_type <> 'invoice_issued' then
    return new;
  end if;

  select * into invoice
  from public.subscription_invoices candidate
  where candidate.id = accounting_event.invoice_id;

  if invoice.id is null or invoice.origin <> 'automatic'
    or invoice.customer_snapshot -> 'hq_discount' is null then
    return new;
  end if;

  if new.line_number = 1 and new.debit_amount > 0 then
    new.debit_amount := invoice.amount_inc_vat;
    new.credit_amount := 0;
  elsif new.line_number = 2 and new.credit_amount > 0 then
    new.debit_amount := 0;
    new.credit_amount := invoice.amount_ex_vat;
  elsif new.line_number = 3 and new.credit_amount > 0 then
    new.debit_amount := 0;
    new.credit_amount := invoice.vat_amount;
  end if;

  return new;
end;
$$;

revoke all on function private.apply_hq_discount_to_subscription_accounting_line()
  from public, anon, authenticated;

drop trigger if exists apply_hq_discount_to_subscription_accounting_line
  on private.billing_accounting_lines;
create trigger apply_hq_discount_to_subscription_accounting_line
  before insert on private.billing_accounting_lines
  for each row execute function private.apply_hq_discount_to_subscription_accounting_line();

commit;
