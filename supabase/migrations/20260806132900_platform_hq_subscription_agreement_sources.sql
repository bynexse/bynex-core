begin;

-- Makes the paying-customer activation migration self-contained on environments
-- that were created before the HQ contract-signing release.
alter table public.subscription_agreements
  add column if not exists platform_contract_id uuid,
  add column if not exists acceptance_source text not null default 'customer_app',
  add column if not exists external_signer_name text,
  add column if not exists external_signer_email text;

alter table public.subscription_agreements
  alter column accepted_by_user_id drop not null;

do $constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.subscription_agreements'::regclass
      and conname = 'subscription_agreements_platform_contract_id_fkey'
  ) then
    alter table public.subscription_agreements
      add constraint subscription_agreements_platform_contract_id_fkey
      foreign key (platform_contract_id)
      references public.platform_contracts(id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.subscription_agreements'::regclass
      and conname = 'subscription_agreements_platform_contract_id_key'
  ) then
    alter table public.subscription_agreements
      add constraint subscription_agreements_platform_contract_id_key
      unique (platform_contract_id);
  end if;
end
$constraints$;

select pg_notify('pgrst', 'reload schema');

commit;
