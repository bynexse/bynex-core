begin;

create table public.organization_document_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  document_type text not null
    check (document_type in ('change_order','quote','invoice','contract')),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  style text not null default 'professional'
    check (style in ('professional','compact','detailed')),
  active boolean not null default true,
  default_template boolean not null default false,
  title_prefix text not null default '' check (char_length(title_prefix) <= 120),
  introduction_text text not null default '' check (char_length(introduction_text) <= 4000),
  legal_text text not null default '' check (char_length(legal_text) <= 12000),
  guarantee_text text not null default '' check (char_length(guarantee_text) <= 6000),
  footer_text text not null default '' check (char_length(footer_text) <= 4000),
  settings jsonb not null default jsonb_build_object(
    'show_price_breakdown', true,
    'show_assumptions', true,
    'show_exclusions', true,
    'show_customer_signature', true,
    'show_company_logo', true
  ),
  version integer not null default 1 check (version >= 1),
  created_by_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  updated_by_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id)
);

create unique index organization_document_templates_default_idx
  on public.organization_document_templates(organization_id,document_type)
  where active and default_template;

create index organization_document_templates_lookup_idx
  on public.organization_document_templates(
    organization_id,document_type,active,updated_at desc
  );

create trigger organization_document_templates_set_updated_at
before update on public.organization_document_templates
for each row execute function public.set_updated_at();

alter table public.organization_document_templates enable row level security;
alter table public.organization_document_templates force row level security;

create policy organization_document_templates_select
on public.organization_document_templates
for select to authenticated
using (
  private.has_organization_role(
    organization_id,
    array[
      'owner','admin','office','hr','payroll','manager','supervisor',
      'employee','contractor'
    ]::text[],
    (select auth.uid())
  )
);

create policy organization_document_templates_insert
on public.organization_document_templates
for insert to authenticated
with check (
  created_by_user_id = (select auth.uid())
  and updated_by_user_id = (select auth.uid())
  and private.has_organization_role(
    organization_id,
    array['owner','admin']::text[],
    (select auth.uid())
  )
);

create policy organization_document_templates_update
on public.organization_document_templates
for update to authenticated
using (
  private.has_organization_role(
    organization_id,
    array['owner','admin']::text[],
    (select auth.uid())
  )
)
with check (
  updated_by_user_id = (select auth.uid())
  and private.has_organization_role(
    organization_id,
    array['owner','admin']::text[],
    (select auth.uid())
  )
);

revoke all on public.organization_document_templates from public,anon;
grant select,insert,update on public.organization_document_templates to authenticated;

insert into public.organization_document_templates (
  organization_id,
  document_type,
  name,
  style,
  default_template,
  title_prefix,
  introduction_text,
  legal_text,
  guarantee_text,
  footer_text,
  settings,
  created_by_user_id,
  updated_by_user_id
)
select
  organization.id,
  template.document_type,
  template.name,
  'professional',
  true,
  template.title_prefix,
  template.introduction_text,
  '',
  '',
  '',
  template.settings,
  owner_member.user_id,
  owner_member.user_id
from public.organizations organization
join lateral (
  select member.user_id
  from public.organization_members member
  where member.organization_id = organization.id
    and member.active
    and member.role in ('owner','admin')
  order by case member.role when 'owner' then 0 else 1 end, member.joined_at
  limit 1
) owner_member on true
cross join lateral (
  values
    (
      'change_order'::text,
      'Bynex ÄTA – professionell',
      'ÄTA',
      'Detta dokument beskriver ändringen, omfattningen, priset och vilka förutsättningar som gäller.',
      jsonb_build_object(
        'show_price_breakdown', true,
        'show_assumptions', true,
        'show_exclusions', true,
        'show_customer_signature', true,
        'show_company_logo', true,
        'show_estimated_price_label', true
      )
    ),
    (
      'quote'::text,
      'Bynex Offert – professionell',
      'Offert',
      'Tack för förfrågan. Offerten sammanfattar omfattning, pris, tid och förutsättningar.',
      jsonb_build_object(
        'show_price_breakdown', true,
        'show_assumptions', true,
        'show_exclusions', true,
        'show_customer_signature', true,
        'show_company_logo', true
      )
    ),
    (
      'invoice'::text,
      'Bynex Faktura – professionell',
      'Faktura',
      '',
      jsonb_build_object(
        'show_price_breakdown', true,
        'show_customer_signature', false,
        'show_company_logo', true,
        'show_payment_details', true,
        'show_guarantee_text', false
      )
    ),
    (
      'contract'::text,
      'Bynex Avtal – professionell',
      'Avtal',
      'Avtalet sammanfattar parternas överenskommelse, omfattning, pris och övriga villkor.',
      jsonb_build_object(
        'show_price_breakdown', true,
        'show_customer_signature', true,
        'show_company_logo', true,
        'show_legal_text', true
      )
    )
) as template(
  document_type,name,title_prefix,introduction_text,settings
)
where organization.status <> 'deleted'
on conflict do nothing;

select pg_notify('pgrst','reload schema');

commit;
