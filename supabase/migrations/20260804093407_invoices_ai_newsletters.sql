begin;

-- Supplier invoice intake, AI-assisted one-click decisions and consent-based
-- newsletters. All customer-owned rows carry organization_id and use composite
-- foreign keys so a reference can never cross tenant boundaries.

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  organization_number text,
  vat_number text,
  email text,
  phone text,
  bankgiro text,
  plusgiro text,
  payment_terms_days integer check (payment_terms_days between 0 and 365),
  default_project_id uuid,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, default_project_id)
    references public.projects (organization_id, id)
    on delete set null (default_project_id)
);

create unique index suppliers_org_number_unique
  on public.suppliers (organization_id, lower(btrim(organization_number)))
  where organization_number is not null and btrim(organization_number) <> '';
create index suppliers_org_name_idx
  on public.suppliers (organization_id, lower(name)) where active;

create table public.invoice_inboxes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  local_part text not null check (local_part ~ '^[a-z0-9-]{20,80}$'),
  email_address text not null check (email_address ~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$'),
  provider text not null default 'postmark',
  is_primary boolean not null default true,
  status text not null default 'active' check (status in ('active','paused','retired')),
  last_received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (local_part)
);

create unique index invoice_inboxes_email_unique on public.invoice_inboxes (lower(email_address));
create unique index invoice_inboxes_one_primary_active
  on public.invoice_inboxes (organization_id)
  where is_primary and status = 'active';

create table public.edi_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null,
  format text not null check (format in ('peppol_bis_billing_3','svefaktura','edi','custom_api')),
  external_identifier text,
  secret_reference text,
  configuration jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','active','paused','error','disconnected')),
  last_sync_at timestamptz,
  last_error_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, provider, external_identifier)
);

create table public.supplier_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_id uuid,
  project_id uuid,
  inbox_id uuid,
  edi_connection_id uuid,
  source text not null check (source in ('email','edi','api','upload')),
  source_reference text,
  invoice_kind text not null default 'invoice' check (invoice_kind in ('invoice','credit_note')),
  invoice_number text,
  invoice_date date,
  due_date date,
  currency text not null default 'SEK' check (currency ~ '^[A-Z]{3}$'),
  net_amount numeric(16,2),
  vat_amount numeric(16,2),
  total_amount numeric(16,2),
  amount_due numeric(16,2),
  ocr_reference text,
  purchase_order_reference text,
  project_reference text,
  content_fingerprint text,
  duplicate_of_invoice_id uuid,
  status text not null default 'received'
    check (status in ('received','parsing','review','matched','approved','exported','rejected','duplicate','failed')),
  parsing_error_code text,
  approved_by_user_id uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  exported_at timestamptz,
  accounting_export_reference text,
  raw_metadata jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, supplier_id)
    references public.suppliers (organization_id, id)
    on delete set null (supplier_id),
  foreign key (organization_id, project_id)
    references public.projects (organization_id, id)
    on delete set null (project_id),
  foreign key (organization_id, inbox_id)
    references public.invoice_inboxes (organization_id, id)
    on delete set null (inbox_id),
  foreign key (organization_id, edi_connection_id)
    references public.edi_connections (organization_id, id)
    on delete set null (edi_connection_id),
  foreign key (organization_id, duplicate_of_invoice_id)
    references public.supplier_invoices (organization_id, id)
    on delete set null (duplicate_of_invoice_id),
  check (due_date is null or invoice_date is null or due_date >= invoice_date),
  check ((status not in ('approved','exported')) or (approved_at is not null and approved_by_user_id is not null)),
  check ((status <> 'exported') or exported_at is not null)
);

create unique index supplier_invoices_source_idempotency
  on public.supplier_invoices (organization_id, source, source_reference)
  where source_reference is not null;
create index supplier_invoices_review_queue_idx
  on public.supplier_invoices (organization_id, status, received_at desc)
  where status in ('received','parsing','review','matched','failed');
create index supplier_invoices_project_date_idx
  on public.supplier_invoices (organization_id, project_id, invoice_date desc)
  where project_id is not null;
