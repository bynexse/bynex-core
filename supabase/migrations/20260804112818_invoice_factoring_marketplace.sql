begin;

-- Bynex is the technical marketplace. Only an approved financing partner may
-- make the credit decision, buy the receivable and pay out funds.
create table public.factoring_providers (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  name text not null,
  official_url text not null check (official_url ~ '^https://'),
  integration_status text not null default 'partner_dialogue'
    check (integration_status in ('catalogued','partner_dialogue','sandbox','available','paused')),
  supports_with_recourse boolean not null default true,
  supports_without_recourse boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.factoring_providers(
  slug,name,official_url,integration_status,supports_with_recourse,
  supports_without_recourse,sort_order
) values
  ('aros-kapital','Aros Kapital','https://aroskapital.se/tjanst/fakturakop/','partner_dialogue',true,true,10),
  ('prioritet-finans','Prioritet Finans','https://www.prioritet.se/fakturakop','partner_dialogue',true,true,20),
  ('ikano-bank','Ikano Bank','https://ikanobank.se/foretag/factoring/fakturakop','partner_dialogue',true,true,30)
on conflict(slug) do update set name=excluded.name,official_url=excluded.official_url,
  supports_with_recourse=excluded.supports_with_recourse,
  supports_without_recourse=excluded.supports_without_recourse,
  sort_order=excluded.sort_order,updated_at=now();

create table public.organization_factoring_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider_id uuid not null references public.factoring_providers(id) on delete restrict,
  external_customer_id text,
  status text not null default 'onboarding_required'
    check (status in ('onboarding_required','kyc_pending','active','suspended','closed')),
  secret_vault_id uuid,
  terms_accepted_at timestamptz,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,id),
  unique(organization_id,provider_id)
);

create table public.factoring_quote_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  invoice_id uuid not null,
  status text not null default 'queued'
    check (status in ('setup_required','queued','processing','offers_available','no_offer','accepted','expired','cancelled')),
  requested_by_user_id uuid not null references auth.users(id) on delete restrict,
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '24 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,id),
  unique(organization_id,invoice_id),
  foreign key(organization_id,invoice_id)
    references public.customer_invoices(organization_id,id) on delete restrict,
  check (expires_at>requested_at)
);

create table public.factoring_quotes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  request_id uuid not null,
  invoice_id uuid not null,
  provider_id uuid not null references public.factoring_providers(id) on delete restrict,
  provider_offer_id text not null,
  purchase_type text not null check (purchase_type in ('with_recourse','without_recourse')),
  invoice_face_value numeric(14,2) not null check (invoice_face_value>0),
  service_fee_amount numeric(14,2) not null check (service_fee_amount>=0),
  service_fee_percent numeric(7,4) not null check (service_fee_percent>=0),
  reserve_amount numeric(14,2) not null default 0 check (reserve_amount>=0),
  payout_amount numeric(14,2) not null check (payout_amount>=0),
  expected_payout_on date,
  terms_summary text not null check (char_length(terms_summary) between 10 and 4000),
  terms_document_url text not null check (terms_document_url ~ '^https://'),
  terms_hash text not null check (terms_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  status text not null default 'offered'
    check (status in ('offered','accepted','declined','expired','withdrawn')),
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(organization_id,id),
  unique(provider_id,provider_offer_id),
  foreign key(organization_id,request_id)
    references public.factoring_quote_requests(organization_id,id) on delete cascade,
  foreign key(organization_id,invoice_id)
    references public.customer_invoices(organization_id,id) on delete restrict,
  check (payout_amount=invoice_face_value-service_fee_amount-reserve_amount),
  check (expires_at>received_at)
);

create table public.factoring_acceptances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  request_id uuid not null,
  quote_id uuid not null,
  invoice_id uuid not null,
  signature_evidence_id uuid not null,
  accepted_by_user_id uuid not null references auth.users(id) on delete restrict,
  accepted_at timestamptz not null default now(),
  terms_hash text not null check (terms_hash ~ '^[0-9a-f]{64}$'),
  provider_transfer_reference text,
  payout_status text not null default 'pending'
    check (payout_status in ('pending','processing','paid','failed','cancelled')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique(organization_id,id),
  unique(quote_id),
  unique(invoice_id),
  foreign key(organization_id,request_id)
    references public.factoring_quote_requests(organization_id,id) on delete restrict,
  foreign key(organization_id,quote_id)
    references public.factoring_quotes(organization_id,id) on delete restrict,
  foreign key(organization_id,invoice_id)
    references public.customer_invoices(organization_id,id) on delete restrict,
  foreign key(organization_id,signature_evidence_id)
    references public.signature_evidence(organization_id,id) on delete restrict
);

