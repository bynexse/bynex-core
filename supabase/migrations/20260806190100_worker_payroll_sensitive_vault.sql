begin;

do $vault$
begin
  if not exists (
    select 1
    from vault.decrypted_secrets secret
    where secret.name = 'bynex_worker_payroll_pii_v1'
  ) then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'bynex_worker_payroll_pii_v1',
      'Encryption key for worker personal identity and payment accounts',
      null
    );
  end if;
end
$vault$;

create or replace function private.worker_payroll_pii_secret()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  selected_secret text;
begin
  select secret.decrypted_secret
  into selected_secret
  from vault.decrypted_secrets secret
  where secret.name = 'bynex_worker_payroll_pii_v1'
  order by secret.updated_at desc
  limit 1;

  if selected_secret is null then
    raise exception 'Krypteringsnyckeln för löneuppgifter saknas'
      using errcode = 'P0001';
  end if;

  return selected_secret;
end;
$$;

create or replace function private.encrypt_worker_payroll_value(requested_value text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select encode(
    extensions.pgp_sym_encrypt(
      requested_value,
      private.worker_payroll_pii_secret(),
      'cipher-algo=aes256, compress-algo=0'
    ),
    'base64'
  );
$$;

create or replace function private.decrypt_worker_payroll_value(requested_ciphertext text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select extensions.pgp_sym_decrypt(
    decode(requested_ciphertext, 'base64'),
    private.worker_payroll_pii_secret(),
    'cipher-algo=aes256'
  );
$$;

create or replace function private.fingerprint_worker_payroll_value(
  requested_context text,
  requested_normalized_value text
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select encode(
    extensions.hmac(
      requested_context || ':' || requested_normalized_value,
      private.worker_payroll_pii_secret() || ':fingerprint',
      'sha256'
    ),
    'hex'
  );
$$;

revoke all on function private.worker_payroll_pii_secret() from public, anon, authenticated;
revoke all on function private.encrypt_worker_payroll_value(text) from public, anon, authenticated;
revoke all on function private.decrypt_worker_payroll_value(text) from public, anon, authenticated;
revoke all on function private.fingerprint_worker_payroll_value(text,text) from public, anon, authenticated;

create or replace function public.get_worker_sensitive_payroll_status(
  requested_worker_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  selected_organization_id uuid;
  identity_record record;
  payment_record record;
begin
  selected_organization_id := private.require_worker_payroll_role(
    requested_worker_id,
    array['owner','admin','office','hr','payroll']::text[]
  );

  select identity.last_four, identity.country_code, identity.updated_at
  into identity_record
  from private.worker_tax_identities identity
  where identity.organization_id = selected_organization_id
    and identity.worker_id = requested_worker_id;

  select account.account_last_four, account.bank_country_code, account.bic, account.updated_at
  into payment_record
  from private.worker_payment_accounts account
  where account.organization_id = selected_organization_id
    and account.worker_id = requested_worker_id
    and account.active;

  return jsonb_build_object(
    'personalIdentityConfigured', identity_record.last_four is not null,
    'personalIdentityLastFour', identity_record.last_four,
    'personalIdentityCountryCode', identity_record.country_code,
    'personalIdentityUpdatedAt', identity_record.updated_at,
    'paymentAccountConfigured', payment_record.account_last_four is not null,
    'paymentAccountLastFour', payment_record.account_last_four,
    'paymentAccountCountryCode', payment_record.bank_country_code,
    'paymentAccountBic', payment_record.bic,
    'paymentAccountUpdatedAt', payment_record.updated_at
  );
end;
$$;

create or replace function public.save_worker_sensitive_payroll_setup(
  requested_worker_id uuid,
  requested_update_identity boolean default false,
  requested_personal_identity text default null,
  requested_identity_country_code text default 'SE',
  requested_update_payment boolean default false,
  requested_payment_account text default null,
  requested_bank_country_code text default 'SE',
  requested_bic text default null,
  requested_purpose text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_organization_id uuid;
  normalized_identity text;
  normalized_account text;
  normalized_identity_country text := upper(btrim(coalesce(requested_identity_country_code, 'SE')));
  normalized_bank_country text := upper(btrim(coalesce(requested_bank_country_code, 'SE')));
  normalized_bic text := nullif(upper(regexp_replace(btrim(coalesce(requested_bic, '')), '[^0-9A-Z]', '', 'g')), '');
  identity_last_four text;
  account_last_four text;
begin
  selected_organization_id := private.require_worker_payroll_role(
    requested_worker_id,
    array['owner','admin','hr','payroll']::text[]
  );

  if not requested_update_identity and not requested_update_payment then
    raise exception 'Välj minst en känslig uppgift att uppdatera'
      using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(requested_purpose, ''))) not between 5 and 500 then
    raise exception 'Ange varför uppgifterna registreras'
      using errcode = '22023';
  end if;
  if normalized_identity_country !~ '^[A-Z]{2}$'
    or normalized_bank_country !~ '^[A-Z]{2}$' then
    raise exception 'Ogiltig landskod' using errcode = '22023';
  end if;
  if normalized_bic is not null and char_length(normalized_bic) not in (8, 11) then
    raise exception 'BIC ska bestå av 8 eller 11 tecken'
      using errcode = '22023';
  end if;

  if requested_update_identity then
    if normalized_identity_country = 'SE' then
      normalized_identity := regexp_replace(
        btrim(coalesce(requested_personal_identity, '')),
        '[^0-9]',
        '',
        'g'
      );
      if char_length(normalized_identity) not in (10, 12) then
        raise exception 'Svenskt personnummer ska innehålla 10 eller 12 siffror'
          using errcode = '22023';
      end if;
    else
      normalized_identity := upper(regexp_replace(
        btrim(coalesce(requested_personal_identity, '')),
        '[^0-9A-Z]',
        '',
        'g'
      ));
      if char_length(normalized_identity) not between 4 and 32 then
        raise exception 'Kontrollera identitetsnumret'
          using errcode = '22023';
      end if;
    end if;

    identity_last_four := right(normalized_identity, 4);

    insert into private.worker_tax_identities (
      organization_id, worker_id, personal_identity_ciphertext,
      identity_fingerprint, last_four, country_code, key_version
    ) values (
      selected_organization_id,
      requested_worker_id,
      private.encrypt_worker_payroll_value(btrim(requested_personal_identity)),
      private.fingerprint_worker_payroll_value('identity', normalized_identity),
      identity_last_four,
      normalized_identity_country,
      'vault:worker-payroll-pii-v1'
    )
    on conflict (organization_id, worker_id) do update set
      personal_identity_ciphertext = excluded.personal_identity_ciphertext,
      identity_fingerprint = excluded.identity_fingerprint,
      last_four = excluded.last_four,
      country_code = excluded.country_code,
      key_version = excluded.key_version,
      updated_at = now();

    insert into private.worker_payroll_control_events (
      organization_id, worker_id, actor_user_id, event_type, purpose, metadata
    ) values (
      selected_organization_id,
      requested_worker_id,
      (select auth.uid()),
      'sensitive_identity_saved',
      btrim(requested_purpose),
      jsonb_build_object(
        'country_code', normalized_identity_country,
        'last_four', identity_last_four
      )
    );
  end if;

  if requested_update_payment then
    normalized_account := upper(regexp_replace(
      btrim(coalesce(requested_payment_account, '')),
      '[^0-9A-Z]',
      '',
      'g'
    ));
    if char_length(normalized_account) not between 5 and 34 then
      raise exception 'Kontrollera utbetalningskontot'
        using errcode = '22023';
    end if;

    account_last_four := right(normalized_account, 4);

    insert into private.worker_payment_accounts (
      organization_id, worker_id, account_ciphertext,
      account_fingerprint, account_last_four, bank_country_code,
      bic, key_version, active
    ) values (
      selected_organization_id,
      requested_worker_id,
      private.encrypt_worker_payroll_value(btrim(requested_payment_account)),
      private.fingerprint_worker_payroll_value('payment-account', normalized_account),
      account_last_four,
      normalized_bank_country,
      normalized_bic,
      'vault:worker-payroll-pii-v1',
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

    insert into private.worker_payroll_control_events (
      organization_id, worker_id, actor_user_id, event_type, purpose, metadata
    ) values (
      selected_organization_id,
      requested_worker_id,
      (select auth.uid()),
      'payment_account_saved',
      btrim(requested_purpose),
      jsonb_build_object(
        'country_code', normalized_bank_country,
        'last_four', account_last_four,
        'bic', normalized_bic
      )
    );
  end if;

  return public.get_worker_sensitive_payroll_status(requested_worker_id);
exception
  when unique_violation then
    raise exception 'Personnumret eller utbetalningskontot används redan på en annan person'
      using errcode = '23505';
end;
$$;

create or replace function public.reveal_worker_sensitive_payroll_setup(
  requested_worker_id uuid,
  requested_purpose text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_organization_id uuid;
  identity_record record;
  payment_record record;
begin
  selected_organization_id := private.require_worker_payroll_role(
    requested_worker_id,
    array['owner','admin','hr','payroll']::text[]
  );

  if char_length(btrim(coalesce(requested_purpose, ''))) not between 5 and 500 then
    raise exception 'Ange varför uppgifterna behöver visas'
      using errcode = '22023';
  end if;

  select
    private.decrypt_worker_payroll_value(identity.personal_identity_ciphertext) as personal_identity,
    identity.country_code,
    identity.last_four
  into identity_record
  from private.worker_tax_identities identity
  where identity.organization_id = selected_organization_id
    and identity.worker_id = requested_worker_id;

  select
    private.decrypt_worker_payroll_value(account.account_ciphertext) as payment_account,
    account.bank_country_code,
    account.bic,
    account.account_last_four
  into payment_record
  from private.worker_payment_accounts account
  where account.organization_id = selected_organization_id
    and account.worker_id = requested_worker_id
    and account.active;

  insert into private.worker_payroll_control_events (
    organization_id, worker_id, actor_user_id, event_type, purpose, metadata
  ) values (
    selected_organization_id,
    requested_worker_id,
    (select auth.uid()),
    'sensitive_payroll_revealed',
    btrim(requested_purpose),
    jsonb_build_object(
      'identity_revealed', identity_record.personal_identity is not null,
      'payment_account_revealed', payment_record.payment_account is not null
    )
  );

  return jsonb_build_object(
    'personalIdentity', identity_record.personal_identity,
    'personalIdentityCountryCode', identity_record.country_code,
    'paymentAccount', payment_record.payment_account,
    'paymentAccountCountryCode', payment_record.bank_country_code,
    'paymentAccountBic', payment_record.bic
  );
end;
$$;

revoke all on function public.get_worker_sensitive_payroll_status(uuid)
  from public, anon;
revoke all on function public.save_worker_sensitive_payroll_setup(
  uuid,boolean,text,text,boolean,text,text,text,text
) from public, anon;
revoke all on function public.reveal_worker_sensitive_payroll_setup(uuid,text)
  from public, anon;

grant execute on function public.get_worker_sensitive_payroll_status(uuid)
  to authenticated;
grant execute on function public.save_worker_sensitive_payroll_setup(
  uuid,boolean,text,text,boolean,text,text,text,text
) to authenticated;
grant execute on function public.reveal_worker_sensitive_payroll_setup(uuid,text)
  to authenticated;

select pg_notify('pgrst', 'reload schema');

commit;