create index supplier_invoices_fingerprint_idx
  on public.supplier_invoices (organization_id, content_fingerprint)
  where content_fingerprint is not null;
create index supplier_invoices_supplier_number_idx
  on public.supplier_invoices (organization_id, supplier_id, invoice_number)
  where supplier_id is not null and invoice_number is not null;

create table public.supplier_invoice_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_invoice_id uuid not null,
  file_role text not null check (file_role in ('original_pdf','original_xml','attachment','preview')),
  storage_bucket text not null default 'supplier-invoices' check (storage_bucket = 'supplier-invoices'),
  storage_path text not null,
  original_filename text not null,
  media_type text,
  size_bytes bigint check (size_bytes is null or size_bytes between 0 and 36700160),
  checksum_sha256 text,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, storage_path),
  foreign key (organization_id, supplier_invoice_id)
    references public.supplier_invoices (organization_id, id) on delete cascade
);

create table public.supplier_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_invoice_id uuid not null,
  project_id uuid,
  line_number integer not null check (line_number > 0),
  description text,
  article_number text,
  quantity numeric(16,4),
  unit text,
  unit_price numeric(16,4),
  net_amount numeric(16,2),
  vat_rate numeric(7,4),
  vat_amount numeric(16,2),
  account_code text,
  cost_center text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, supplier_invoice_id, line_number),
  foreign key (organization_id, supplier_invoice_id)
    references public.supplier_invoices (organization_id, id) on delete cascade,
  foreign key (organization_id, project_id)
    references public.projects (organization_id, id)
    on delete set null (project_id)
);

create table public.supplier_invoice_routing_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_id uuid,
  project_id uuid not null,
  rule_type text not null check (rule_type in ('supplier_default','project_reference','purchase_order','ocr_pattern','sender_email','line_text')),
  match_value text,
  priority integer not null default 100 check (priority between 0 and 10000),
  active boolean not null default true,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, supplier_id)
    references public.suppliers (organization_id, id)
    on delete cascade,
  foreign key (organization_id, project_id)
    references public.projects (organization_id, id) on delete cascade
);

create table public.supplier_invoice_suggestions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_invoice_id uuid not null,
  suggestion_type text not null check (suggestion_type in ('supplier','project','account','vat','duplicate')),
  suggested_supplier_id uuid,
  suggested_project_id uuid,
  suggested_value text,
  confidence numeric(6,5) not null check (confidence between 0 and 1),
  rationale text not null,
  evidence jsonb not null default '{}'::jsonb,
  method text not null default 'ai' check (method in ('deterministic','ai','combined')),
  model_provider text,
  model_name text,
  model_version text,
  status text not null default 'pending' check (status in ('pending','accepted','rejected','superseded')),
  reviewed_by_user_id uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, supplier_invoice_id)
    references public.supplier_invoices (organization_id, id) on delete cascade,
  foreign key (organization_id, suggested_supplier_id)
    references public.suppliers (organization_id, id)
    on delete set null (suggested_supplier_id),
  foreign key (organization_id, suggested_project_id)
    references public.projects (organization_id, id)
    on delete set null (suggested_project_id)
);

create table public.invoice_ingestion_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_invoice_id uuid,
  source text not null check (source in ('email','edi','api','upload')),
  idempotency_key text not null,
  event_type text not null,
  status text not null default 'received' check (status in ('received','processing','succeeded','retrying','failed','discarded')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 100),
  next_attempt_at timestamptz,
  error_code text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, source, idempotency_key),
  foreign key (organization_id, supplier_invoice_id)
    references public.supplier_invoices (organization_id, id)
    on delete set null (supplier_invoice_id)
);

