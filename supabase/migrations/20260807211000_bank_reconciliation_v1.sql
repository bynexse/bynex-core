-- Bynex Bank 1.0
-- Förklarbar, tenant-isolerad och atomisk en-till-en-avstämning mellan
-- importerad bankhändelse och redan bokförd verifikation.

alter table public.bank_statement_transactions
  add column if not exists updated_at timestamptz not null default now();

alter table public.bookkeeping_reconciliation_matches
  add column if not exists candidate_score integer not null default 0,
  add column if not exists explanation jsonb not null default '[]'::jsonb,
  add column if not exists rule_version text not null default 'bank-match-v1',
  add column if not exists rejected_by_user_id uuid,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejection_reason text,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'bookkeeping_reconciliation_matches_rejected_by_user_id_fkey'
      and conrelid = 'public.bookkeeping_reconciliation_matches'::regclass
  ) then
    alter table public.bookkeeping_reconciliation_matches
      add constraint bookkeeping_reconciliation_matches_rejected_by_user_id_fkey
      foreign key (rejected_by_user_id) references auth.users(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'bookkeeping_reconciliation_matches_matched_amount_check'
      and conrelid = 'public.bookkeeping_reconciliation_matches'::regclass
  ) then
    alter table public.bookkeeping_reconciliation_matches
      add constraint bookkeeping_reconciliation_matches_matched_amount_check
      check (matched_amount > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'bookkeeping_reconciliation_matches_candidate_score_check'
      and conrelid = 'public.bookkeeping_reconciliation_matches'::regclass
  ) then
    alter table public.bookkeeping_reconciliation_matches
      add constraint bookkeeping_reconciliation_matches_candidate_score_check
      check (candidate_score between 0 and 100);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'bookkeeping_reconciliation_matches_explanation_check'
      and conrelid = 'public.bookkeeping_reconciliation_matches'::regclass
  ) then
    alter table public.bookkeeping_reconciliation_matches
      add constraint bookkeeping_reconciliation_matches_explanation_check
      check (jsonb_typeof(explanation) = 'array');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'bookkeeping_reconciliation_matches_rule_version_check'
      and conrelid = 'public.bookkeeping_reconciliation_matches'::regclass
  ) then
    alter table public.bookkeeping_reconciliation_matches
      add constraint bookkeeping_reconciliation_matches_rule_version_check
      check (char_length(trim(rule_version)) between 1 and 100);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'bookkeeping_reconciliation_matches_rejection_reason_check'
      and conrelid = 'public.bookkeeping_reconciliation_matches'::regclass
  ) then
    alter table public.bookkeeping_reconciliation_matches
      add constraint bookkeeping_reconciliation_matches_rejection_reason_check
      check (rejection_reason is null or char_length(trim(rejection_reason)) between 2 and 500);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'bookkeeping_reconciliation_matches_decision_evidence_check'
      and conrelid = 'public.bookkeeping_reconciliation_matches'::regclass
  ) then
    alter table public.bookkeeping_reconciliation_matches
      add constraint bookkeeping_reconciliation_matches_decision_evidence_check
      check (
        (
          status = 'suggested'
          and confirmed_by_user_id is null
          and confirmed_at is null
          and rejected_by_user_id is null
          and rejected_at is null
          and rejection_reason is null
        )
        or
        (
          status = 'confirmed'
          and confirmed_by_user_id is not null
          and confirmed_at is not null
          and rejected_by_user_id is null
          and rejected_at is null
          and rejection_reason is null
        )
        or
        (
          status = 'rejected'
          and confirmed_by_user_id is null
          and confirmed_at is null
          and rejected_by_user_id is not null
          and rejected_at is not null
          and rejection_reason is not null
        )
      );
  end if;
end
$$;

create unique index if not exists bookkeeping_one_confirmed_match_per_bank_transaction
  on public.bookkeeping_reconciliation_matches (organization_id, bank_transaction_id)
  where status = 'confirmed';

create index if not exists bookkeeping_reconciliation_matches_status_created_idx
  on public.bookkeeping_reconciliation_matches (organization_id, status, created_at desc);

create or replace function private.guard_reconciliation_match_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'confirmed' then
      raise exception using
        errcode = '55000',
        message = 'En bekräftad bankmatchning får inte raderas. Skapa ett kontrollerat återföringsspår.';
    end if;
    return old;
  end if;

  if old.status = 'confirmed' then
    raise exception using
      errcode = '55000',
      message = 'En bekräftad bankmatchning är låst och får inte skrivas över.';
  end if;

  return new;
