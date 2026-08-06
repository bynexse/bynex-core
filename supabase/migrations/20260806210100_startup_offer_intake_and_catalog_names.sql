begin;

create table if not exists public.startup_offer_applications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique
    references public.organizations(id) on delete cascade,
  organization_number text not null,
  requested_by_user_id uuid not null default auth.uid()
    references auth.users(id) on delete restrict,
  status text not null default 'pending_verification'
    check (status in ('pending_verification','approved','rejected','cancelled','expired')),
  verification_source text,
  verified_registration_date date,
  benefit_plan_slug text not null default 'time-payroll',
  benefit_months smallint not null default 6
    check (benefit_months between 1 and 24),
  benefit_starts_at timestamptz,
  benefit_ends_at timestamptz,
  reviewed_by_user_id uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  requested_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (benefit_ends_at is null or benefit_starts_at is not null),
  check (benefit_ends_at is null or benefit_ends_at > benefit_starts_at),
  check (
    (status = 'pending_verification' and reviewed_at is null)
    or status <> 'pending_verification'
  )
);

create index if not exists startup_offer_applications_status_idx
  on public.startup_offer_applications(status, requested_at desc);

drop trigger if exists startup_offer_applications_set_updated_at
  on public.startup_offer_applications;
create trigger startup_offer_applications_set_updated_at
before update on public.startup_offer_applications
for each row execute function public.set_updated_at();

alter table public.startup_offer_applications enable row level security;
alter table public.startup_offer_applications force row level security;
revoke all on public.startup_offer_applications from public, anon, authenticated;
grant select on public.startup_offer_applications to authenticated;

drop policy if exists startup_offer_application_member_select
  on public.startup_offer_applications;
create policy startup_offer_application_member_select
  on public.startup_offer_applications
  for select to authenticated
  using ((select private.is_organization_member(organization_id)));

-- Keep the existing four-argument provisioning function available during
-- deployment. New onboarding uses a uniquely named v2 RPC, which avoids
-- ambiguous PostgREST overload resolution.
drop function if exists public.provision_bynex_organization(
  text, text, text, text, boolean
);

create or replace function public.provision_bynex_organization_v2(
  p_organization_name text,
  p_organization_number text,
  p_business_form text,
  p_beta_scope text default 'complete',
  p_startup_offer_requested boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  selected_organization_id uuid;
  selected_organization_number text;
  selected_application_status text;
begin
  selected_organization_id := public.provision_beta_organization(
    p_organization_name,
    p_organization_number,
    p_business_form,
    p_beta_scope
  );

  if not p_startup_offer_requested then
    return selected_organization_id;
  end if;

  if not private.has_organization_role(
    selected_organization_id,
    array['owner','admin']::text[],
    current_user_id
  ) then
    raise exception 'Endast företagets ägare eller administratör kan ansöka om nystartserbjudandet'
      using errcode = '42501';
  end if;

  select organization.organization_number
  into selected_organization_number
  from public.organizations organization
  where organization.id = selected_organization_id;

  insert into public.startup_offer_applications (
    organization_id,
    organization_number,
    requested_by_user_id,
    status,
    benefit_plan_slug,
    benefit_months
  ) values (
    selected_organization_id,
    selected_organization_number,
    current_user_id,
    'pending_verification',
    'time-payroll',
    6
  )
  on conflict (organization_id) do nothing;

  select application.status
  into selected_application_status
  from public.startup_offer_applications application
  where application.organization_id = selected_organization_id;

  update public.organizations organization
  set settings = coalesce(organization.settings, '{}'::jsonb) || jsonb_build_object(
        'startup_offer_requested', true,
        'startup_offer_review_status', coalesce(
          selected_application_status,
          'pending_verification'
        )
      ),
      updated_at = now()
  where organization.id = selected_organization_id;

  return selected_organization_id;
end;
$$;

revoke all on function public.provision_bynex_organization_v2(
  text, text, text, text, boolean
) from public, anon;
grant execute on function public.provision_bynex_organization_v2(
  text, text, text, text, boolean
) to authenticated, service_role;

comment on table public.startup_offer_applications is
  'Applications for six free months of Bynex Företag. No benefit is activated until organization number and registration date have been reviewed separately.';
comment on function public.provision_bynex_organization_v2(
  text, text, text, text, boolean
) is
  'Creates a 14-day Bynex trial and optionally records a pending six-month Bynex Företag startup application.';

-- Keep database labels consistent with the customer-facing Bynex menu.
-- Entitlements, plans and prices are intentionally untouched.
update public.product_modules as module
set name = catalogue.name,
    description = catalogue.description,
    updated_at = now()
from (values
  ('time_payroll', 'Bynex Tid',
   'Tidrapportering, frånvaro, attest, anställningskort och löneunderlag.'),
  ('projects', 'Bynex Projekt',
   'Projektstyrning, bemanning, byggdagbok, dokumentation och uppföljning.'),
  ('quotes', 'Bynex Offert',
   'Kalkyl, offert, kunduppgifter och spårbart digitalt godkännande.'),
  ('change_orders', 'Bynex ÄTA',
   'ÄTA på plats, Bynex Smart prisunderlag, bevis och kundbeslut.'),
  ('materials', 'Bynex Material',
   'Prislistor, artiklar, lager, inköp och stilleståndskalkyl.'),
  ('invoicing', 'Bynex Faktura',
   'Fristående faktura eller faktura från projektets granskade underlag.'),
  ('customer_portal', 'Bynex Pärmen',
   'Granskad projekttidslinje, byggdagbok, dokument och godkännanden.'),
  ('assets', 'Bynex Maskiner',
   'QR-koder, utlåning, placering, service och återlämning.'),
  ('property', 'Bynex Fastighet',
   'Fastigheter, service, drift, underhåll och byggnadens digitala minne.'),
  ('bookkeeping', 'Bynex Bokföring',
   'Bokföring, leverantörsfakturor, moms och SIE-import eller export.')
) as catalogue(slug, name, description)
where module.slug = catalogue.slug
  and (
    module.name is distinct from catalogue.name
    or module.description is distinct from catalogue.description
  );

select pg_notify('pgrst', 'reload schema');

commit;