create or replace function public.request_invoice_sale_offers(
  p_organization_id uuid,
  p_invoice_id uuid
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare request_id uuid;
declare request_status text;
begin
  if not private.has_organization_role(
    p_organization_id,array['owner','admin','office']::text[],(select auth.uid())
  ) then raise exception 'Behörighet saknas' using errcode='42501'; end if;
  if not exists(select 1 from public.customer_invoices i
    where i.organization_id=p_organization_id and i.id=p_invoice_id
      and i.status in ('issued','queued','sent','delivered','part_paid')
      and i.invoice_kind<>'credit' and i.amount_payable-i.amount_paid>0
      and i.factoring_status not in ('sold','rejected')) then
    raise exception 'Fakturan kan inte säljas' using errcode='23514';
  end if;
  request_status:=case when exists(
    select 1 from public.organization_factoring_connections c
    where c.organization_id=p_organization_id and c.status='active'
  ) then 'queued' else 'setup_required' end;
  insert into public.factoring_quote_requests(
    organization_id,invoice_id,status,requested_by_user_id
  ) values(p_organization_id,p_invoice_id,request_status,(select auth.uid()))
  on conflict(organization_id,invoice_id) do update set
    status=case when public.factoring_quote_requests.status in ('expired','cancelled','no_offer')
      then excluded.status else public.factoring_quote_requests.status end,
    updated_at=now()
  returning id into request_id;
  update public.customer_invoices set factoring_status='requested',updated_at=now()
  where organization_id=p_organization_id and id=p_invoice_id;
  insert into public.customer_invoice_events(
    organization_id,invoice_id,event_type,actor_user_id,safe_summary,metadata
  ) values(p_organization_id,p_invoice_id,'factoring_requested',(select auth.uid()),
    'Erbjudanden om fakturaköp begärda',jsonb_build_object('request_status',request_status));
  return request_id;
end;
$$;
revoke all on function public.request_invoice_sale_offers(uuid,uuid) from public,anon;
grant execute on function public.request_invoice_sale_offers(uuid,uuid) to authenticated;

create or replace function public.accept_factoring_quote(
  p_organization_id uuid,
  p_quote_id uuid,
  p_signature_evidence_id uuid
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare offer record;
declare evidence record;
declare acceptance_id uuid;
begin
  if not private.has_organization_role(
    p_organization_id,array['owner','admin']::text[],(select auth.uid())
  ) then raise exception 'Endast ägare eller administratör får sälja fakturan'
    using errcode='42501'; end if;
  select q.*,r.status request_status into offer
  from public.factoring_quotes q
  join public.factoring_quote_requests r
    on r.organization_id=q.organization_id and r.id=q.request_id
  where q.organization_id=p_organization_id and q.id=p_quote_id
    and q.status='offered' and q.expires_at>now()
  for update of q,r;
  if offer.id is null then raise exception 'Erbjudandet är inte giltigt' using errcode='P0002'; end if;
  if not exists(select 1 from public.customer_invoices i
    where i.organization_id=p_organization_id and i.id=offer.invoice_id
      and i.factoring_status in ('requested','offered') and i.amount_payable-i.amount_paid>0) then
    raise exception 'Fakturan är inte längre tillgänglig för försäljning' using errcode='23514';
  end if;
  select * into evidence from public.signature_evidence e
  where e.organization_id=p_organization_id and e.id=p_signature_evidence_id
    and e.signer_user_id=(select auth.uid())
    and e.provider_key in ('swedish-bankid','freja-eid');
  if evidence.id is null or evidence.content_hash<>offer.terms_hash then
    raise exception 'BankID/Freja-signaturen matchar inte factoringvillkoren'
      using errcode='42501';
  end if;
  insert into public.factoring_acceptances(
    organization_id,request_id,quote_id,invoice_id,signature_evidence_id,
    accepted_by_user_id,terms_hash
  ) values(
    p_organization_id,offer.request_id,offer.id,offer.invoice_id,p_signature_evidence_id,
    (select auth.uid()),offer.terms_hash
  ) returning id into acceptance_id;
  update public.factoring_quotes set status=case when id=offer.id then 'accepted' else 'declined' end
  where organization_id=p_organization_id and request_id=offer.request_id and status='offered';
  update public.factoring_quote_requests set status='accepted',updated_at=now()
  where organization_id=p_organization_id and id=offer.request_id;
  update public.customer_invoices set factoring_status='sold',updated_at=now()
  where organization_id=p_organization_id and id=offer.invoice_id;
  insert into public.customer_invoice_events(
    organization_id,invoice_id,event_type,actor_user_id,safe_summary,metadata
  ) values(p_organization_id,offer.invoice_id,'factoring_sold',(select auth.uid()),
    'Fakturaköp godkänt med e-legitimation',jsonb_build_object(
      'provider_id',offer.provider_id,'purchase_type',offer.purchase_type,
      'payout_amount',offer.payout_amount,'service_fee_amount',offer.service_fee_amount
    ));
  return acceptance_id;
end;
$$;
revoke all on function public.accept_factoring_quote(uuid,uuid,uuid) from public,anon;
grant execute on function public.accept_factoring_quote(uuid,uuid,uuid) to authenticated;

create or replace function private.block_factoring_acceptance_change()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if tg_op='DELETE' or row(
    new.organization_id,new.request_id,new.quote_id,new.invoice_id,
    new.signature_evidence_id,new.accepted_by_user_id,new.accepted_at,new.terms_hash,new.created_at
  ) is distinct from row(
    old.organization_id,old.request_id,old.quote_id,old.invoice_id,
    old.signature_evidence_id,old.accepted_by_user_id,old.accepted_at,old.terms_hash,old.created_at
  ) then
    raise exception 'Ett signerat factoringgodkännande är oföränderligt'
      using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function private.block_factoring_acceptance_change()
  from public,anon,authenticated;
create trigger block_factoring_acceptance_change
  before update or delete on public.factoring_acceptances
  for each row execute function private.block_factoring_acceptance_change();

do $$
declare t text;
begin
  foreach t in array array[
    'factoring_providers','organization_factoring_connections',
    'factoring_quote_requests','factoring_quotes','factoring_acceptances'
  ] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('alter table public.%I force row level security',t);
  end loop;
end $$;

create policy factoring_providers_read on public.factoring_providers
  for select to anon,authenticated using(active);
do $$
declare t text;
begin
  foreach t in array array[
    'organization_factoring_connections','factoring_quote_requests',
    'factoring_quotes','factoring_acceptances'
  ] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (private.has_organization_role(organization_id,array[''owner'',''admin'',''office'']::text[],(select auth.uid())))',
      t||'_finance_select',t
    );
  end loop;
end $$;
create policy organization_factoring_connections_admin_insert
  on public.organization_factoring_connections for insert to authenticated
  with check(created_by_user_id=(select auth.uid()) and private.has_organization_role(
    organization_id,array['owner','admin']::text[],(select auth.uid())
  ));
create policy organization_factoring_connections_admin_update
  on public.organization_factoring_connections for update to authenticated
  using(private.has_organization_role(
    organization_id,array['owner','admin']::text[],(select auth.uid())
  )) with check(private.has_organization_role(
    organization_id,array['owner','admin']::text[],(select auth.uid())
  ));

revoke all on public.factoring_providers,public.organization_factoring_connections,
  public.factoring_quote_requests,public.factoring_quotes,public.factoring_acceptances
from anon,authenticated;
grant select on public.factoring_providers to anon,authenticated;
grant select,insert,update on public.organization_factoring_connections to authenticated;
grant select on public.factoring_quote_requests,public.factoring_quotes,
  public.factoring_acceptances to authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'factoring_providers','organization_factoring_connections',
    'factoring_quote_requests'
  ] loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',t
    );
  end loop;
end $$;
do $$
declare t text;
begin
  foreach t in array array[
    'organization_factoring_connections','factoring_quote_requests',
    'factoring_quotes','factoring_acceptances'
  ] loop
    execute format(
      'create trigger write_audit_log after insert or update or delete on public.%I for each row execute function private.write_audit_log()',t
    );
  end loop;
end $$;

create index factoring_quote_requests_queue_idx
  on public.factoring_quote_requests(status,requested_at)
  where status in ('queued','processing');
create index factoring_quotes_request_idx
  on public.factoring_quotes(organization_id,request_id,status,expires_at);

commit;