end;
$$;

create or replace function private.guard_bank_statement_transaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  confirmed_total numeric(18,2);
begin
  if tg_op = 'DELETE' then
    raise exception using
      errcode = '55000',
      message = 'Importerad bankhistorik får inte hårdraderas.';
  end if;

  if new.organization_id is distinct from old.organization_id
     or new.account_reference is distinct from old.account_reference
     or new.booked_on is distinct from old.booked_on
     or new.value_on is distinct from old.value_on
     or new.amount is distinct from old.amount
     or new.currency is distinct from old.currency
     or new.counterparty_name is distinct from old.counterparty_name
     or new.reference is distinct from old.reference
     or new.provider_transaction_id is distinct from old.provider_transaction_id
     or new.import_fingerprint is distinct from old.import_fingerprint
     or new.imported_at is distinct from old.imported_at
     or new.created_at is distinct from old.created_at then
    raise exception using
      errcode = '55000',
      message = 'Importerad bankhistorik är oföränderlig. Endast avstämningsstatus får ändras.';
  end if;

  if old.reconciliation_status = 'matched'
     and new.reconciliation_status <> 'matched' then
    raise exception using
      errcode = '55000',
      message = 'En bekräftad bankavstämning är låst och kräver ett separat återföringsflöde.';
  end if;

  select coalesce(sum(m.matched_amount), 0)::numeric(18,2)
    into confirmed_total
  from public.bookkeeping_reconciliation_matches m
  where m.organization_id = new.organization_id
    and m.bank_transaction_id = new.id
    and m.status = 'confirmed';

  if new.reconciliation_status = 'matched'
     and abs(confirmed_total - abs(new.amount)) > 0.02 then
    raise exception using
      errcode = '23514',
      message = 'Bankhändelsen kan bara markeras som matchad när ett bekräftat underlag täcker hela beloppet.';
  end if;

  if new.reconciliation_status <> 'matched'
     and confirmed_total > 0 then
    raise exception using
      errcode = '23514',
      message = 'Bankhändelsen har en bekräftad matchning och måste därför vara markerad som matchad.';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_reconciliation_match_mutation on public.bookkeeping_reconciliation_matches;
create trigger guard_reconciliation_match_mutation
before update or delete on public.bookkeeping_reconciliation_matches
for each row execute function private.guard_reconciliation_match_mutation();

drop trigger if exists guard_bank_statement_transaction on public.bank_statement_transactions;
create trigger guard_bank_statement_transaction
before update or delete on public.bank_statement_transactions
for each row execute function private.guard_bank_statement_transaction();

