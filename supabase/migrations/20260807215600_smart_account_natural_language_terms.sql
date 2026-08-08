begin;

-- Smart account advice must understand ordinary descriptions such as
-- "köpte en borrmaskin och mindre verktyg". The previous full-phrase search
-- required every word to match the same catalog document. This version searches
-- meaningful terms independently, combines the evidence, and still only
-- proposes accounts; it never activates or posts anything.
create or replace function public.suggest_account_plan_accounts(
  p_organization_id uuid,
  p_context_text text,
  p_supplier_name text default null,
  p_cost_type text default null,
  p_limit integer default 5
)
returns table (
  account_number text,
  account_name text,
  account_type text,
  normal_balance text,
  vat_code text,
  catalog_account_id uuid,
  ledger_account_id uuid,
  already_active boolean,
  catalog_version text,
  confidence numeric,
  prior_analysis_hits integer,
  prior_voucher_hits integer,
  reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user_id uuid := (select auth.uid());
  v_context text := lower(left(btrim(coalesce(p_context_text,'')),500));
  v_supplier text := lower(left(btrim(coalesce(p_supplier_name,'')),240));
  v_cost_type text := lower(left(btrim(coalesce(p_cost_type,'')),80));
  v_limit integer := greatest(1,least(coalesce(p_limit,5),20));
begin
  if v_user_id is null or not private.has_organization_role(
    p_organization_id,array['owner','admin','office']::text[],v_user_id
  ) then
    raise exception 'Behörighet till Smart kontoförslag saknas'
      using errcode = '42501';
  end if;
  if v_context = '' and v_supplier = '' and v_cost_type = '' then
    raise exception 'Beskriv inköpet, intäkten eller händelsen'
      using errcode = '22023';
  end if;

  return query
  with input_terms as (
    select distinct left(lower(token.term),80) as term
    from regexp_split_to_table(
      concat_ws(' ',nullif(v_context,''),nullif(v_supplier,''),nullif(v_cost_type,'')),
      '[^[:alnum:]åäö]+'
    ) as token(term)
    where char_length(token.term) >= 3
      and lower(token.term) <> all(array[
        'och','att','det','den','detta','denna','ett','en','som','med','till',
        'från','för','av','på','vid','har','hade','ska','skall','kan','kunde',
        'blev','blir','var','vara','är','köpte','köpt','betalade','gäller'
      ]::text[])
    limit 24
  ),
  terms as (
    select input_terms.term
    from input_terms
    union all
    select left(
      concat_ws(' ',nullif(v_context,''),nullif(v_supplier,''),nullif(v_cost_type,'')),
      160
    )
    where not exists (select 1 from input_terms)
  ),
  candidate_hits as (
    select candidate.*,terms.term
    from terms
    cross join lateral public.search_account_plan(
      p_organization_id,terms.term,false,100
    ) candidate
  ),
  candidates as (
    select
      candidate_hits.account_number,
      candidate_hits.account_name,
      candidate_hits.account_type,
      candidate_hits.normal_balance,
      candidate_hits.vat_code,
      candidate_hits.catalog_account_id,
      candidate_hits.ledger_account_id,
      candidate_hits.already_active,
      candidate_hits.catalog_version,
      candidate_hits.explanation,
      max(candidate_hits.score)
        + greatest(count(distinct candidate_hits.term) - 1,0) * 12
        as score,
      count(distinct candidate_hits.term)::integer as matching_terms
    from candidate_hits
    group by
      candidate_hits.account_number,
      candidate_hits.account_name,
      candidate_hits.account_type,
      candidate_hits.normal_balance,
      candidate_hits.vat_code,
      candidate_hits.catalog_account_id,
      candidate_hits.ledger_account_id,
      candidate_hits.already_active,
      candidate_hits.catalog_version,
      candidate_hits.explanation
  ),
  analysis_hits as (
    select
      analysis.suggested_account_number as number,
      count(distinct analysis.id)::integer as hits
    from public.bynex_document_analyses analysis
    where analysis.organization_id = p_organization_id
      and analysis.suggested_account_number is not null
      and (
        exists (
          select 1
          from terms
          where lower(
            coalesce(analysis.suggested_description,'') || ' '
            || coalesce(analysis.explanation,'') || ' '
            || coalesce(analysis.counterparty_name,'')
          ) like '%' || terms.term || '%'
        )
        or (
          v_supplier <> ''
          and lower(coalesce(analysis.counterparty_name,'')) like '%' || v_supplier || '%'
        )
        or (
          v_cost_type <> ''
          and lower(coalesce(analysis.suggested_cost_type,'')) = v_cost_type
        )
      )
    group by analysis.suggested_account_number
  ),
  voucher_hits as (
    select
      ledger.account_number as number,
      count(distinct voucher.id)::integer as hits
    from public.bookkeeping_voucher_lines line
    join public.bookkeeping_vouchers voucher
      on voucher.organization_id = line.organization_id
     and voucher.id = line.voucher_id
     and voucher.status = 'posted'
    join public.ledger_accounts ledger
      on ledger.organization_id = line.organization_id
     and ledger.id = line.account_id
    where line.organization_id = p_organization_id
      and exists (
        select 1
        from terms
        where lower(
          coalesce(voucher.description,'') || ' '
          || coalesce(line.description,'')
        ) like '%' || terms.term || '%'
      )
    group by ledger.account_number
  ),
  ranked as (
    select
      candidates.*,
      coalesce(analysis_hits.hits,0) as prior_analysis_hits,
      coalesce(voucher_hits.hits,0) as prior_voucher_hits,
      candidates.score
        + least(coalesce(analysis_hits.hits,0),5) * 12
        + least(coalesce(voucher_hits.hits,0),5) * 8
        + least(candidates.matching_terms,4) * 5
        as total_score
    from candidates
    left join analysis_hits on analysis_hits.number = candidates.account_number
    left join voucher_hits on voucher_hits.number = candidates.account_number
  )
  select
    ranked.account_number,
    ranked.account_name,
    ranked.account_type,
    ranked.normal_balance,
    ranked.vat_code,
    ranked.catalog_account_id,
    ranked.ledger_account_id,
    ranked.already_active,
    ranked.catalog_version,
    round(
      least(
        0.99,
        0.32
        + least(ranked.total_score,160)::numeric / 300
        + least(ranked.prior_analysis_hits,3)::numeric * 0.05
        + least(ranked.prior_voucher_hits,3)::numeric * 0.04
      ),
      2
    ) as confidence,
    ranked.prior_analysis_hits,
    ranked.prior_voucher_hits,
    concat_ws(
      ' · ',
      case
        when ranked.already_active then 'Aktivt konto'
        else 'Finns i vald kontoplanskatalog och måste aktiveras före bokföring'
      end,
      ranked.matching_terms::text || ' matchande ord',
      case when ranked.prior_analysis_hits > 0
        then ranked.prior_analysis_hits::text || ' liknande Smart-analyser'
      end,
      case when ranked.prior_voucher_hits > 0
        then ranked.prior_voucher_hits::text || ' liknande bokförda verifikationer'
      end,
      ranked.explanation
    ) as reason
  from ranked
  order by ranked.total_score desc,ranked.already_active desc,ranked.account_number
  limit v_limit;
end;
$$;

revoke all on function public.suggest_account_plan_accounts(
  uuid,text,text,text,integer
) from public,anon;
grant execute on function public.suggest_account_plan_accounts(
  uuid,text,text,text,integer
) to authenticated;

commit;
