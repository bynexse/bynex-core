begin;

alter table public.suppliers
  add column linked_customer_id uuid,
  add column address_line1 text,
  add column address_line2 text,
  add column postal_code text,
  add column city text,
  add column country_code text not null default 'SE' check (country_code ~ '^[A-Z]{2}$'),
  add column iban text,
  add column bic text,
  add foreign key(organization_id,linked_customer_id)
    references public.customers(organization_id,id) on delete set null (linked_customer_id);

alter table public.supplier_invoices
  drop constraint supplier_invoices_source_check,
  add constraint supplier_invoices_source_check
    check (source in ('email','edi','api','upload','self_billing'));

create table public.self_billing_agreements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_id uuid not null,
  agreement_number text not null,
  valid_from date not null,
  valid_to date,
  seller_approval_method text not null
    check (seller_approval_method in ('bankid','freja_eid','secure_portal')),
  terms_document_url text not null check (terms_document_url ~ '^https://'),
  terms_hash text not null check (terms_hash ~ '^[0-9a-f]{64}$'),
  buyer_signature_evidence_id uuid,
  seller_signature_evidence_id uuid,
  status text not null default 'draft'
    check (status in ('draft','awaiting_signatures','active','expired','terminated')),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,id),
  unique(organization_id,agreement_number),
  foreign key(organization_id,supplier_id)
    references public.suppliers(organization_id,id) on delete restrict,
  foreign key(organization_id,buyer_signature_evidence_id)
    references public.signature_evidence(organization_id,id) on delete restrict,
  foreign key(organization_id,seller_signature_evidence_id)
    references public.signature_evidence(organization_id,id) on delete restrict,
  check (valid_to is null or valid_to>=valid_from),
  check (status<>'active' or (buyer_signature_evidence_id is not null and seller_signature_evidence_id is not null))
);

-- Self-billing must use a separate consecutive number series for each seller.
create table private.self_billing_number_sequences (
  organization_id uuid not null,
  supplier_id uuid not null,
  prefix text not null check (prefix ~ '^[A-Z0-9-]{1,20}$'),
  next_number bigint not null default 1 check (next_number>0),
  updated_at timestamptz not null default now(),
  primary key(organization_id,supplier_id),
  unique(organization_id,prefix),
  foreign key(organization_id,supplier_id)
    references public.suppliers(organization_id,id) on delete cascade
);

create table public.self_billing_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  agreement_id uuid not null,
  supplier_id uuid not null,
  supplier_invoice_id uuid not null,
  self_billing_number text,
  label text not null default 'Självfakturering' check (label='Självfakturering'),
  status text not null default 'draft'
    check (status in ('draft','awaiting_seller_approval','seller_approved','issued','seller_rejected','void')),
  supplier_snapshot jsonb not null default '{}',
  buyer_snapshot jsonb not null default '{}',
  content_hash text check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  seller_approval_method text,
  seller_signature_evidence_id uuid,
  seller_approved_at timestamptz,
  issued_by_user_id uuid references auth.users(id) on delete restrict,
  issued_at timestamptz,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,id),
  unique(organization_id,self_billing_number),
  unique(organization_id,supplier_invoice_id),
  foreign key(organization_id,agreement_id)
    references public.self_billing_agreements(organization_id,id) on delete restrict,
  foreign key(organization_id,supplier_id)
    references public.suppliers(organization_id,id) on delete restrict,
  foreign key(organization_id,supplier_invoice_id)
    references public.supplier_invoices(organization_id,id) on delete restrict,
  foreign key(organization_id,seller_signature_evidence_id)
    references public.signature_evidence(organization_id,id) on delete restrict,
  check ((status in ('seller_approved','issued'))=(seller_approved_at is not null and seller_approval_method is not null)
     or status not in ('seller_approved','issued')),
  check ((status='issued')=(self_billing_number is not null and issued_at is not null and content_hash is not null)
     or status<>'issued')
);

create table private.self_billing_approval_tokens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  self_billing_document_id uuid not null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  recipient_email text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key(organization_id,self_billing_document_id)
    references public.self_billing_documents(organization_id,id) on delete cascade
);

create table public.self_billing_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  self_billing_document_id uuid not null,
  event_type text not null check (event_type in (
    'draft_created','approval_requested','seller_approved','seller_rejected','issued','voided'
  )),
  actor_user_id uuid references auth.users(id) on delete set null,
  safe_summary text not null,
  created_at timestamptz not null default now(),
  foreign key(organization_id,self_billing_document_id)
    references public.self_billing_documents(organization_id,id) on delete cascade
);

