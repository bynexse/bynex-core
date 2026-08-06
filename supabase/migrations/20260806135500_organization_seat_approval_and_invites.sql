begin;

alter table private.organization_invites
  add column if not exists full_name text,
  add column if not exists seat_change_request_id uuid;

alter table private.organization_invites
  drop constraint if exists organization_invites_full_name_check;
alter table private.organization_invites
  add constraint organization_invites_full_name_check
  check (full_name is null or char_length(btrim(full_name)) between 2 and 160);

create table public.organization_seat_change_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subscription_id uuid not null references public.organization_subscriptions(id) on delete restrict,
  agreement_id uuid not null references public.subscription_agreements(id) on delete restrict,
  requested_by_user_id uuid not null default auth.uid() references auth.users(id),
  approved_by_user_id uuid not null default auth.uid() references auth.users(id),
  invite_id uuid,
  invite_email text not null check (
    char_length(invite_email) between 5 and 254 and position('@' in invite_email) > 1
  ),
  invite_full_name text not null check (char_length(btrim(invite_full_name)) between 2 and 160),
  invite_role text not null check (
    invite_role in ('admin','office','manager','supervisor','employee','contractor')
  ),
  previous_seat_count integer not null check (previous_seat_count >= 1),
  requested_seat_count integer not null check (requested_seat_count > previous_seat_count),
  included_users integer not null check (included_users >= 1),
  additional_billable_seats integer not null check (additional_billable_seats >= 0),
  recurring_unit_price_ex_vat numeric(14,2) not null check (recurring_unit_price_ex_vat >= 0),
  proration_factor numeric(10,6) not null default 1 check (proration_factor > 0 and proration_factor <= 1),
  immediate_amount_ex_vat numeric(14,2) not null default 0 check (immediate_amount_ex_vat >= 0),
  vat_rate numeric(6,2) not null default 25 check (vat_rate between 0 and 100),
  immediate_vat_amount numeric(14,2) not null default 0 check (immediate_vat_amount >= 0),
  immediate_amount_inc_vat numeric(14,2) not null default 0 check (immediate_amount_inc_vat >= 0),
  service_period_starts_on date not null,
  service_period_ends_on date not null,
  confirmation_text text not null check (char_length(btrim(confirmation_text)) between 5 and 1000),
  status text not null default 'approved'
    check (status in ('approved','invoiced','accepted','cancelled')),
  invoice_id uuid references public.subscription_invoices(id) on delete restrict,
  invoice_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_at timestamptz,
  check (service_period_ends_on >= service_period_starts_on),
  check (immediate_amount_inc_vat = round(immediate_amount_ex_vat + immediate_vat_amount, 2))
);

create index organization_seat_change_requests_org_created_idx
  on public.organization_seat_change_requests (organization_id, created_at desc);
create index organization_seat_change_requests_status_idx
  on public.organization_seat_change_requests (status, created_at desc);

alter table public.organization_seat_change_requests enable row level security;
revoke all on public.organization_seat_change_requests from public, anon, authenticated;

alter table private.organization_invites
  drop constraint if exists organization_invites_seat_change_request_id_fkey;
alter table private.organization_invites
  add constraint organization_invites_seat_change_request_id_fkey
  foreign key (seat_change_request_id)
  references public.organization_seat_change_requests(id)
  on delete set null;

alter table public.subscription_invoices
  alter column schedule_id drop not null,
  add column if not exists origin text not null default 'automatic',
  add column if not exists seat_change_request_id uuid;

alter table public.subscription_invoices
  drop constraint if exists subscription_invoices_origin_check;
alter table public.subscription_invoices
  add constraint subscription_invoices_origin_check
  check (origin in ('automatic','manual'));

alter table public.subscription_invoices
  drop constraint if exists subscription_invoices_seat_change_request_id_fkey;
alter table public.subscription_invoices
  add constraint subscription_invoices_seat_change_request_id_fkey
  foreign key (seat_change_request_id)
  references public.organization_seat_change_requests(id)
  on delete restrict;