-- A generic AI action queue powers the Bynex three-second rule. AI and rules
-- may prepare an action, but consequential actions remain immutable until an
-- authorized person approves or rejects them with one call.
create table public.ai_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  action_type text not null,
  entity_type text not null,
  entity_id uuid,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  summary text not null check (char_length(btrim(summary)) between 1 and 2000),
  proposed_changes jsonb not null default '{}'::jsonb,
  confidence numeric(6,5) check (confidence between 0 and 1),
  risk_level text not null default 'medium' check (risk_level in ('low','medium','high','critical')),
  authorized_roles text[] not null default array['owner','admin','office']::text[],
  requires_human_approval boolean not null default true,
  status text not null default 'ready'
    check (status in ('ready','needs_review','approved','executing','completed','rejected','failed','expired')),
  idempotency_key text,
  model_provider text,
  model_name text,
  model_version text,
  approved_by_user_id uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  executed_at timestamptz,
  expires_at timestamptz,
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  check (cardinality(authorized_roles) between 1 and 7),
  check (authorized_roles <@ array['owner','admin','office','manager','supervisor','employee','contractor']::text[]),
  check ((status not in ('approved','executing','completed')) or (approved_by_user_id is not null and approved_at is not null))
);

create unique index ai_actions_idempotency_unique
  on public.ai_actions (organization_id, idempotency_key)
  where idempotency_key is not null;
create index ai_actions_ready_queue_idx
  on public.ai_actions (organization_id, status, risk_level, created_at desc)
  where status in ('ready','needs_review','approved','executing','failed');

create table public.ai_action_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  ai_action_id uuid not null,
  event_type text not null check (event_type in ('created','approved','rejected','started','completed','failed','expired')),
  actor_user_id uuid references auth.users(id) on delete set null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, ai_action_id)
    references public.ai_actions (organization_id, id) on delete cascade
);

-- Consent-based newsletter engine for Bynex customers and each tenant's own
-- audiences (for example residents). Subscriber evidence and delivery history
-- are kept separate from campaign content.
create table public.newsletter_sender_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  from_name text not null,
  from_email text not null,
  reply_to_email text,
  postal_address text,
  provider text not null default 'postmark',
  provider_stream text,
  domain_verified boolean not null default false,
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);

create unique index newsletter_sender_default_unique
  on public.newsletter_sender_profiles (organization_id)
  where is_default and active;

create table public.newsletter_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null check (email ~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$'),
  full_name text,
  phone text,
  external_reference text,
  tags text[] not null default '{}'::text[],
  source text not null default 'manual' check (source in ('manual','import','resident','customer','lead','api')),
  status text not null default 'active' check (status in ('active','suppressed','deleted')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);

create unique index newsletter_contacts_email_unique
  on public.newsletter_contacts (organization_id, lower(btrim(email)))
  where status <> 'deleted';

create table public.newsletter_lists (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  list_type text not null default 'standard' check (list_type in ('standard','customers','residents','leads')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, name)
);

create table public.newsletter_list_contacts (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  newsletter_list_id uuid not null,
  newsletter_contact_id uuid not null,
  added_at timestamptz not null default now(),
  primary key (organization_id, newsletter_list_id, newsletter_contact_id),
  foreign key (organization_id, newsletter_list_id)
    references public.newsletter_lists (organization_id, id) on delete cascade,
  foreign key (organization_id, newsletter_contact_id)
    references public.newsletter_contacts (organization_id, id) on delete cascade
);

create table public.newsletter_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  newsletter_contact_id uuid not null,
  topic_key text not null,
  status text not null default 'pending'
    check (status in ('pending','subscribed','unsubscribed','bounced','complained')),
  consent_version text,
  consent_statement text,
  consent_source text,
  consent_at timestamptz,
  unsubscribe_token_hash text,
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, newsletter_contact_id, topic_key),
  foreign key (organization_id, newsletter_contact_id)
    references public.newsletter_contacts (organization_id, id) on delete cascade,
  check ((status <> 'subscribed') or (consent_at is not null and consent_statement is not null)),
  check ((status <> 'unsubscribed') or unsubscribed_at is not null)
);

create unique index newsletter_unsubscribe_token_hash_unique
  on public.newsletter_subscriptions (unsubscribe_token_hash)
  where unsubscribe_token_hash is not null;

