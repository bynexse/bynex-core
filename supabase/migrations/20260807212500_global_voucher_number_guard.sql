create or replace function public.post_bookkeeping_voucher(
  p_organization_id uuid,
  p_voucher_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  voucher_record record;
  fiscal_year_record record;
  debit numeric(16,2);
  credit numeric(16,2);
  number text;
  hash text;
  global_next_number bigint;
begin
  if not private.has_organization_role(
    p_organization_id,
    array['owner','admin','office']::text[],
    (select auth.uid())
  ) then
    raise exception 'Behörighet saknas' using errcode='42501';
  end if;

  -- Verifikationsnummer är unika per företag, inte bara per räkenskapsår.
  -- Låset gör samtidig enklicks-, manuell- och SIE-bokföring sekventiell
  -- utan att hålla en applikationsserver som samordnare.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_organization_id::text, 20260807)
  );

  select bv.*, bp.status period_status
  into voucher_record
  from public.bookkeeping_vouchers bv
  join public.bookkeeping_periods bp
    on bp.organization_id = bv.organization_id
   and bp.id = bv.period_id
  where bv.organization_id = p_organization_id
    and bv.id = p_voucher_id
    and bv.status in ('draft','review')
  for update of bv;

  if voucher_record.id is null or voucher_record.period_status <> 'open' then
    raise exception 'Verifikationen eller perioden är inte öppen'
      using errcode='23514';
  end if;

  select coalesce(sum(debit_amount),0), coalesce(sum(credit_amount),0)
  into debit, credit
  from public.bookkeeping_voucher_lines
  where organization_id = p_organization_id
    and voucher_id = p_voucher_id;

  if debit <= 0 or abs(debit-credit) > 0.01 then
    raise exception 'Verifikationen måste balansera'
      using errcode='23514';
  end if;

  select *
  into fiscal_year_record
  from public.bookkeeping_fiscal_years
  where organization_id = p_organization_id
    and id = voucher_record.fiscal_year_id
  for update;

  select coalesce(max(substring(bv.voucher_number from 2)::bigint), 0) + 1
  into global_next_number
  from public.bookkeeping_vouchers bv
  where bv.organization_id = p_organization_id
    and bv.voucher_number ~ '^A[0-9]{8}$';

  global_next_number := greatest(
    global_next_number,
    fiscal_year_record.next_voucher_number
  );
  number := 'A' || lpad(global_next_number::text, 8, '0');

  update public.bookkeeping_fiscal_years
  set next_voucher_number = global_next_number + 1,
      updated_at = now()
  where organization_id = p_organization_id
    and id = fiscal_year_record.id;

  hash := encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'voucher_id', voucher_record.id,
          'voucher_number', number,
          'voucher_date', voucher_record.voucher_date,
          'description', voucher_record.description,
          'lines', (
            select jsonb_agg(
              jsonb_build_object(
                'line_number', l.line_number,
                'account_id', l.account_id,
                'debit', l.debit_amount,
                'credit', l.credit_amount,
                'description', l.description
              ) order by l.line_number
            )
            from public.bookkeeping_voucher_lines l
            where l.organization_id = p_organization_id
              and l.voucher_id = p_voucher_id
          )
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  update public.bookkeeping_vouchers
  set status = 'posted',
      voucher_number = number,
      content_hash = hash,
      reviewed_by_user_id = coalesce(reviewed_by_user_id, (select auth.uid())),
      reviewed_at = coalesce(reviewed_at, now()),
      posted_by_user_id = (select auth.uid()),
      posted_at = now(),
      updated_at = now()
  where organization_id = p_organization_id
    and id = p_voucher_id;

  return number;
end;
$$;

revoke all on function public.post_bookkeeping_voucher(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.post_bookkeeping_voucher(uuid, uuid)
  to authenticated;