create unique index if not exists subscription_invoices_seat_change_request_unique_idx
  on public.subscription_invoices (seat_change_request_id)
  where seat_change_request_id is not null;

create or replace function private.organization_seat_proration_factor(
  p_period_starts_on date,
  p_period_ends_on date,
  p_charge_date date
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select round(
    least(
      1::numeric,
      greatest(1, p_period_ends_on - greatest(p_period_starts_on, p_charge_date) + 1)::numeric
      / greatest(1, p_period_ends_on - p_period_starts_on + 1)::numeric
    ),
    6
  );
$$;

create or replace function public.get_organization_seat_overview(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected record;
  active_members integer;
  pending_invites integer;
  reserved_seats integer;
  next_seat_count integer;
  new_billable_seats integer;
  period_start date;
  period_end date;
  factor numeric(10,6);
  immediate_ex_vat numeric(14,2);
  immediate_vat numeric(14,2);
  billing_ready boolean;
begin
  if not private.has_organization_role(
    p_organization_id,
    array['owner','admin']::text[],
    (select auth.uid())
  ) then
    raise exception 'Endast ägare och administratör kan hantera användarplatser'
      using errcode = '42501';
  end if;

  select
    subscription.id as subscription_id,
    subscription.seat_count,
    subscription.current_period_starts_at,
    subscription.current_period_ends_at,
    agreement.id as agreement_id,
    agreement.included_users,
    agreement.net_extra_user_price_ex_vat,
    agreement.vat_rate,
    agreement.initial_ends_on,
    plan.name as plan_name,
    billing.organization_id as billing_profile_id,
    billing.auto_invoice_enabled,
    billing.billing_email,
    billing.address_line1,
    billing.postal_code,
    billing.city
  into selected
  from public.organization_subscriptions subscription
  join public.subscription_agreements agreement
    on agreement.organization_id = subscription.organization_id
   and agreement.subscription_id = subscription.id
   and agreement.status = 'active'
  join public.plans plan on plan.id = agreement.plan_id
  left join public.organization_billing_profiles billing
    on billing.organization_id = subscription.organization_id
  where subscription.organization_id = p_organization_id
    and subscription.status = 'active'
  order by subscription.created_at desc, agreement.created_at desc
  limit 1;

  if selected.subscription_id is null then
    return jsonb_build_object(
      'subscription_ready', false,
      'active_members', 0,
      'pending_invites', 0,
      'pending', '[]'::jsonb,
      'recent_requests', '[]'::jsonb
    );
  end if;

  select count(*) into active_members
  from public.organization_members member
  where member.organization_id = p_organization_id and member.active;

  select count(*) into pending_invites
  from private.organization_invites invite
  where invite.organization_id = p_organization_id
    and invite.accepted_at is null
    and invite.expires_at > now();

  reserved_seats := greatest(selected.seat_count, active_members + pending_invites, 1);
  next_seat_count := reserved_seats + 1;
  new_billable_seats := greatest(
    0,
    greatest(next_seat_count - selected.included_users, 0)
    - greatest(reserved_seats - selected.included_users, 0)
  );

  period_start := coalesce(
    selected.current_period_starts_at::date,
    date_trunc('month', current_date)::date
  );
  period_end := coalesce(
    selected.current_period_ends_at::date - 1,
    least(
      selected.initial_ends_on,
      (date_trunc('month', current_date) + interval '1 month - 1 day')::date
    )
  );
  if period_end < current_date then
    period_start := current_date;
    period_end := (current_date + interval '1 month - 1 day')::date;
  end if;

  factor := private.organization_seat_proration_factor(period_start, period_end, current_date);
  immediate_ex_vat := round(
    new_billable_seats * selected.net_extra_user_price_ex_vat * factor,
    2
  );
  immediate_vat := round(immediate_ex_vat * selected.vat_rate / 100, 2);
  billing_ready := selected.billing_profile_id is not null
    and selected.auto_invoice_enabled
    and char_length(coalesce(selected.billing_email, '')) >= 5
    and char_length(coalesce(selected.address_line1, '')) >= 2
    and char_length(coalesce(selected.postal_code, '')) >= 3
    and char_length(coalesce(selected.city, '')) >= 2;

  return jsonb_build_object(
    'subscription_ready', true,
    'subscription_id', selected.subscription_id,
    'agreement_id', selected.agreement_id,
    'plan_name', selected.plan_name,
    'active_members', active_members,
    'pending_invites', pending_invites,
    'reserved_seats', reserved_seats,
    'included_users', selected.included_users,
    'extra_user_price_ex_vat', selected.net_extra_user_price_ex_vat,
    'next_seat_count', next_seat_count,
    'next_seat_requires_payment', new_billable_seats > 0,
    'next_seat_immediate_amount_ex_vat', immediate_ex_vat,
    'next_seat_immediate_vat_amount', immediate_vat,
    'next_seat_immediate_amount_inc_vat', immediate_ex_vat + immediate_vat,
    'next_seat_recurring_amount_ex_vat',
      new_billable_seats * selected.net_extra_user_price_ex_vat,
    'service_period_starts_on', greatest(period_start, current_date),
    'service_period_ends_on', period_end,
    'billing_ready', billing_ready,
    'pending', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', invite.id,
        'full_name', invite.full_name,
        'email', invite.email_normalized,
        'role', invite.role,
        'expires_at', invite.expires_at,
        'created_at', invite.created_at,
        'seat_change_request_id', invite.seat_change_request_id
      ) order by invite.created_at desc)
      from private.organization_invites invite
      where invite.organization_id = p_organization_id
        and invite.accepted_at is null
        and invite.expires_at > now()
    ), '[]'::jsonb),
    'recent_requests', coalesce((
      select jsonb_agg(to_jsonb(request_row) order by request_row.created_at desc)
      from (
        select
          request.id,
          request.invite_full_name,
          request.invite_email,
          request.previous_seat_count,
          request.requested_seat_count,
          request.additional_billable_seats,
          request.immediate_amount_ex_vat,
          request.immediate_vat_amount,
          request.immediate_amount_inc_vat,
          request.invoice_number,
          request.status,
          request.created_at,
          request.accepted_at
        from public.organization_seat_change_requests request
        where request.organization_id = p_organization_id
        order by request.created_at desc
        limit 50
      ) request_row
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.approve_organization_member_invite(
  p_organization_id uuid,
  p_full_name text,
  p_email text,
  p_role text,
  p_plain_token text,
  p_expires_at timestamptz,
  p_approve_extra_cost boolean,
  p_confirmation_text text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  selected record;
  billing public.organization_billing_profiles;
  issuer private.billing_legal_entities;
  active_members integer;
  pending_invites integer;
  reserved_seats integer;
  new_seat_count integer;
  new_billable_seats integer;
  period_start date;
  period_end date;
  factor numeric(10,6);
  amount_ex_vat numeric(14,2);
  vat_amount numeric(14,2);
  amount_inc_vat numeric(14,2);
  request_id uuid;
  invite_id uuid;
  invoice_id uuid;
  invoice_number text;
  accounting_event_id uuid;
  invoice_hash text;
  normalized_email text := lower(btrim(coalesce(p_email, '')));
  invitation_url text;
begin
  if not private.has_organization_role(
    p_organization_id,
    array['owner','admin']::text[],
    actor_user_id
  ) then
    raise exception 'Endast ägare och administratör kan bjuda in användare'
      using errcode = '42501';
  end if;

  if char_length(btrim(coalesce(p_full_name, ''))) not between 2 and 160
    or char_length(normalized_email) not between 5 and 254
    or normalized_email !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$'
    or p_role not in ('admin','office','manager','supervisor','employee','contractor')
    or char_length(coalesce(p_plain_token, '')) < 32
    or p_expires_at <= now()
    or p_expires_at > now() + interval '30 days'
  then
    raise exception 'Kontrollera medarbetarens inbjudan' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.organization_members member
    join auth.users account on account.id = member.user_id
    where member.organization_id = p_organization_id
      and member.active
      and lower(account.email) = normalized_email
  ) or exists (
    select 1 from private.organization_invites invite
    where invite.organization_id = p_organization_id
      and invite.email_normalized = normalized_email
      and invite.accepted_at is null
      and invite.expires_at > now()
  ) then
    raise exception 'Personen är redan medlem eller har en aktiv inbjudan'
      using errcode = '23505';
  end if;

  select
    subscription.id as subscription_id,
    subscription.seat_count,
    subscription.current_period_starts_at,
    subscription.current_period_ends_at,
    agreement.id as agreement_id,
    agreement.included_users,
    agreement.net_extra_user_price_ex_vat,
    agreement.vat_rate,
    agreement.initial_ends_on,
    plan.name as plan_name
  into selected
  from public.organization_subscriptions subscription
  join public.subscription_agreements agreement
    on agreement.organization_id = subscription.organization_id
   and agreement.subscription_id = subscription.id
   and agreement.status = 'active'
  join public.plans plan on plan.id = agreement.plan_id
  where subscription.organization_id = p_organization_id
    and subscription.status = 'active'
  order by subscription.created_at desc, agreement.created_at desc
  limit 1
  for update of subscription;

  if selected.subscription_id is null then
    raise exception 'Aktivt betalande abonnemang krävs' using errcode = 'P0002';
  end if;

  select count(*) into active_members
  from public.organization_members member
  where member.organization_id = p_organization_id and member.active;
  select count(*) into pending_invites
  from private.organization_invites invite
  where invite.organization_id = p_organization_id
    and invite.accepted_at is null
    and invite.expires_at > now();

  reserved_seats := greatest(selected.seat_count, active_members + pending_invites, 1);
  new_seat_count := reserved_seats + 1;
  new_billable_seats := greatest(
    0,
    greatest(new_seat_count - selected.included_users, 0)
    - greatest(reserved_seats - selected.included_users, 0)
  );

  period_start := coalesce(
    selected.current_period_starts_at::date,
    date_trunc('month', current_date)::date
  );
  period_end := coalesce(
    selected.current_period_ends_at::date - 1,
    least(
      selected.initial_ends_on,
      (date_trunc('month', current_date) + interval '1 month - 1 day')::date
    )
  );
  if period_end < current_date then
    period_start := current_date;
    period_end := (current_date + interval '1 month - 1 day')::date;
  end if;

  factor := private.organization_seat_proration_factor(period_start, period_end, current_date);
  amount_ex_vat := round(
    new_billable_seats * selected.net_extra_user_price_ex_vat * factor,
    2
  );
  vat_amount := round(amount_ex_vat * selected.vat_rate / 100, 2);
  amount_inc_vat := amount_ex_vat + vat_amount;

  if new_billable_seats > 0 and (
    not p_approve_extra_cost
    or char_length(btrim(coalesce(p_confirmation_text, ''))) < 10
  ) then
    raise exception 'Företaget måste godkänna extrakostnaden innan användaren läggs till'
      using errcode = '22023';
  end if;

  select * into billing
  from public.organization_billing_profiles
  where organization_id = p_organization_id;

  if new_billable_seats > 0 and (
    billing.organization_id is null
    or not billing.auto_invoice_enabled
    or char_length(coalesce(billing.billing_email, '')) < 5
    or char_length(coalesce(billing.address_line1, '')) < 2
    or char_length(coalesce(billing.postal_code, '')) < 3
    or char_length(coalesce(billing.city, '')) < 2
  ) then
    raise exception 'Komplett fakturaprofil med automatisk fakturering krävs'
      using errcode = 'P0002';
  end if;

  insert into public.organization_seat_change_requests (
    organization_id,
    subscription_id,
    agreement_id,
    requested_by_user_id,
    approved_by_user_id,
    invite_email,
    invite_full_name,
    invite_role,
    previous_seat_count,
    requested_seat_count,
    included_users,
    additional_billable_seats,
    recurring_unit_price_ex_vat,
    proration_factor,
    immediate_amount_ex_vat,
    vat_rate,
    immediate_vat_amount,
    immediate_amount_inc_vat,
    service_period_starts_on,
    service_period_ends_on,
    confirmation_text
  ) values (
    p_organization_id,
    selected.subscription_id,
    selected.agreement_id,
    actor_user_id,
    actor_user_id,
    normalized_email,
    btrim(p_full_name),
    p_role,
    reserved_seats,
    new_seat_count,
    selected.included_users,
    new_billable_seats,
    selected.net_extra_user_price_ex_vat,
    factor,
    amount_ex_vat,
    selected.vat_rate,
    vat_amount,
    amount_inc_vat,
    greatest(period_start, current_date),
    period_end,
    case
      when new_billable_seats > 0 then btrim(p_confirmation_text)
      else 'Ny användare ryms inom avtalets inkluderade användarplatser.'
    end
  ) returning id into request_id;

  if new_billable_seats > 0 then
    select * into issuer
    from private.billing_legal_entities entity
    where entity.status = 'active'
      and entity.effective_from <= current_date
      and (entity.effective_to is null or entity.effective_to >= current_date)
    order by entity.effective_from desc
    limit 1;
    if issuer.id is null then
      raise exception 'Aktiv fakturautställare saknas' using errcode = 'P0002';
    end if;

    invoice_number := private.allocate_subscription_invoice_number(issuer.id);
    invoice_hash := encode(extensions.digest(convert_to(jsonb_build_object(
      'organization_id', p_organization_id,
      'subscription_id', selected.subscription_id,
      'agreement_id', selected.agreement_id,
      'seat_change_request_id', request_id,
      'invoice_number', invoice_number,
      'invoice_date', current_date,
      'service_period_starts_on', greatest(period_start, current_date),
      'service_period_ends_on', period_end,
      'previous_seat_count', reserved_seats,
      'requested_seat_count', new_seat_count,
      'amount_ex_vat', amount_ex_vat,
      'vat_amount', vat_amount,
      'amount_inc_vat', amount_inc_vat
    )::text, 'UTF8'), 'sha256'), 'hex');

    insert into public.subscription_invoices (
      organization_id,
      subscription_id,
      agreement_id,
      schedule_id,
      issuer_entity_id,
      invoice_number,
      status,
      invoice_date,
      due_date,
      service_period_starts_on,
      service_period_ends_on,
      currency,
      amount_ex_vat,
      vat_amount,
      amount_inc_vat,
      seat_count_snapshot,
      delivery_channel,
      customer_snapshot,
      issuer_snapshot,
      content_hash,
      origin,
      seat_change_request_id
    ) values (
      p_organization_id,
      selected.subscription_id,
      selected.agreement_id,
      null,
      issuer.id,
      invoice_number,
      'queued',
      current_date,
      current_date + billing.payment_terms_days,
      greatest(period_start, current_date),
      period_end,
      'SEK',
      amount_ex_vat,
      vat_amount,
      amount_inc_vat,
      new_seat_count,
      billing.delivery_channel,
      jsonb_strip_nulls(jsonb_build_object(
        'customer_number', billing.customer_number,
        'legal_name', billing.legal_name,
        'organization_number', billing.organization_number,
        'vat_number', billing.vat_number,
        'billing_email', billing.billing_email,
        'peppol_id', billing.peppol_id,
        'address_line1', billing.address_line1,
        'address_line2', billing.address_line2,
        'postal_code', billing.postal_code,
        'city', billing.city,
        'country_code', billing.country_code,
        'buyer_reference', billing.buyer_reference,
        'purchase_order_reference', billing.purchase_order_reference,
        'invoice_language', billing.invoice_language,
        'seat_change_request_id', request_id
      )),
      jsonb_strip_nulls(jsonb_build_object(
        'legal_name', issuer.legal_name,
        'organization_number', issuer.organization_number,
        'vat_number', issuer.vat_number,
        'address_line1', issuer.address_line1,
        'address_line2', issuer.address_line2,
        'postal_code', issuer.postal_code,
        'city', issuer.city,
        'country_code', issuer.country_code,
        'email', issuer.email,
        'phone', issuer.phone,
        'bankgiro', issuer.bankgiro,
        'plusgiro', issuer.plusgiro,
        'iban', issuer.iban,
        'bic', issuer.bic
      )),
      invoice_hash,
      'manual',
      request_id
    ) returning id into invoice_id;

    insert into public.subscription_invoice_lines (
      organization_id,
      invoice_id,
      line_number,
      item_code,
      description,
      quantity,
      unit,
      unit_price_ex_vat,
      discount_percent,
      line_amount_ex_vat,
      vat_rate,
      vat_amount
    ) values (
      p_organization_id,
      invoice_id,
      1,
      'BYNEX-EXTRA-USER',
      'Extra användare ' || to_char(greatest(period_start, current_date), 'YYYY-MM-DD')
        || ' – ' || to_char(period_end, 'YYYY-MM-DD'),
      new_billable_seats,
      'användare',
      round(amount_ex_vat / greatest(new_billable_seats, 1), 2),
      0,
      amount_ex_vat,
      selected.vat_rate,
      vat_amount
    );

    insert into public.subscription_invoice_delivery_jobs (
      organization_id,
      invoice_id,
      channel,
      idempotency_key
    ) values (
      p_organization_id,
      invoice_id,
      billing.delivery_channel,
      'subscription-invoice:' || invoice_id::text || ':' || billing.delivery_channel
    );

    insert into private.billing_accounting_events (
      issuer_entity_id,
      organization_id,
      invoice_id,
      event_type,
      event_date,
      reference
    ) values (
      issuer.id,
      p_organization_id,
      invoice_id,
      'invoice_issued',
      current_date,
      invoice_number
    ) returning id into accounting_event_id;

    insert into private.billing_accounting_lines (
      accounting_event_id,
      line_number,
      account_number,
      debit_amount,
      credit_amount,
      description
    ) values
      (accounting_event_id, 1, issuer.accounts_receivable_account, amount_inc_vat, 0,
        'Kundfordran ' || invoice_number),
      (accounting_event_id, 2, issuer.revenue_account, 0, amount_ex_vat,
        'Extra användare ' || invoice_number),
      (accounting_event_id, 3, issuer.output_vat_account, 0, vat_amount,
        'Utgående moms ' || invoice_number);

    update public.organization_seat_change_requests
    set status = 'invoiced',
        invoice_id = invoice_id,
        invoice_number = invoice_number,
        updated_at = now()
    where id = request_id;
  end if;

  update public.organization_subscriptions
  set seat_count = new_seat_count,
      updated_at = now()
  where id = selected.subscription_id;

  insert into private.organization_invites (
    organization_id,
    email_normalized,
    full_name,
    role,
    token_hash,
    invited_by_user_id,
    expires_at,
    seat_change_request_id
  ) values (
    p_organization_id,
    normalized_email,
    btrim(p_full_name),
    p_role,
    encode(extensions.digest(p_plain_token, 'sha256'), 'hex'),
    actor_user_id,
    p_expires_at,
    request_id
  ) returning id into invite_id;

  invitation_url := 'https://bynex.se/inbjudan/foretag?token=' || p_plain_token;

  insert into private.transactional_email_queue (
    recipient_email,
    template_key,
    payload,
    idempotency_key
  ) values (
    normalized_email,
    'organization-invitation',
    jsonb_build_object(
      'organization_id', p_organization_id,
      'full_name', btrim(p_full_name),
      'role', p_role,
      'token', p_plain_token,
      'invitation_url', invitation_url,
      'expires_at', p_expires_at,
      'seat_change_request_id', request_id,
      'invoice_id', invoice_id,
      'invoice_number', invoice_number
    ),
    'organization-invitation:' || invite_id::text
  );

  update public.organization_seat_change_requests
  set invite_id = invite_id,
      updated_at = now()
  where id = request_id;

  return jsonb_build_object(
    'request_id', request_id,
    'invite_id', invite_id,
    'invitation_url', invitation_url,
    'previous_seat_count', reserved_seats,
    'seat_count', new_seat_count,
    'included_users', selected.included_users,
    'additional_billable_seats', new_billable_seats,
    'immediate_amount_ex_vat', amount_ex_vat,
    'vat_amount', vat_amount,
    'immediate_amount_inc_vat', amount_inc_vat,
    'recurring_extra_user_price_ex_vat', selected.net_extra_user_price_ex_vat,
    'invoice_id', invoice_id,
    'invoice_number', invoice_number
  );
end;
$$;

create or replace function public.accept_organization_invite_internal(
  p_user_id uuid,
  p_plain_token text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_email text;
  profile_id uuid;
  profile_name text;
  selected_invite record;
  linked_worker_id uuid;
begin
  select lower(account.email), profile.id, profile.full_name
  into user_email, profile_id, profile_name
  from auth.users account
  join public.profiles profile on profile.user_id = account.id
  where account.id = p_user_id and account.email_confirmed_at is not null;

  select invite.* into selected_invite
  from private.organization_invites invite
  where invite.token_hash = encode(extensions.digest(p_plain_token, 'sha256'), 'hex')
    and invite.accepted_at is null
    and invite.expires_at > now()
  limit 1
  for update;

  if user_email is null
    or selected_invite.id is null
    or selected_invite.email_normalized <> user_email
  then
    raise exception 'Invitation is invalid or expired' using errcode = '42501';
  end if;

  insert into public.organization_members (
    organization_id,
    profile_id,
    user_id,
    role,
    active,
    invited_by_user_id
  ) values (
    selected_invite.organization_id,
    profile_id,
    p_user_id,
    selected_invite.role,
    true,
    selected_invite.invited_by_user_id
  )
  on conflict (organization_id, user_id) do update
    set active = true,
        role = excluded.role,
        profile_id = excluded.profile_id,
        invited_by_user_id = excluded.invited_by_user_id,
        joined_at = now();

  update public.profiles
  set current_organization_id = coalesce(current_organization_id, selected_invite.organization_id),
      full_name = case
        when nullif(btrim(coalesce(full_name, '')), '') is null
          then coalesce(selected_invite.full_name, profile_name)
        else full_name
      end
  where id = profile_id;

  update public.workers
  set profile_id = profile_id,
      full_name = coalesce(selected_invite.full_name, profile_name, full_name),
      active = true,
      updated_at = now()
  where organization_id = selected_invite.organization_id
    and lower(coalesce(email, '')) = user_email
  returning id into linked_worker_id;

  if linked_worker_id is null then
    insert into public.workers (
      organization_id,
      profile_id,
      full_name,
      email,
      employment_type,
      active,
      gps_enabled
    ) values (
      selected_invite.organization_id,
      profile_id,
      coalesce(selected_invite.full_name, profile_name, user_email),
      user_email,
      case when selected_invite.role = 'contractor' then 'contractor' else 'employee' end,
      true,
      true
    );
  end if;

  update private.organization_invites
  set accepted_at = now(),
      accepted_by_user_id = p_user_id
  where id = selected_invite.id;

  if selected_invite.seat_change_request_id is not null then
    update public.organization_seat_change_requests
    set status = 'accepted',
        accepted_at = now(),
        updated_at = now()
    where id = selected_invite.seat_change_request_id;
  end if;

  return selected_invite.organization_id;
end;
$$;

revoke all on function public.get_organization_seat_overview(uuid) from public, anon;
revoke all on function public.approve_organization_member_invite(
  uuid,text,text,text,text,timestamptz,boolean,text
) from public, anon;
revoke all on function public.accept_organization_invite_internal(uuid,text) from public, anon;

grant execute on function public.get_organization_seat_overview(uuid) to authenticated;
grant execute on function public.approve_organization_member_invite(
  uuid,text,text,text,text,timestamptz,boolean,text
) to authenticated;
grant execute on function public.accept_organization_invite_internal(uuid,text) to authenticated;

select pg_notify('pgrst', 'reload schema');

commit;