create table public.newsletter_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sender_profile_id uuid,
  newsletter_list_id uuid,
  name text not null,
  campaign_type text not null default 'newsletter'
    check (campaign_type in ('newsletter','offer','seasonal_tip','accounting_tip','property_update')),
  subject text not null,
  preview_text text,
  content_html text not null,
  content_text text,
  audience_filter jsonb not null default '{}'::jsonb,
  prepared_by_ai boolean not null default true,
  status text not null default 'draft'
    check (status in ('draft','ready','approved','scheduled','sending','sent','cancelled','failed')),
  scheduled_at timestamptz,
  approved_by_user_id uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  sent_at timestamptz,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, sender_profile_id)
    references public.newsletter_sender_profiles (organization_id, id)
    on delete set null (sender_profile_id),
  foreign key (organization_id, newsletter_list_id)
    references public.newsletter_lists (organization_id, id)
    on delete set null (newsletter_list_id),
  check ((status not in ('approved','scheduled','sending','sent')) or (approved_by_user_id is not null and approved_at is not null)),
  check ((status <> 'scheduled') or scheduled_at is not null),
  check ((status <> 'sent') or sent_at is not null)
);

create table public.newsletter_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  newsletter_campaign_id uuid not null,
  newsletter_contact_id uuid not null,
  newsletter_subscription_id uuid not null,
  email_snapshot text not null,
  provider_message_id text,
  status text not null default 'queued'
    check (status in ('queued','sent','delivered','bounced','complained','unsubscribed','failed','suppressed')),
  sent_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, newsletter_campaign_id, newsletter_contact_id),
  foreign key (organization_id, newsletter_campaign_id)
    references public.newsletter_campaigns (organization_id, id) on delete cascade,
  foreign key (organization_id, newsletter_contact_id)
    references public.newsletter_contacts (organization_id, id) on delete cascade,
  foreign key (organization_id, newsletter_subscription_id)
    references public.newsletter_subscriptions (organization_id, id) on delete restrict
);

create unique index newsletter_provider_message_unique
  on public.newsletter_campaign_recipients (provider_message_id)
  where provider_message_id is not null;
create index newsletter_campaign_delivery_queue_idx
  on public.newsletter_campaign_recipients (organization_id, status, created_at)
  where status in ('queued','failed');

create table public.newsletter_delivery_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  newsletter_campaign_recipient_id uuid not null,
  provider_event_id text,
  event_type text not null
    check (event_type in ('sent','delivered','opened','clicked','bounced','complained','unsubscribed','failed')),
  occurred_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, newsletter_campaign_recipient_id)
    references public.newsletter_campaign_recipients (organization_id, id) on delete cascade
);

create unique index newsletter_delivery_provider_event_unique
  on public.newsletter_delivery_events (provider_event_id)
  where provider_event_id is not null;

-- Bynex's own product newsletter remains private and is populated only from
-- recorded marketing-email consent events.
create table private.bynex_newsletter_subscriptions (
  id uuid primary key default gen_random_uuid(),
  marketing_lead_id uuid not null references public.marketing_leads(id) on delete cascade,
  latest_consent_event_id bigint references public.consent_events(id) on delete set null,
  topics text[] not null default array['product_news','accounting_tips']::text[],
  status text not null default 'subscribed' check (status in ('subscribed','unsubscribed','bounced','complained')),
  unsubscribe_token_hash text,
  subscribed_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (marketing_lead_id)
);

create or replace function private.sync_bynex_newsletter_consent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.consent_scope <> 'marketing_email' then
    return new;
  end if;

  insert into private.bynex_newsletter_subscriptions (
    marketing_lead_id, latest_consent_event_id, status, subscribed_at, unsubscribed_at
  ) values (
    new.lead_id,
    new.id,
    case when new.granted then 'subscribed' else 'unsubscribed' end,
    now(),
    case when new.granted then null else now() end
  )
  on conflict (marketing_lead_id) do update
    set latest_consent_event_id = excluded.latest_consent_event_id,
        status = excluded.status,
        subscribed_at = case
          when excluded.status = 'subscribed' then now()
          else private.bynex_newsletter_subscriptions.subscribed_at
        end,
        unsubscribed_at = excluded.unsubscribed_at,
        updated_at = now();

  return new;
