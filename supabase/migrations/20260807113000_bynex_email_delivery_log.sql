begin;

create table if not exists public.bynex_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  message_type text not null check (message_type in (
    'quote','change_order','customer_invoice','subscription_invoice','contract',
    'payroll','support','portal','reminder','other'
  )),
  source_id uuid not null,
  source_version_id uuid,
  recipient_email text not null,
  recipient_name text,
  sender_email text not null,
  reply_to_email text,
  subject text not null,
  action_url_sha256 text,
  document_sha256 text,
  idempotency_key text not null,
  provider text not null default 'resend' check (provider in ('resend','smtp','peppol','other')),
  provider_message_id text,
  status text not null default 'pending' check (status in (
    'pending','sending','sent','delivered','failed','bounced','complained','cancelled'
  )),
  error_code text,
  error_message text,
  requested_by_user_id uuid references auth.users(id) on delete set null,
  sent_at timestamptz,
  delivered_at timestamptz,
  bounced_at timestamptz,
  opened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, idempotency_key),
  check (recipient_email = lower(btrim(recipient_email))),
  check (recipient_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  check (sender_email = lower(btrim(sender_email))),
  check (sender_email ~ '^[^[:space:]@]+@bynex\.se$'),
  check (reply_to_email is null or reply_to_email = lower(btrim(reply_to_email))),
  check (reply_to_email is null or reply_to_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  check (char_length(btrim(subject)) between 3 and 240),
  check (char_length(idempotency_key) between 32 and 128),
  check (action_url_sha256 is null or action_url_sha256 ~ '^[0-9a-f]{64}$'),
  check (document_sha256 is null or document_sha256 ~ '^[0-9a-f]{64}$'),
  check ((status in ('sent','delivered') and provider_message_id is not null and sent_at is not null)
    or status not in ('sent','delivered')),
  check ((status = 'failed' and error_message is not null) or status <> 'failed')
);

create index if not exists bynex_email_deliveries_org_created_idx
  on public.bynex_email_deliveries (organization_id, created_at desc);
create index if not exists bynex_email_deliveries_source_idx
  on public.bynex_email_deliveries (organization_id, message_type, source_id, created_at desc);
create index if not exists bynex_email_deliveries_status_idx
  on public.bynex_email_deliveries (organization_id, status, updated_at desc);
create unique index if not exists bynex_email_deliveries_provider_message_uidx
  on public.bynex_email_deliveries (provider, provider_message_id)
  where provider_message_id is not null;

alter table public.bynex_email_deliveries enable row level security;
alter table public.bynex_email_deliveries force row level security;

create policy bynex_email_deliveries_select
on public.bynex_email_deliveries
for select to authenticated
using (
  private.has_organization_role(
    organization_id,
    array['owner','admin','office','manager']::text[],
    (select auth.uid())
  )
);

create policy bynex_email_deliveries_insert
on public.bynex_email_deliveries
for insert to authenticated
with check (
  requested_by_user_id = (select auth.uid())
  and private.has_organization_role(
    organization_id,
    array['owner','admin','office','manager']::text[],
    (select auth.uid())
  )
);

create policy bynex_email_deliveries_update
on public.bynex_email_deliveries
for update to authenticated
using (
  private.has_organization_role(
    organization_id,
    array['owner','admin','office','manager']::text[],
    (select auth.uid())
  )
)
with check (
  private.has_organization_role(
    organization_id,
    array['owner','admin','office','manager']::text[],
    (select auth.uid())
  )
);

revoke all on public.bynex_email_deliveries from public, anon, authenticated;
grant select, insert, update on public.bynex_email_deliveries to authenticated;

create trigger bynex_email_deliveries_set_updated_at
before update on public.bynex_email_deliveries
for each row execute function public.set_updated_at();

create trigger bynex_email_deliveries_write_audit_log
after insert or update on public.bynex_email_deliveries
for each row execute function private.write_audit_log();

comment on table public.bynex_email_deliveries is
  'Tenant-isolated, append-preserving delivery evidence for Bynex-branded customer emails. Plaintext secure action links are never stored.';

select pg_notify('pgrst', 'reload schema');

commit;
