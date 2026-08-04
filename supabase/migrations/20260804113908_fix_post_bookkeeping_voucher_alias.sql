begin;

create or replace function public.post_bookkeeping_voucher(
  p_organization_id uuid,p_voucher_id uuid
)
returns text
language plpgsql
security definer set search_path=''
as $$
declare voucher_record record;
declare fiscal_year_record record;
declare debit numeric(16,2);
declare credit numeric(16,2);
declare number text;
declare hash text;
begin
  if not private.has_organization_role(
    p_organization_id,array['owner','admin','office']::text[],(select auth.uid())
  ) then raise exception 'Behörighet saknas' using errcode='42501'; end if;
  select bv.*,bp.status period_status into voucher_record
  from public.bookkeeping_vouchers bv
  join public.bookkeeping_periods bp
    on bp.organization_id=bv.organization_id and bp.id=bv.period_id
  where bv.organization_id=p_organization_id and bv.id=p_voucher_id
    and bv.status in ('draft','review') for update of bv;
  if voucher_record.id is null or voucher_record.period_status<>'open' then
    raise exception 'Verifikationen eller perioden är inte öppen' using errcode='23514';
  end if;
  select coalesce(sum(debit_amount),0),coalesce(sum(credit_amount),0)
  into debit,credit from public.bookkeeping_voucher_lines
  where organization_id=p_organization_id and voucher_id=p_voucher_id;
  if debit<=0 or abs(debit-credit)>0.01 then
    raise exception 'Verifikationen måste balansera' using errcode='23514';
  end if;
  select * into fiscal_year_record from public.bookkeeping_fiscal_years
  where organization_id=p_organization_id
    and id=voucher_record.fiscal_year_id for update;
  number:='A'||lpad(fiscal_year_record.next_voucher_number::text,8,'0');
  update public.bookkeeping_fiscal_years
  set next_voucher_number=next_voucher_number+1,updated_at=now()
  where id=fiscal_year_record.id;
  hash:=encode(extensions.digest(convert_to(jsonb_build_object(
    'voucher_id',voucher_record.id,'voucher_number',number,
    'voucher_date',voucher_record.voucher_date,
    'description',voucher_record.description,
    'lines',(select jsonb_agg(jsonb_build_object(
      'line_number',l.line_number,'account_id',l.account_id,'debit',l.debit_amount,
      'credit',l.credit_amount,'description',l.description
    ) order by l.line_number) from public.bookkeeping_voucher_lines l
      where l.organization_id=p_organization_id and l.voucher_id=p_voucher_id)
  )::text,'UTF8'),'sha256'),'hex');
  update public.bookkeeping_vouchers set status='posted',voucher_number=number,
    content_hash=hash,reviewed_by_user_id=coalesce(reviewed_by_user_id,(select auth.uid())),
    reviewed_at=coalesce(reviewed_at,now()),posted_by_user_id=(select auth.uid()),
    posted_at=now(),updated_at=now()
  where id=p_voucher_id;
  return number;
end;
$$;

revoke all on function public.post_bookkeeping_voucher(uuid,uuid) from public,anon;
grant execute on function public.post_bookkeeping_voucher(uuid,uuid) to authenticated;

commit;