end;
$$;

revoke all on function private.sync_bynex_newsletter_consent() from public, anon, authenticated;
drop trigger if exists sync_bynex_newsletter_consent on public.consent_events;
create trigger sync_bynex_newsletter_consent
  after insert on public.consent_events
  for each row execute function private.sync_bynex_newsletter_consent();

-- Backfill previous explicit email-marketing choices. One lead produces one
-- immutable consent event in the current public form, but DISTINCT ON also
-- makes this correct if withdrawal events are added later.
insert into private.bynex_newsletter_subscriptions (
  marketing_lead_id, latest_consent_event_id, status, subscribed_at, unsubscribed_at
)
select distinct on (c.lead_id)
  c.lead_id,
  c.id,
  case when c.granted then 'subscribed' else 'unsubscribed' end,
  c.created_at,
  case when c.granted then null else c.created_at end
from public.consent_events c
where c.consent_scope = 'marketing_email'
order by c.lead_id, c.created_at desc
on conflict (marketing_lead_id) do nothing;

-- Tenant-safe inbox provisioning. Addresses contain random routing material,
-- never a sequential organization ID or company slug.
create or replace function public.provision_invoice_inbox(p_organization_id uuid)
returns public.invoice_inboxes
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_inbox public.invoice_inboxes;
  created_inbox public.invoice_inboxes;
  generated_local_part text;
