begin;

do $$
begin
  if not exists (
    select 1 from vault.secrets
    where name = 'bynex_worker_payroll_encryption_key'
  ) then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'bynex_worker_payroll_encryption_key',
      'Encryption key for tenant-scoped worker identity and payment account values.',
      null
    );
  end if;
end $$;

create table if not exists public.worker_sensitive_payroll_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  worker_id uuid not null,
  event_type text not null check (event_type in (
    'personal_identity_set',
    'payment_account_set',
    'tax_setting_set',
    'vacation_balance_set'
  )),
  actor_user_id uuid references auth.users(id) on delete set null,
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  created_at timestamptz not null default now(),
  foreign key (organization_id, worker_id)
    references public.workers (organization_id, id) on delete cascade
);

create index if not exists worker_sensitive_payroll_events_worker_idx
  on public.worker_sensitive_payroll_events (
    organization_id,
    worker_id,
    created_at desc
  );

alter table public.worker_sensitive_payroll_events enable row level security;
alter table public.worker_sensitive_payroll_events force row level security;
revoke all on public.worker_sensitive_payroll_events from public, anon, authenticated;

create or replace function private.normalize_swedish_personal_identity(
  requested_value text
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  digits text;
  short_form text;
  checksum integer := 0;
  position integer;
  digit integer;
  product integer;
begin
  digits := regexp_replace(coalesce(requested_value, ''), '[^0-9]', '', 'g');
  if char_length(digits) = 12 then
    short_form := right(digits, 10);
  elsif char_length(digits) = 10 then
    short_form := digits;
  else
    return null;
  end if;

  for position in 1..10 loop
    digit := substring(short_form from position for 1)::integer;
    product := digit * case when position % 2 = 1 then 2 else 1 end;
    checksum := checksum + case when product > 9 then product - 9 else product end;
  end loop;

  if checksum % 10 <> 0 then
    return null;
  end if;
  return digits;
end;
$$;

revoke all on function private.normalize_swedish_personal_identity(text)
  from public, anon, authenticated;

create or replace function private.worker_sensitive_encryption_key()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  encryption_key text;
begin
  select secret.decrypted_secret
  into encryption_key
  from vault.decrypted_secrets secret
  where secret.name = 'bynex_worker_payroll_encryption_key'
  order by secret.created_at desc
  limit 1;

  if encryption_key is null or char_length(encryption_key) < 32 then
    raise exception 'Krypteringsnyckeln för löneuppgifter är inte konfigurerad'
      using errcode = '55000';
  end if;
  return encryption_key;
end;
$$;

revoke all on function private.worker_sensitive_encryption_key()
  from public, anon, authenticated;

create or replace function public.get_worker_payroll_card(
  p_worker_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  selected_worker public.workers;
  tax_setting public.worker_tax_settings;
  leave_balance public.worker_leave_balances;
  identity_row record;
  payment_row record;
begin
  select worker.* into selected_worker
  from public.workers worker
  where worker.id = p_worker_id;

  if selected_worker.id is null then
    raise exception 'Medarbetaren hittades inte' using errcode = 'P0002';
  end if;

  if not private.has_organization_role(
    selected_worker.organization_id,
    array['owner','admin','hr','payroll']::text[],
    actor_user_id
  ) then
    raise exception 'Behörighet till lönekortet saknas' using errcode = '42501';
  end if;

  select setting.* into tax_setting
  from public.worker_tax_settings setting
  where setting.organization_id = selected_worker.organization_id
    and setting.worker_id = selected_worker.id
    and setting.valid_from <= current_date
    and (setting.valid_until is null or setting.valid_until >= current_date)
  order by setting.valid_from desc, setting.created_at desc
  limit 1;

  select balance.* into leave_balance
  from public.worker_leave_balances balance
  where balance.organization_id = selected_worker.organization_id
    and balance.worker_id = selected_worker.id
    and balance.leave_type = 'vacation'
  order by balance.balance_year desc
  limit 1;

  select identity.last_four, identity.key_version
  into identity_row
  from private.worker_tax_identities identity
  where identity.organization_id = selected_worker.organization_id
    and identity.worker_id = selected_worker.id;

  select account.account_last_four, account.bic, account.key_version
  into payment_row
  from private.worker_payment_accounts account
  where account.organization_id = selected_worker.organization_id
    and account.worker_id = selected_worker.id
    and account.active;

  return jsonb_build_object(
    'worker', jsonb_build_object(
      'id', selected_worker.id,
      'full_name', selected_worker.full_name,
      'job_title', selected_worker.job_title,
      'employment_type', selected_worker.employment_type
    ),
    'taxSettings', case
      when tax_setting.id is null then null
      else jsonb_build_object(
        'tax_form', tax_setting.tax_form,
        'tax_table', tax_setting.tax_table,
        'tax_column', tax_setting.tax_column,
        'adjustment_percent', tax_setting.adjustment_percent,
        'main_employer', tax_setting.main_employer,
        'valid_from', tax_setting.valid_from,
        'valid_until', tax_setting.valid_until,
        'source', tax_setting.source,
        'source_checked_at', tax_setting.source_checked_at
      )
    end,
    'leaveBalance', case
      when leave_balance.id is null then null
      else jsonb_build_object(
        'balance_year', leave_balance.balance_year,
        'opening_days', leave_balance.opening_days,
        'earned_days', leave_balance.earned_days,
        'used_days', leave_balance.used_days,
        'planned_days', leave_balance.planned_days,
        'remaining_days', leave_balance.remaining_days,
        'calculated_at', leave_balance.calculated_at
      )
    end,
    'sensitive', jsonb_build_object(
      'personalIdentityConfigured', identity_row.last_four is not null,
      'personalIdentityLastFour', identity_row.last_four,
      'paymentAccountConfigured', payment_row.account_last_four is not null,
      'paymentAccountLastFour', payment_row.account_last_four,
      'paymentAccountBic', payment_row.bic,
      'keyVersion', coalesce(
        identity_row.key_version,
        payment_row.key_version,
        'bynex-worker-sensitive-v1'
      )
    ),
    'capabilities', jsonb_build_object(
      'taxSettingsWritable', true,
      'vacationBalanceWritable', true,
      'personalIdentityWritable', true,
      'paymentAccountWritable', true,
      'plaintextSensitiveDataReturned', false
    )
  );
end;
$$;

create or replace function public.save_worker_tax_settings(
  p_worker_id uuid,
  p_tax_form text,
  p_tax_table smallint default null,
  p_tax_column smallint default null,
  p_adjustment_percent numeric default null,
  p_main_employer boolean default true,
  p_valid_from date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  selected_worker public.workers;
  next_valid_from date;
begin
  select worker.* into selected_worker
  from public.workers worker
  where worker.id = p_worker_id
  for update;

  if selected_worker.id is null then
    raise exception 'Medarbetaren hittades inte' using errcode = 'P0002';
  end if;

  if not private.has_organization_role(
    selected_worker.organization_id,
    array['owner','admin','hr','payroll']::text[],
    actor_user_id
  ) then
    raise exception 'Behörighet till skatteinställningar saknas' using errcode = '42501';
  end if;

  if p_tax_form not in ('A','F','FA','SINK','unknown')
    or (p_tax_table is not null and p_tax_table not between 1 and 99)
    or (p_tax_column is not null and p_tax_column not between 1 and 6)
    or (p_adjustment_percent is not null and p_adjustment_percent not between 0 and 100)
    or p_valid_from is null
  then
    raise exception 'Kontrollera skatteinställningarna' using errcode = '22023';
  end if;

  select min(setting.valid_from)
  into next_valid_from
  from public.worker_tax_settings setting
  where setting.organization_id = selected_worker.organization_id
    and setting.worker_id = selected_worker.id
    and setting.valid_from > p_valid_from;

  update public.worker_tax_settings setting
  set valid_until = p_valid_from - 1,
      updated_at = now()
  where setting.organization_id = selected_worker.organization_id
    and setting.worker_id = selected_worker.id
    and setting.valid_from < p_valid_from
    and (setting.valid_until is null or setting.valid_until >= p_valid_from);

  insert into public.worker_tax_settings (
    organization_id,
    worker_id,
    tax_form,
    tax_table,
    tax_column,
    adjustment_percent,
    main_employer,
    valid_from,
    valid_until,
    source,
    source_checked_at
  ) values (
    selected_worker.organization_id,
    selected_worker.id,
    p_tax_form,
    p_tax_table,
    p_tax_column,
    p_adjustment_percent,
    coalesce(p_main_employer, true),
    p_valid_from,
    case when next_valid_from is null then null else next_valid_from - 1 end,
    'manual',
    now()
  )
  on conflict (organization_id, worker_id, valid_from) do update set
    tax_form = excluded.tax_form,
    tax_table = excluded.tax_table,
    tax_column = excluded.tax_column,
    adjustment_percent = excluded.adjustment_percent,
    main_employer = excluded.main_employer,
    valid_until = excluded.valid_until,
    source = excluded.source,
    source_checked_at = excluded.source_checked_at,
    updated_at = now();

  insert into public.worker_sensitive_payroll_events (
    organization_id,
    worker_id,
    event_type,
    actor_user_id,
    detail
  ) values (
    selected_worker.organization_id,
    selected_worker.id,
    'tax_setting_set',
    actor_user_id,
    jsonb_build_object(
      'tax_form', p_tax_form,
      'tax_table', p_tax_table,
      'tax_column', p_tax_column,
      'main_employer', coalesce(p_main_employer, true),
      'valid_from', p_valid_from
    )
  );

  return public.get_worker_payroll_card(selected_worker.id);
end;
$$;

create or replace function public.save_worker_vacation_balance(
  p_worker_id uuid,
  p_balance_year integer,
  p_opening_days numeric default 0,
  p_earned_days numeric default 0,
  p_used_days numeric default 0,
  p_planned_days numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  selected_worker public.workers;
begin
  select worker.* into selected_worker
  from public.workers worker
  where worker.id = p_worker_id
  for update;

  if selected_worker.id is null then
    raise exception 'Medarbetaren hittades inte' using errcode = 'P0002';
  end if;

  if not private.has_organization_role(
    selected_worker.organization_id,
    array['owner','admin','hr','payroll']::text[],
    actor_user_id
  ) then
    raise exception 'Behörighet till semestersaldo saknas' using errcode = '42501';
  end if;

  if p_balance_year not between 2000 and 2200
    or coalesce(p_opening_days, 0) < 0
    or coalesce(p_earned_days, 0) < 0
    or coalesce(p_used_days, 0) < 0
    or coalesce(p_planned_days, 0) < 0
    or greatest(
      coalesce(p_opening_days, 0),
      coalesce(p_earned_days, 0),
      coalesce(p_used_days, 0),
      coalesce(p_planned_days, 0)
    ) > 1000
  then
    raise exception 'Kontrollera semestersaldot' using errcode = '22023';
  end if;

  insert into public.worker_leave_balances (
    organization_id,
    worker_id,
    balance_year,
    leave_type,
    opening_days,
    earned_days,
    used_days,
    planned_days,
    calculation_version,
    calculated_at
  ) values (
    selected_worker.organization_id,
    selected_worker.id,
    p_balance_year,
    'vacation',
    coalesce(p_opening_days, 0),
    coalesce(p_earned_days, 0),
    coalesce(p_used_days, 0),
    coalesce(p_planned_days, 0),
    'manual-payroll-card-v1',
    now()
  )
  on conflict (organization_id, worker_id, balance_year, leave_type) do update set
    opening_days = excluded.opening_days,
    earned_days = excluded.earned_days,
    used_days = excluded.used_days,
    planned_days = excluded.planned_days,
    calculation_version = excluded.calculation_version,
    calculated_at = excluded.calculated_at,
    updated_at = now();

  insert into public.worker_sensitive_payroll_events (
    organization_id,
    worker_id,
    event_type,
    actor_user_id,
    detail
  ) values (
    selected_worker.organization_id,
    selected_worker.id,
    'vacation_balance_set',
    actor_user_id,
    jsonb_build_object(
      'balance_year', p_balance_year,
      'opening_days', coalesce(p_opening_days, 0),
      'earned_days', coalesce(p_earned_days, 0),
      'used_days', coalesce(p_used_days, 0),
      'planned_days', coalesce(p_planned_days, 0)
    )
  );

  return public.get_worker_payroll_card(selected_worker.id);
end;
$$;

create or replace function public.set_worker_personal_identity(
  requested_worker_id uuid,
  requested_personal_identity text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  selected_organization_id uuid;
  normalized_identity text;
  encryption_key text;
  key_version_value text := 'bynex-worker-sensitive-v1';
begin
  select worker.organization_id
  into selected_organization_id
  from public.workers worker
  where worker.id = requested_worker_id
  for update;

  if selected_organization_id is null then
    raise exception 'Medarbetaren hittades inte' using errcode = 'P0002';
  end if;

  if not private.has_organization_role(
    selected_organization_id,
    array['owner','admin','hr','payroll']::text[],
    actor_user_id
  ) then
    raise exception 'Behörighet till personnummer saknas' using errcode = '42501';
  end if;

  normalized_identity :=
    private.normalize_swedish_personal_identity(requested_personal_identity);
  if normalized_identity is null then
    raise exception 'Kontrollera personnumret eller samordningsnumret'
      using errcode = '22023';
  end if;

  encryption_key := private.worker_sensitive_encryption_key();

  insert into private.worker_tax_identities (
    organization_id,
    worker_id,
    personal_identity_ciphertext,
    identity_fingerprint,
    last_four,
    country_code,
    key_version
  ) values (
    selected_organization_id,
    requested_worker_id,
    encode(
      extensions.pgp_sym_encrypt(
        normalized_identity,
        encryption_key,
        'cipher-algo=aes256,compress-algo=0'
      ),
      'base64'
    ),
    encode(extensions.digest(normalized_identity, 'sha256'), 'hex'),
    right(normalized_identity, 4),
    'SE',
    key_version_value
  )
  on conflict (organization_id, worker_id) do update set
    personal_identity_ciphertext = excluded.personal_identity_ciphertext,
    identity_fingerprint = excluded.identity_fingerprint,
    last_four = excluded.last_four,
    country_code = excluded.country_code,
    key_version = excluded.key_version,
    updated_at = now();

  insert into public.worker_sensitive_payroll_events (
    organization_id,
    worker_id,
    event_type,
    actor_user_id,
    detail
  ) values (
    selected_organization_id,
    requested_worker_id,
    'personal_identity_set',
    actor_user_id,
    jsonb_build_object(
      'last_four', right(normalized_identity, 4),
      'key_version', key_version_value
    )
  );

  return true;
end;
$$;

create or replace function public.set_worker_payment_account(
  requested_worker_id uuid,
  requested_account text,
  requested_bic text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  selected_organization_id uuid;
  normalized_account text;
  normalized_bic text;
  encryption_key text;
  key_version_value text := 'bynex-worker-sensitive-v1';
begin
  select worker.organization_id
  into selected_organization_id
  from public.workers worker
  where worker.id = requested_worker_id
  for update;

  if selected_organization_id is null then
    raise exception 'Medarbetaren hittades inte' using errcode = 'P0002';
  end if;

  if not private.has_organization_role(
    selected_organization_id,
    array['owner','admin','hr','payroll']::text[],
    actor_user_id
  ) then
    raise exception 'Behörighet till lönekonto saknas' using errcode = '42501';
  end if;

  normalized_account := upper(
    regexp_replace(coalesce(requested_account, ''), '[^0-9A-Z]', '', 'g')
  );
  normalized_bic := nullif(
    upper(regexp_replace(coalesce(requested_bic, ''), '[^0-9A-Z]', '', 'g')),
    ''
  );

  if char_length(normalized_account) not between 5 and 50
    or (normalized_bic is not null and char_length(normalized_bic) not between 8 and 11)
  then
    raise exception 'Kontrollera lönekontot och eventuell BIC'
      using errcode = '22023';
  end if;

  encryption_key := private.worker_sensitive_encryption_key();

  insert into private.worker_payment_accounts (
    organization_id,
    worker_id,
    account_ciphertext,
    account_fingerprint,
    account_last_four,
    bank_country_code,
    bic,
    key_version,
    active
  ) values (
    selected_organization_id,
    requested_worker_id,
    encode(
      extensions.pgp_sym_encrypt(
        normalized_account,
        encryption_key,
        'cipher-algo=aes256,compress-algo=0'
      ),
      'base64'
    ),
    encode(extensions.digest(normalized_account, 'sha256'), 'hex'),
    right(normalized_account, 4),
    'SE',
    normalized_bic,
    key_version_value,
    true
  )
  on conflict (organization_id, worker_id) do update set
    account_ciphertext = excluded.account_ciphertext,
    account_fingerprint = excluded.account_fingerprint,
    account_last_four = excluded.account_last_four,
    bank_country_code = excluded.bank_country_code,
    bic = excluded.bic,
    key_version = excluded.key_version,
    active = true,
    updated_at = now();

  insert into public.worker_sensitive_payroll_events (
    organization_id,
    worker_id,
    event_type,
    actor_user_id,
    detail
  ) values (
    selected_organization_id,
    requested_worker_id,
    'payment_account_set',
    actor_user_id,
    jsonb_build_object(
      'account_last_four', right(normalized_account, 4),
      'bic_configured', normalized_bic is not null,
      'key_version', key_version_value
    )
  );

  return true;
end;
$$;

revoke all on function public.get_worker_payroll_card(uuid) from public, anon;
revoke all on function public.save_worker_tax_settings(
  uuid, text, smallint, smallint, numeric, boolean, date
) from public, anon;
revoke all on function public.save_worker_vacation_balance(
  uuid, integer, numeric, numeric, numeric, numeric
) from public, anon;
revoke all on function public.set_worker_personal_identity(uuid, text)
  from public, anon;
revoke all on function public.set_worker_payment_account(uuid, text, text)
  from public, anon;

grant execute on function public.get_worker_payroll_card(uuid)
  to authenticated, service_role;
grant execute on function public.save_worker_tax_settings(
  uuid, text, smallint, smallint, numeric, boolean, date
) to authenticated, service_role;
grant execute on function public.save_worker_vacation_balance(
  uuid, integer, numeric, numeric, numeric, numeric
) to authenticated, service_role;
grant execute on function public.set_worker_personal_identity(uuid, text)
  to authenticated, service_role;
grant execute on function public.set_worker_payment_account(uuid, text, text)
  to authenticated, service_role;

select pg_notify('pgrst', 'reload schema');

commit;