create or replace function public.confirm_bank_reconciliation_match(
  p_organization_id uuid,
  p_bank_transaction_id uuid,
  p_voucher_id uuid,
  p_candidate_score integer default 0,
  p_explanation jsonb default '[]'::jsonb,
  p_match_method text default 'bynex_smart'
)
returns table (
  match_id uuid,
  bank_transaction_id uuid,
  voucher_id uuid,
  reconciliation_status text,
  voucher_number text,
  matched_amount numeric
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  actor_id uuid := auth.uid();
  bank_row public.bank_statement_transactions%rowtype;
  voucher_row public.bookkeeping_vouchers%rowtype;
  debit_total numeric(18,2);
  credit_total numeric(18,2);
  existing_match public.bookkeeping_reconciliation_matches%rowtype;
  result_match public.bookkeeping_reconciliation_matches%rowtype;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'Inloggning krävs.';
  end if;

  if not private.has_organization_role(
    p_organization_id,
    array['owner','admin','office']::text[],
    actor_id
  ) then
    raise exception using errcode = '42501', message = 'Ekonomibehörighet krävs.';
  end if;

  if p_candidate_score < 0 or p_candidate_score > 100 then
    raise exception using errcode = '22023', message = 'Matchningspoängen är ogiltig.';
  end if;

  if jsonb_typeof(coalesce(p_explanation, '[]'::jsonb)) <> 'array' then
    raise exception using errcode = '22023', message = 'Matchningsförklaringen är ogiltig.';
  end if;

  if p_match_method not in ('bynex_smart', 'rule', 'manual') then
    raise exception using errcode = '22023', message = 'Matchningsmetoden är ogiltig.';
  end if;

  select * into bank_row
  from public.bank_statement_transactions b
  where b.organization_id = p_organization_id
    and b.id = p_bank_transaction_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Bankhändelsen hittades inte.';
  end if;

  if bank_row.currency <> 'SEK' then
    raise exception using errcode = '0A000', message = 'Utländsk valuta kräver ett separat valutaflöde.';
  end if;

  select * into voucher_row
  from public.bookkeeping_vouchers v
  where v.organization_id = p_organization_id
    and v.id = p_voucher_id
  for share;

  if not found then
    raise exception using errcode = 'P0002', message = 'Verifikationen hittades inte.';
  end if;

  if voucher_row.status <> 'posted'
     or voucher_row.voucher_number is null
     or voucher_row.content_hash is null then
    raise exception using errcode = '23514', message = 'Endast en låst och bokförd verifikation kan avstämmas.';
  end if;

  select
    coalesce(sum(l.debit_amount), 0)::numeric(18,2),
    coalesce(sum(l.credit_amount), 0)::numeric(18,2)
  into debit_total, credit_total
  from public.bookkeeping_voucher_lines l
  where l.organization_id = p_organization_id
    and l.voucher_id = p_voucher_id;

  if debit_total <= 0
     or abs(debit_total - credit_total) > 0.02 then
    raise exception using errcode = '23514', message = 'Verifikationen är inte balanserad.';
  end if;

  if abs(debit_total - abs(bank_row.amount)) > 0.02 then
    raise exception using
      errcode = '23514',
      message = 'Bynex Bank 1.0 kräver exakt en-till-en-belopp. Delbetalning och split hanteras separat.';
  end if;

  select * into existing_match
  from public.bookkeeping_reconciliation_matches m
  where m.organization_id = p_organization_id
    and m.bank_transaction_id = p_bank_transaction_id
    and m.status = 'confirmed'
  limit 1;

  if found then
    if existing_match.voucher_id = p_voucher_id then
      return query
      select
        existing_match.id,
        existing_match.bank_transaction_id,
        existing_match.voucher_id,
        bank_row.reconciliation_status,
        voucher_row.voucher_number,
        existing_match.matched_amount;
      return;
    end if;

    raise exception using
      errcode = '23505',
      message = 'Bankhändelsen är redan bekräftad mot en annan verifikation.';
  end if;

  insert into public.bookkeeping_reconciliation_matches (
    organization_id,
    bank_transaction_id,
    voucher_id,
    matched_amount,
    match_method,
    confidence,
    candidate_score,
    explanation,
    rule_version,
    status,
    confirmed_by_user_id,
    confirmed_at,
    rejected_by_user_id,
    rejected_at,
    rejection_reason
  ) values (
    p_organization_id,
    p_bank_transaction_id,
    p_voucher_id,
    abs(bank_row.amount),
    p_match_method,
    p_candidate_score::numeric / 100,
    p_candidate_score,
    coalesce(p_explanation, '[]'::jsonb),
    'bank-match-v1',
    'confirmed',
    actor_id,
    now(),
    null,
    null,
    null
  )
  on conflict (organization_id, bank_transaction_id, voucher_id)
  do update set
    matched_amount = excluded.matched_amount,
    match_method = excluded.match_method,
    confidence = excluded.confidence,
    candidate_score = excluded.candidate_score,
    explanation = excluded.explanation,
    rule_version = excluded.rule_version,
    status = 'confirmed',
    confirmed_by_user_id = actor_id,
    confirmed_at = now(),
    rejected_by_user_id = null,
    rejected_at = null,
    rejection_reason = null
  returning * into result_match;

  update public.bank_statement_transactions b
  set reconciliation_status = 'matched'
  where b.organization_id = p_organization_id
    and b.id = p_bank_transaction_id;

  return query
  select
    result_match.id,
    result_match.bank_transaction_id,
    result_match.voucher_id,
    'matched'::text,
    voucher_row.voucher_number,
    result_match.matched_amount;
end;
$$;

create or replace function public.reject_bank_reconciliation_candidate(
  p_organization_id uuid,
  p_bank_transaction_id uuid,
  p_voucher_id uuid,
  p_reason text,
  p_candidate_score integer default 0,
  p_explanation jsonb default '[]'::jsonb,
  p_match_method text default 'bynex_smart'
)
returns table (
  match_id uuid,
  status text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  actor_id uuid := auth.uid();
  reason_text text := trim(coalesce(p_reason, ''));
  result_match public.bookkeeping_reconciliation_matches%rowtype;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'Inloggning krävs.';
  end if;

  if not private.has_organization_role(
    p_organization_id,
    array['owner','admin','office']::text[],
    actor_id
  ) then
    raise exception using errcode = '42501', message = 'Ekonomibehörighet krävs.';
  end if;

  if char_length(reason_text) < 2 or char_length(reason_text) > 500 then
    raise exception using errcode = '22023', message = 'Ange varför förslaget inte stämmer.';
  end if;

  if p_candidate_score < 0 or p_candidate_score > 100
     or jsonb_typeof(coalesce(p_explanation, '[]'::jsonb)) <> 'array'
     or p_match_method not in ('bynex_smart', 'rule', 'manual') then
    raise exception using errcode = '22023', message = 'Matchningsunderlaget är ogiltigt.';
  end if;

  if not exists (
    select 1
    from public.bank_statement_transactions b
    where b.organization_id = p_organization_id
      and b.id = p_bank_transaction_id
  ) then
    raise exception using errcode = 'P0002', message = 'Bankhändelsen hittades inte.';
  end if;

  if not exists (
    select 1
    from public.bookkeeping_vouchers v
    where v.organization_id = p_organization_id
      and v.id = p_voucher_id
  ) then
    raise exception using errcode = 'P0002', message = 'Verifikationen hittades inte.';
  end if;

  if exists (
    select 1
    from public.bookkeeping_reconciliation_matches m
    where m.organization_id = p_organization_id
      and m.bank_transaction_id = p_bank_transaction_id
      and m.voucher_id = p_voucher_id
      and m.status = 'confirmed'
  ) then
    raise exception using
      errcode = '55000',
      message = 'En bekräftad matchning är låst och kan inte avvisas i efterhand.';
  end if;

  insert into public.bookkeeping_reconciliation_matches (
    organization_id,
    bank_transaction_id,
    voucher_id,
    matched_amount,
    match_method,
    confidence,
    candidate_score,
    explanation,
    rule_version,
    status,
    confirmed_by_user_id,
    confirmed_at,
    rejected_by_user_id,
    rejected_at,
    rejection_reason
  )
  select
    p_organization_id,
    p_bank_transaction_id,
    p_voucher_id,
    abs(b.amount),
    p_match_method,
    p_candidate_score::numeric / 100,
    p_candidate_score,
    coalesce(p_explanation, '[]'::jsonb),
    'bank-match-v1',
    'rejected',
    null,
    null,
    actor_id,
    now(),
    reason_text
  from public.bank_statement_transactions b
  where b.organization_id = p_organization_id
    and b.id = p_bank_transaction_id
  on conflict (organization_id, bank_transaction_id, voucher_id)
  do update set
    matched_amount = excluded.matched_amount,
    match_method = excluded.match_method,
    confidence = excluded.confidence,
    candidate_score = excluded.candidate_score,
    explanation = excluded.explanation,
    rule_version = excluded.rule_version,
    status = 'rejected',
    confirmed_by_user_id = null,
    confirmed_at = null,
    rejected_by_user_id = actor_id,
    rejected_at = now(),
    rejection_reason = reason_text
  returning * into result_match;

  return query select result_match.id, result_match.status;
end;
$$;

drop policy if exists bookkeeping_reconciliation_matches_finance_insert
  on public.bookkeeping_reconciliation_matches;
drop policy if exists bookkeeping_reconciliation_matches_finance_update
  on public.bookkeeping_reconciliation_matches;

revoke all on table public.bookkeeping_reconciliation_matches
  from public, anon, authenticated;
grant select on table public.bookkeeping_reconciliation_matches
  to authenticated;

revoke delete on table public.bank_statement_transactions
  from public, anon, authenticated;

revoke all on function public.confirm_bank_reconciliation_match(
  uuid, uuid, uuid, integer, jsonb, text
) from public, anon, authenticated;
grant execute on function public.confirm_bank_reconciliation_match(
  uuid, uuid, uuid, integer, jsonb, text
) to authenticated;

revoke all on function public.reject_bank_reconciliation_candidate(
  uuid, uuid, uuid, text, integer, jsonb, text
) from public, anon, authenticated;
grant execute on function public.reject_bank_reconciliation_candidate(
  uuid, uuid, uuid, text, integer, jsonb, text
) to authenticated;