begin
  if not private.has_organization_role(
    p_organization_id,
    array['owner','admin','office']::text[],
    auth.uid()
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select i.* into existing_inbox
  from public.invoice_inboxes i
  where i.organization_id = p_organization_id
    and i.is_primary
    and i.status = 'active'
  limit 1;

  if found then
    return existing_inbox;
  end if;

  loop
    generated_local_part := 'f-' || encode(extensions.gen_random_bytes(16), 'hex');
    begin
      insert into public.invoice_inboxes (
        organization_id, local_part, email_address
      ) values (
        p_organization_id,
        generated_local_part,
        generated_local_part || '@faktura.bynex.se'
      )
      returning * into created_inbox;
      exit;
    exception when unique_violation then
      null;
    end;
  end loop;

  return created_inbox;
end;
$$;

revoke all on function public.provision_invoice_inbox(uuid) from public, anon;
grant execute on function public.provision_invoice_inbox(uuid) to authenticated;

-- One-click approval records the decision only. A server worker then performs
-- the requested external/financial action idempotently and records completion.
create or replace function public.decide_ai_action(p_action_id uuid, p_decision text)
returns public.ai_actions
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.ai_actions;
  caller_role text;
begin
  if p_decision not in ('approve','reject') then
    raise exception 'Invalid decision' using errcode = '22023';
  end if;

  select a.* into target
  from public.ai_actions a
  where a.id = p_action_id
  for update;

  if not found then
    raise exception 'Action not found' using errcode = 'P0002';
  end if;

  caller_role := private.user_organization_role(target.organization_id, auth.uid());
  if caller_role is null or not (caller_role = any(target.authorized_roles)) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if target.status not in ('ready','needs_review') then
    raise exception 'Action is no longer pending' using errcode = '55000';
  end if;

  if target.expires_at is not null and target.expires_at <= now() then
    update public.ai_actions
      set status = 'expired'
      where id = target.id
      returning * into target;
    insert into public.ai_action_events (organization_id, ai_action_id, event_type, actor_user_id)
      values (target.organization_id, target.id, 'expired', auth.uid());
    return target;
  end if;

  update public.ai_actions
  set status = case when p_decision = 'approve' then 'approved' else 'rejected' end,
      approved_by_user_id = case when p_decision = 'approve' then auth.uid() else null end,
      approved_at = case when p_decision = 'approve' then now() else null end
  where id = target.id
  returning * into target;

  insert into public.ai_action_events (
    organization_id, ai_action_id, event_type, actor_user_id
  ) values (
    target.organization_id,
    target.id,
    case when p_decision = 'approve' then 'approved' else 'rejected' end,
    auth.uid()
  );

  return target;
end;
$$;

revoke all on function public.decide_ai_action(uuid, text) from public, anon;
grant execute on function public.decide_ai_action(uuid, text) to authenticated;

-- Prevent signed-in clients from bypassing the one-click review flow by
-- changing a campaign directly to an approved or sending state.
create or replace function private.guard_newsletter_campaign_state()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      new.status := 'draft';
      new.approved_by_user_id := null;
      new.approved_at := null;
      new.sent_at := null;
    elsif new.status is distinct from old.status
      and new.status not in ('draft','ready','cancelled') then
      raise exception 'Campaign approval and sending require the secure action flow' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.guard_newsletter_campaign_state() from public, anon, authenticated;
create trigger guard_newsletter_campaign_state
  before insert or update on public.newsletter_campaigns
  for each row execute function private.guard_newsletter_campaign_state();

-- Private immutable Storage bucket. Originals are addressed as
-- organization_id/invoice_id/file and cannot be overwritten or deleted by a
-- signed-in browser client.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'supplier-invoices',
  'supplier-invoices',
  false,
  36700160,
  array['application/pdf','application/xml','text/xml','image/jpeg','image/png','image/webp']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.can_access_supplier_invoice_object(
  object_name text,
  requested_user_id uuid default auth.uid()
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  path_parts text[];
  path_organization_id uuid;
  path_invoice_id uuid;
begin
  path_parts := storage.foldername(object_name);
  if cardinality(path_parts) < 2 then
    return false;
  end if;

  begin
    path_organization_id := path_parts[1]::uuid;
    path_invoice_id := path_parts[2]::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  return private.has_organization_role(
    path_organization_id,
    array['owner','admin','office']::text[],
    requested_user_id
  ) and exists (
    select 1
    from public.supplier_invoices i
    where i.organization_id = path_organization_id
      and i.id = path_invoice_id
  );
end;
$$;

revoke all on function private.can_access_supplier_invoice_object(text, uuid) from public, anon;
grant execute on function private.can_access_supplier_invoice_object(text, uuid) to authenticated;

drop policy if exists supplier_invoices_select on storage.objects;
create policy supplier_invoices_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'supplier-invoices'
    and private.can_access_supplier_invoice_object(name, (select auth.uid()))
  );

drop policy if exists supplier_invoices_insert on storage.objects;
create policy supplier_invoices_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'supplier-invoices'
    and private.can_access_supplier_invoice_object(name, (select auth.uid()))
  );

-- Enable RLS before any API grants are introduced.
do $$
declare
  protected_table text;
begin
  foreach protected_table in array array[
    'suppliers','invoice_inboxes','edi_connections','supplier_invoices',
    'supplier_invoice_files','supplier_invoice_lines','supplier_invoice_routing_rules',
    'supplier_invoice_suggestions','invoice_ingestion_events','ai_actions',
    'ai_action_events','newsletter_sender_profiles','newsletter_contacts',
    'newsletter_lists','newsletter_list_contacts','newsletter_subscriptions',
    'newsletter_campaigns','newsletter_campaign_recipients','newsletter_delivery_events'
  ]
  loop
    execute format('alter table public.%I enable row level security', protected_table);
    execute format('alter table public.%I force row level security', protected_table);
  end loop;
end $$;

-- Supplier directory and routing rules are operational. Invoice contents and
-- EDI settings are limited to finance roles.
create policy suppliers_member_select on public.suppliers
  for select to authenticated
  using (private.is_organization_member(organization_id, (select auth.uid())));
create policy suppliers_management_insert on public.suppliers
  for insert to authenticated
  with check (private.has_organization_role(organization_id, array['owner','admin','office','manager']::text[], (select auth.uid())));
create policy suppliers_management_update on public.suppliers
  for update to authenticated
  using (private.has_organization_role(organization_id, array['owner','admin','office','manager']::text[], (select auth.uid())))
  with check (private.has_organization_role(organization_id, array['owner','admin','office','manager']::text[], (select auth.uid())));