create or replace function public.link_supplier_to_existing_customer(
  p_organization_id uuid,
  p_customer_id uuid,
  p_supplier_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare c record;
declare result_id uuid;
begin
  if not private.has_organization_role(
    p_organization_id,array['owner','admin','office']::text[],(select auth.uid())
  ) then raise exception 'Behörighet saknas' using errcode='42501'; end if;
  select * into c from public.customers
  where organization_id=p_organization_id and id=p_customer_id and active;
  if c.id is null then raise exception 'Kunden saknas' using errcode='P0002'; end if;
  if p_supplier_id is null then
    insert into public.suppliers(
      organization_id,name,organization_number,vat_number,email,phone,
      payment_terms_days,address_line1,address_line2,postal_code,city,country_code,
      linked_customer_id
    ) values(
      p_organization_id,c.legal_name,c.organization_number,c.vat_number,c.email,c.phone,
      c.default_payment_terms_days,c.address_line1,c.address_line2,c.postal_code,c.city,
      c.country_code,c.id
    ) returning id into result_id;
  else
    update public.suppliers s set name=c.legal_name,organization_number=c.organization_number,
      vat_number=c.vat_number,email=c.email,phone=c.phone,
      payment_terms_days=c.default_payment_terms_days,address_line1=c.address_line1,
      address_line2=c.address_line2,postal_code=c.postal_code,city=c.city,
      country_code=c.country_code,linked_customer_id=c.id,updated_at=now()
    where s.organization_id=p_organization_id and s.id=p_supplier_id
    returning s.id into result_id;
  end if;
  if result_id is null then raise exception 'Leverantören saknas' using errcode='P0002'; end if;
  return result_id;
end;
$$;
revoke all on function public.link_supplier_to_existing_customer(uuid,uuid,uuid)
  from public,anon;
grant execute on function public.link_supplier_to_existing_customer(uuid,uuid,uuid)
  to authenticated;

create or replace function public.create_self_billing_draft(
  p_organization_id uuid,
  p_agreement_id uuid,
  p_invoice_date date,
  p_due_date date
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare agreement record;
declare invoice_id uuid;
declare document_id uuid;
begin
  if not private.has_organization_role(
    p_organization_id,array['owner','admin','office']::text[],(select auth.uid())
  ) then raise exception 'Behörighet saknas' using errcode='42501'; end if;
  select * into agreement from public.self_billing_agreements a
  where a.organization_id=p_organization_id and a.id=p_agreement_id and a.status='active'
    and a.valid_from<=p_invoice_date and (a.valid_to is null or a.valid_to>=p_invoice_date);
  if agreement.id is null then raise exception 'Aktivt självfaktureringsavtal saknas' using errcode='P0002'; end if;
  if p_due_date<p_invoice_date then raise exception 'Förfallodatum är felaktigt' using errcode='22023'; end if;
  insert into public.supplier_invoices(
    organization_id,supplier_id,source,source_reference,invoice_kind,
    invoice_date,due_date,status,raw_metadata
  ) values(
    p_organization_id,agreement.supplier_id,'self_billing',p_agreement_id::text,
    'invoice',p_invoice_date,p_due_date,'review',
    jsonb_build_object('self_billing',true,'agreement_id',p_agreement_id)
  ) returning id into invoice_id;
  insert into public.self_billing_documents(
    organization_id,agreement_id,supplier_id,supplier_invoice_id,created_by_user_id
  ) values(
    p_organization_id,p_agreement_id,agreement.supplier_id,invoice_id,(select auth.uid())
  ) returning id into document_id;
  insert into public.self_billing_events(
    organization_id,self_billing_document_id,event_type,actor_user_id,safe_summary
  ) values(p_organization_id,document_id,'draft_created',(select auth.uid()),
    'Självfaktureringsutkast skapat');
  return document_id;
end;
$$;
revoke all on function public.create_self_billing_draft(uuid,uuid,date,date)
  from public,anon;
grant execute on function public.create_self_billing_draft(uuid,uuid,date,date)
  to authenticated;

create or replace function private.allocate_self_billing_number(
  p_organization_id uuid,p_supplier_id uuid
)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare seq record;
begin
  select * into seq from private.self_billing_number_sequences
  where organization_id=p_organization_id and supplier_id=p_supplier_id for update;
  if seq.prefix is null then
    raise exception 'Separat nummerserie saknas för leverantören' using errcode='P0002';
  end if;
  update private.self_billing_number_sequences set next_number=next_number+1,updated_at=now()
  where organization_id=p_organization_id and supplier_id=p_supplier_id;
  return seq.prefix||lpad(seq.next_number::text,8,'0');
end;
$$;
revoke all on function private.allocate_self_billing_number(uuid,uuid)
  from public,anon,authenticated;

create or replace function public.configure_self_billing_sequence(
  p_organization_id uuid,p_supplier_id uuid,p_prefix text
)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if not private.has_organization_role(
    p_organization_id,array['owner','admin']::text[],(select auth.uid())
  ) then raise exception 'Behörighet saknas' using errcode='42501'; end if;
  if p_prefix !~ '^[A-Z0-9-]{1,20}$' then
    raise exception 'Ogiltigt prefix' using errcode='22023';
  end if;
  if not exists(select 1 from public.suppliers s
    where s.organization_id=p_organization_id and s.id=p_supplier_id) then
    raise exception 'Leverantören saknas' using errcode='P0002';
  end if;
  insert into private.self_billing_number_sequences(
    organization_id,supplier_id,prefix
  ) values(p_organization_id,p_supplier_id,p_prefix)
  on conflict(organization_id,supplier_id) do update
    set prefix=excluded.prefix,updated_at=now();
end;
$$;
revoke all on function public.configure_self_billing_sequence(uuid,uuid,text)
  from public,anon;
grant execute on function public.configure_self_billing_sequence(uuid,uuid,text)
  to authenticated;

create or replace function public.request_self_billing_approval(
  p_organization_id uuid,p_document_id uuid
)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare doc record;
declare inv record;
declare hash text;
begin
  if not private.has_organization_role(
    p_organization_id,array['owner','admin','office']::text[],(select auth.uid())
  ) then raise exception 'Behörighet saknas' using errcode='42501'; end if;
  select * into doc from public.self_billing_documents
  where organization_id=p_organization_id and id=p_document_id and status='draft' for update;
  if doc.id is null then raise exception 'Självfaktureringsutkast saknas' using errcode='P0002'; end if;
  select * into inv from public.supplier_invoices
  where organization_id=p_organization_id and id=doc.supplier_invoice_id;
  if inv.total_amount is null or inv.total_amount<=0 or not exists(
    select 1 from public.supplier_invoice_lines l
    where l.organization_id=p_organization_id and l.supplier_invoice_id=inv.id
  ) then raise exception 'Kompletta rader och belopp krävs' using errcode='23514'; end if;
  hash:=encode(extensions.digest(convert_to(jsonb_build_object(
    'document_id',doc.id,'agreement_id',doc.agreement_id,'supplier_id',doc.supplier_id,
    'invoice_date',inv.invoice_date,'due_date',inv.due_date,'net_amount',inv.net_amount,
    'vat_amount',inv.vat_amount,'total_amount',inv.total_amount,
    'lines',(select jsonb_agg(to_jsonb(l)-'metadata' order by l.line_number)
      from public.supplier_invoice_lines l
      where l.organization_id=p_organization_id and l.supplier_invoice_id=inv.id)
  )::text,'UTF8'),'sha256'),'hex');
  update public.self_billing_documents set status='awaiting_seller_approval',
    content_hash=hash,updated_at=now() where id=p_document_id;
  insert into public.self_billing_events(
    organization_id,self_billing_document_id,event_type,actor_user_id,safe_summary
  ) values(p_organization_id,p_document_id,'approval_requested',(select auth.uid()),
    'Säljarens godkännande begärt');
  return hash;
end;
$$;
revoke all on function public.request_self_billing_approval(uuid,uuid) from public,anon;
grant execute on function public.request_self_billing_approval(uuid,uuid) to authenticated;

create or replace function private.record_self_billing_seller_approval(
  p_organization_id uuid,
  p_document_id uuid,
  p_method text,
  p_signature_evidence_id uuid default null
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare doc record;
begin
  select d.*,a.seller_approval_method into doc from public.self_billing_documents d
  join public.self_billing_agreements a on a.organization_id=d.organization_id and a.id=d.agreement_id
  where d.organization_id=p_organization_id and d.id=p_document_id
    and d.status='awaiting_seller_approval' for update of d;
  if doc.id is null or p_method<>doc.seller_approval_method then
    raise exception 'Godkännandet matchar inte avtalet' using errcode='42501';
  end if;
  if p_method in ('bankid','freja_eid') and not exists(
    select 1 from public.signature_evidence e
    where e.organization_id=p_organization_id and e.id=p_signature_evidence_id
      and e.content_hash=doc.content_hash
      and ((p_method='bankid' and e.provider_key='swedish-bankid')
        or (p_method='freja_eid' and e.provider_key='freja-eid'))
  ) then raise exception 'Giltigt signeringsbevis saknas' using errcode='42501'; end if;
  update public.self_billing_documents set status='seller_approved',
    seller_approval_method=p_method,seller_signature_evidence_id=p_signature_evidence_id,
    seller_approved_at=now(),updated_at=now()
  where id=p_document_id;
  insert into public.self_billing_events(
    organization_id,self_billing_document_id,event_type,safe_summary
  ) values(p_organization_id,p_document_id,'seller_approved','Säljaren godkände självfakturan');
end;
$$;
revoke all on function private.record_self_billing_seller_approval(uuid,uuid,text,uuid)
  from public,anon,authenticated;

create or replace function public.issue_self_billing_document(
  p_organization_id uuid,p_document_id uuid
)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare doc record;
declare supplier record;
declare buyer record;
declare inv record;
declare number text;
declare hash text;
declare approval_hash text;
begin
  if not private.has_organization_role(
    p_organization_id,array['owner','admin','office']::text[],(select auth.uid())
  ) then raise exception 'Behörighet saknas' using errcode='42501'; end if;
  select * into doc from public.self_billing_documents
  where organization_id=p_organization_id and id=p_document_id and status='seller_approved' for update;
  if doc.id is null then raise exception 'Säljarens godkännande krävs' using errcode='23514'; end if;
  select * into inv from public.supplier_invoices
  where organization_id=p_organization_id and id=doc.supplier_invoice_id;
  if inv.total_amount is null or inv.total_amount<=0 or not exists(
    select 1 from public.supplier_invoice_lines l
    where l.organization_id=p_organization_id and l.supplier_invoice_id=inv.id
  ) then raise exception 'Kompletta fakturarader och belopp krävs' using errcode='23514'; end if;
  select * into supplier from public.suppliers
  where organization_id=p_organization_id and id=doc.supplier_id;
  select * into buyer from public.invoice_issuer_profiles
  where organization_id=p_organization_id and active;
  if supplier.id is null or buyer.organization_id is null or supplier.address_line1 is null
     or supplier.postal_code is null or supplier.city is null then
    raise exception 'Kompletta säljar- och köparuppgifter krävs' using errcode='23514';
  end if;
  approval_hash:=encode(extensions.digest(convert_to(jsonb_build_object(
    'document_id',doc.id,'agreement_id',doc.agreement_id,'supplier_id',doc.supplier_id,
    'invoice_date',inv.invoice_date,'due_date',inv.due_date,'net_amount',inv.net_amount,
    'vat_amount',inv.vat_amount,'total_amount',inv.total_amount,
    'lines',(select jsonb_agg(to_jsonb(l)-'metadata' order by l.line_number)
      from public.supplier_invoice_lines l
      where l.organization_id=p_organization_id and l.supplier_invoice_id=inv.id)
  )::text,'UTF8'),'sha256'),'hex');
  if approval_hash<>doc.content_hash then
    raise exception 'Självfakturan har ändrats efter säljarens godkännande'
      using errcode='42501';
  end if;
  number:=private.allocate_self_billing_number(p_organization_id,doc.supplier_id);
  hash:=encode(extensions.digest(convert_to(jsonb_build_object(
    'document_id',doc.id,'number',number,'agreement_id',doc.agreement_id,
    'supplier_id',doc.supplier_id,'invoice_date',inv.invoice_date,
    'net_amount',inv.net_amount,'vat_amount',inv.vat_amount,'total_amount',inv.total_amount,
    'lines',(select jsonb_agg(to_jsonb(l)-'metadata' order by l.line_number)
      from public.supplier_invoice_lines l where l.organization_id=p_organization_id and l.supplier_invoice_id=inv.id)
  )::text,'UTF8'),'sha256'),'hex');
  update public.self_billing_documents set status='issued',self_billing_number=number,
    supplier_snapshot=jsonb_strip_nulls(jsonb_build_object(
      'name',supplier.name,'organization_number',supplier.organization_number,
      'vat_number',supplier.vat_number,'email',supplier.email,'phone',supplier.phone,
      'address_line1',supplier.address_line1,'address_line2',supplier.address_line2,
      'postal_code',supplier.postal_code,'city',supplier.city,'country_code',supplier.country_code,
      'bankgiro',supplier.bankgiro,'plusgiro',supplier.plusgiro,'iban',supplier.iban,'bic',supplier.bic
    )),buyer_snapshot=jsonb_strip_nulls(jsonb_build_object(
      'legal_name',buyer.legal_name,'organization_number',buyer.organization_number,
      'vat_number',buyer.vat_number,'address_line1',buyer.address_line1,
      'postal_code',buyer.postal_code,'city',buyer.city,'country_code',buyer.country_code
    )),content_hash=hash,issued_by_user_id=(select auth.uid()),issued_at=now(),updated_at=now()
  where id=p_document_id;
  update public.supplier_invoices set invoice_number=number,status='approved',
    approved_by_user_id=(select auth.uid()),approved_at=now(),
    content_fingerprint=hash,updated_at=now()
  where organization_id=p_organization_id and id=doc.supplier_invoice_id;
  insert into public.self_billing_events(
    organization_id,self_billing_document_id,event_type,actor_user_id,safe_summary
  ) values(p_organization_id,p_document_id,'issued',(select auth.uid()),
    'Självfaktura '||number||' utställd');
  return number;
end;
$$;
revoke all on function public.issue_self_billing_document(uuid,uuid) from public,anon;
grant execute on function public.issue_self_billing_document(uuid,uuid) to authenticated;

create or replace function private.block_issued_self_billing_change()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if old.status='issued' then
    raise exception 'Utställd självfaktura är oföränderlig' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function private.block_issued_self_billing_change()
  from public,anon,authenticated;
create trigger block_issued_self_billing_change
  before update or delete on public.self_billing_documents
  for each row execute function private.block_issued_self_billing_change();

create or replace function private.guard_self_billing_invoice_line()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare selected_org_id uuid:=coalesce(new.organization_id,old.organization_id);
declare selected_invoice_id uuid:=coalesce(new.supplier_invoice_id,old.supplier_invoice_id);
begin
  if exists(select 1 from public.self_billing_documents d
    where d.organization_id=selected_org_id and d.supplier_invoice_id=selected_invoice_id
      and d.status<>'draft') then
    raise exception 'Självfakturans rader är låsta efter att godkännande begärts'
      using errcode='42501';
  end if;
  return coalesce(new,old);
end;
$$;
revoke all on function private.guard_self_billing_invoice_line()
  from public,anon,authenticated;
create trigger guard_self_billing_invoice_line
  before insert or update or delete on public.supplier_invoice_lines
  for each row execute function private.guard_self_billing_invoice_line();

do $$
declare t text;
begin
  foreach t in array array['self_billing_agreements','self_billing_documents','self_billing_events'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('alter table public.%I force row level security',t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (private.has_organization_role(organization_id,array[''owner'',''admin'',''office'']::text[],(select auth.uid())))',
      t||'_finance_select',t
    );
  end loop;
end $$;
create policy self_billing_agreements_finance_insert on public.self_billing_agreements
  for insert to authenticated with check(created_by_user_id=(select auth.uid()) and private.has_organization_role(
    organization_id,array['owner','admin','office']::text[],(select auth.uid())
  ));
create policy self_billing_agreements_finance_update on public.self_billing_agreements
  for update to authenticated using(private.has_organization_role(
    organization_id,array['owner','admin','office']::text[],(select auth.uid())
  )) with check(private.has_organization_role(
    organization_id,array['owner','admin','office']::text[],(select auth.uid())
  ));

revoke all on public.self_billing_agreements,public.self_billing_documents,
  public.self_billing_events from anon,authenticated;
grant select,insert,update on public.self_billing_agreements to authenticated;
grant select on public.self_billing_documents,public.self_billing_events to authenticated;
revoke all on private.self_billing_number_sequences,private.self_billing_approval_tokens
  from public,anon,authenticated;

do $$
declare t text;
begin
  foreach t in array array['self_billing_agreements','self_billing_documents'] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',t);
  end loop;
  foreach t in array array['self_billing_agreements','self_billing_documents','self_billing_events'] loop
    execute format('create trigger write_audit_log after insert or update or delete on public.%I for each row execute function private.write_audit_log()',t);
  end loop;
end $$;

create index self_billing_documents_supplier_idx
  on public.self_billing_documents(organization_id,supplier_id,status,created_at desc);
create index self_billing_events_document_idx
  on public.self_billing_events(organization_id,self_billing_document_id,created_at);

commit;