create policy suppliers_management_delete on public.suppliers
  for delete to authenticated
  using (private.has_organization_role(organization_id, array['owner','admin','office']::text[], (select auth.uid())));

do $$
declare
  finance_table text;
begin
  foreach finance_table in array array[
    'invoice_inboxes','edi_connections','supplier_invoices','supplier_invoice_files',
    'supplier_invoice_lines','supplier_invoice_routing_rules','supplier_invoice_suggestions',
    'invoice_ingestion_events'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (private.has_organization_role(organization_id, array[''owner'',''admin'',''office'']::text[], (select auth.uid())))',
      finance_table || '_finance_select', finance_table
    );
  end loop;
end $$;

create policy invoice_inboxes_finance_manage on public.invoice_inboxes
  for all to authenticated
  using (private.has_organization_role(organization_id, array['owner','admin','office']::text[], (select auth.uid())))
  with check (private.has_organization_role(organization_id, array['owner','admin','office']::text[], (select auth.uid())));
create policy edi_connections_finance_manage on public.edi_connections
  for all to authenticated
  using (private.has_organization_role(organization_id, array['owner','admin','office']::text[], (select auth.uid())))
  with check (private.has_organization_role(organization_id, array['owner','admin','office']::text[], (select auth.uid())));
create policy supplier_invoice_routing_rules_finance_manage on public.supplier_invoice_routing_rules
  for all to authenticated
  using (private.has_organization_role(organization_id, array['owner','admin','office']::text[], (select auth.uid())))
  with check (private.has_organization_role(organization_id, array['owner','admin','office']::text[], (select auth.uid())));

create policy ai_actions_authorized_select on public.ai_actions
  for select to authenticated
  using (
    private.user_organization_role(organization_id, (select auth.uid())) = any(authorized_roles)
  );
create policy ai_action_events_authorized_select on public.ai_action_events
  for select to authenticated
  using (
    exists (
      select 1 from public.ai_actions a
      where a.organization_id = ai_action_events.organization_id
        and a.id = ai_action_events.ai_action_id
        and private.user_organization_role(a.organization_id, (select auth.uid())) = any(a.authorized_roles)
    )
  );

do $$
declare
  newsletter_table text;
begin
  foreach newsletter_table in array array[
    'newsletter_sender_profiles','newsletter_contacts','newsletter_lists',
    'newsletter_list_contacts','newsletter_subscriptions','newsletter_campaigns'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (private.has_organization_role(organization_id, array[''owner'',''admin'',''office'',''manager'']::text[], (select auth.uid())))',
      newsletter_table || '_marketing_select', newsletter_table
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (private.has_organization_role(organization_id, array[''owner'',''admin'',''office'',''manager'']::text[], (select auth.uid())))',
      newsletter_table || '_marketing_insert', newsletter_table
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (private.has_organization_role(organization_id, array[''owner'',''admin'',''office'',''manager'']::text[], (select auth.uid()))) with check (private.has_organization_role(organization_id, array[''owner'',''admin'',''office'',''manager'']::text[], (select auth.uid())))',
      newsletter_table || '_marketing_update', newsletter_table
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (private.has_organization_role(organization_id, array[''owner'',''admin'',''office'',''manager'']::text[], (select auth.uid())))',
      newsletter_table || '_marketing_delete', newsletter_table
    );
  end loop;
end $$;

create policy newsletter_campaign_recipients_marketing_select
  on public.newsletter_campaign_recipients for select to authenticated
  using (private.has_organization_role(organization_id, array['owner','admin','office','manager']::text[], (select auth.uid())));
create policy newsletter_delivery_events_marketing_select
  on public.newsletter_delivery_events for select to authenticated
  using (private.has_organization_role(organization_id, array['owner','admin','office','manager']::text[], (select auth.uid())));

-- Least privilege. Invoice ingestion, AI proposals/execution and delivery
-- records are server-written. Browser clients only receive the rows their RLS
-- policies authorize.
revoke all on
  public.suppliers, public.invoice_inboxes, public.edi_connections,
  public.supplier_invoices, public.supplier_invoice_files, public.supplier_invoice_lines,
  public.supplier_invoice_routing_rules, public.supplier_invoice_suggestions,
  public.invoice_ingestion_events, public.ai_actions, public.ai_action_events,
  public.newsletter_sender_profiles, public.newsletter_contacts, public.newsletter_lists,
  public.newsletter_list_contacts, public.newsletter_subscriptions,
  public.newsletter_campaigns, public.newsletter_campaign_recipients,
  public.newsletter_delivery_events
from anon, authenticated;

grant select, insert, update, delete on public.suppliers to authenticated;
grant select, insert, update, delete on public.invoice_inboxes, public.edi_connections,
  public.supplier_invoice_routing_rules to authenticated;
grant select on public.supplier_invoices, public.supplier_invoice_files,
  public.supplier_invoice_lines, public.supplier_invoice_suggestions,
  public.invoice_ingestion_events, public.ai_actions, public.ai_action_events to authenticated;
grant select, insert, update, delete on public.newsletter_sender_profiles,
  public.newsletter_contacts, public.newsletter_lists, public.newsletter_list_contacts,
  public.newsletter_subscriptions, public.newsletter_campaigns to authenticated;
grant select on public.newsletter_campaign_recipients,
  public.newsletter_delivery_events to authenticated;

-- Keep timestamps, audit trails and common tenant joins efficient.
do $$
declare
  updated_table text;
begin
  foreach updated_table in array array[
    'suppliers','invoice_inboxes','edi_connections','supplier_invoices',
    'supplier_invoice_lines','supplier_invoice_routing_rules','invoice_ingestion_events',
    'ai_actions','newsletter_sender_profiles','newsletter_contacts','newsletter_lists',
    'newsletter_subscriptions','newsletter_campaigns','newsletter_campaign_recipients'
  ]
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      updated_table
    );
  end loop;
end $$;

create trigger set_updated_at
  before update on private.bynex_newsletter_subscriptions
  for each row execute function public.set_updated_at();

do $$
declare
  audited_table text;
begin
  foreach audited_table in array array[
    'suppliers','invoice_inboxes','edi_connections','supplier_invoices',
    'supplier_invoice_routing_rules','ai_actions','newsletter_sender_profiles',
    'newsletter_contacts','newsletter_subscriptions','newsletter_campaigns'
  ]
  loop
    execute format(
      'create trigger write_audit_log after insert or update or delete on public.%I for each row execute function private.write_audit_log()',
      audited_table
    );
  end loop;
end $$;

create index supplier_invoice_files_invoice_idx
  on public.supplier_invoice_files (organization_id, supplier_invoice_id);
create index supplier_invoice_lines_invoice_idx
  on public.supplier_invoice_lines (organization_id, supplier_invoice_id, line_number);
create index supplier_invoice_suggestions_pending_idx
  on public.supplier_invoice_suggestions (organization_id, supplier_invoice_id, status, confidence desc);
create index invoice_ingestion_retry_idx
  on public.invoice_ingestion_events (status, next_attempt_at)
  where status in ('received','retrying','failed');
create index ai_action_events_action_created_idx
  on public.ai_action_events (organization_id, ai_action_id, created_at);
create index newsletter_list_contacts_contact_idx
  on public.newsletter_list_contacts (organization_id, newsletter_contact_id);
create index newsletter_subscriptions_status_topic_idx
  on public.newsletter_subscriptions (organization_id, status, topic_key);
create index newsletter_campaigns_status_schedule_idx
  on public.newsletter_campaigns (organization_id, status, scheduled_at)
  where status in ('ready','approved','scheduled','sending','failed');
create index newsletter_delivery_recipient_idx
  on public.newsletter_delivery_events (organization_id, newsletter_campaign_recipient_id, occurred_at);
create index bynex_newsletter_status_idx
  on private.bynex_newsletter_subscriptions (status, updated_at);

commit;
