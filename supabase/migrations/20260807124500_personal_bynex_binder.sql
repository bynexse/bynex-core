begin;

alter table public.properties
  add column if not exists property_designation text,
  add column if not exists construction_year integer,
  add column if not exists living_area_sqm numeric(12,2),
  add column if not exists plot_area_sqm numeric(14,2);

alter table public.properties
  drop constraint if exists properties_property_type_check;
alter table public.properties
  add constraint properties_property_type_check check (
    property_type in (
      'single_family','condominium','holiday_home','multi_family',
      'commercial','industrial','public','sports_facility','land',
      'infrastructure','other'
    )
  );

alter table public.properties
  drop constraint if exists properties_property_designation_check,
  drop constraint if exists properties_construction_year_check,
  drop constraint if exists properties_living_area_check,
  drop constraint if exists properties_plot_area_check;
alter table public.properties
  add constraint properties_property_designation_check check (
    property_designation is null
    or char_length(btrim(property_designation)) between 2 and 160
  ),
  add constraint properties_construction_year_check check (
    construction_year is null
    or construction_year between 1600 and 2200
  ),
  add constraint properties_living_area_check check (
    living_area_sqm is null
    or living_area_sqm between 0 and 100000
  ),
  add constraint properties_plot_area_check check (
    plot_area_sqm is null
    or plot_area_sqm between 0 and 100000000
  );

create table if not exists public.property_binder_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null,
  title text not null check (char_length(btrim(title)) between 2 and 240),
  category text not null check (category in (
    'purchase_contract','deed','association_document','inspection','drawing',
    'permit','energy_declaration','insurance','warranty','manual','receipt',
    'expense','craftsman_document','maintenance','property_photo','inventory',
    'tax_document','other'
  )),
  source_type text not null default 'owner' check (source_type in (
    'owner','craftsman','project_handover','bynex_smart','import'
  )),
  status text not null default 'pending_upload' check (status in (
    'pending_upload','active','archived'
  )),
  original_filename text not null check (char_length(original_filename) between 1 and 300),
  storage_bucket text not null default 'property-binder-documents'
    check (storage_bucket = 'property-binder-documents'),
  storage_path text not null,
  mime_type text not null check (char_length(mime_type) between 3 and 160),
  file_size_bytes bigint not null check (file_size_bytes between 1 and 26214400),
  document_date date,
  vendor_name text check (vendor_name is null or char_length(btrim(vendor_name)) between 2 and 200),
  amount_inc_vat numeric(14,2) check (amount_inc_vat is null or amount_inc_vat >= 0),
  warranty_expires_on date,
  notes text check (notes is null or char_length(notes) <= 4000),
  checksum_sha256 text check (checksum_sha256 is null or checksum_sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_by_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (storage_bucket, storage_path),
  constraint property_binder_documents_property_fk
    foreign key (organization_id, property_id)
    references public.properties(organization_id, id) on delete cascade,
  constraint property_binder_documents_storage_path_check check (
    storage_path = organization_id::text || '/' || property_id::text || '/' || id::text || '/' || original_filename
    and storage_path !~ '(^|/)\.\.(/|$)'
  )
);

create index if not exists property_binder_documents_property_idx
  on public.property_binder_documents (organization_id, property_id, category, document_date desc, created_at desc);

create table if not exists public.property_maintenance_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null,
  title text not null check (char_length(btrim(title)) between 2 and 240),
  category text not null check (category in (
    'roof','facade','windows','foundation','drainage','ground','heating',
    'ventilation','electrical','plumbing','bathroom','kitchen','interior',
    'fire_safety','appliance','association','documentation','other'
  )),
  description text check (description is null or char_length(description) <= 6000),
  status text not null default 'planned' check (status in (
    'planned','due','in_progress','completed','dismissed'
  )),
  priority text not null default 'normal' check (priority in ('low','normal','high','critical')),
  due_on date,
  recurrence_months integer check (recurrence_months is null or recurrence_months between 1 and 1200),
  estimated_cost_low numeric(14,2) check (estimated_cost_low is null or estimated_cost_low >= 0),
  estimated_cost_high numeric(14,2) check (
    estimated_cost_high is null
    or (estimated_cost_high >= 0 and estimated_cost_high >= coalesce(estimated_cost_low,0))
  ),
  source_type text not null default 'manual' check (source_type in (
    'manual','bynex_smart','document','photo','craftsman'
  )),
  source_document_id uuid,
  smart_reason text check (smart_reason is null or char_length(smart_reason) <= 4000),
  requires_review boolean not null default false,
  reviewed_by_user_id uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  completed_by_user_id uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  created_by_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  constraint property_maintenance_items_property_fk
    foreign key (organization_id, property_id)
    references public.properties(organization_id, id) on delete cascade,
  constraint property_maintenance_items_document_fk
    foreign key (organization_id, source_document_id)
    references public.property_binder_documents(organization_id, id) on delete set null,
  constraint property_maintenance_review_check check (
    (requires_review and reviewed_at is null and reviewed_by_user_id is null)
    or (not requires_review)
  )
);

create index if not exists property_maintenance_due_idx
  on public.property_maintenance_items (organization_id, property_id, status, due_on, priority);

create trigger property_binder_documents_touch_updated_at
before update on public.property_binder_documents
for each row execute function public.set_updated_at();

create trigger property_maintenance_items_touch_updated_at
before update on public.property_maintenance_items
for each row execute function public.set_updated_at();

alter table public.property_binder_documents enable row level security;
alter table public.property_binder_documents force row level security;
alter table public.property_maintenance_items enable row level security;
alter table public.property_maintenance_items force row level security;

create or replace function private.has_personal_binder_access(
  requested_organization_id uuid,
  requested_property_id uuid,
  requested_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select requested_user_id is not null
    and exists (
      select 1
      from public.organizations organization
      join public.organization_members member
        on member.organization_id = organization.id
       and member.user_id = requested_user_id
       and member.active
      join public.digital_binder_subscriptions subscription
        on subscription.organization_id = organization.id
       and subscription.property_id = requested_property_id
       and subscription.subscriber_user_id = requested_user_id
      where organization.id = requested_organization_id
        and organization.settings->>'workspace_kind' = 'personal_binder'
        and subscription.status in ('pending_activation','active','cancel_at_period_end')
        and subscription.starts_on <= current_date
        and (subscription.ends_on is null or subscription.ends_on >= current_date)
        and (
          subscription.status in ('active','cancel_at_period_end')
          or subscription.included_access_until is null
          or subscription.included_access_until >= now()
        )
    )
$$;

create or replace function private.can_access_property_binder(
  requested_organization_id uuid,
  requested_property_id uuid,
  requested_user_id uuid default auth.uid(),
  requested_write boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (
      select 1 from public.organizations organization
      where organization.id = requested_organization_id
        and organization.settings->>'workspace_kind' = 'personal_binder'
    ) then private.has_personal_binder_access(
      requested_organization_id, requested_property_id, requested_user_id
    )
    when requested_write then private.has_organization_role(
      requested_organization_id,
      array['owner','admin','office','manager']::text[],
      requested_user_id
    )
    else private.is_organization_member(requested_organization_id, requested_user_id)
  end
$$;

revoke all on function private.has_personal_binder_access(uuid, uuid, uuid) from public;
revoke all on function private.can_access_property_binder(uuid, uuid, uuid, boolean) from public;
grant execute on function private.has_personal_binder_access(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function private.can_access_property_binder(uuid, uuid, uuid, boolean) to authenticated, service_role;

drop policy if exists property_binder_documents_select on public.property_binder_documents;
create policy property_binder_documents_select
on public.property_binder_documents for select to authenticated
using ((select private.can_access_property_binder(
  organization_id, property_id, (select auth.uid()), false
)));

drop policy if exists property_binder_documents_insert on public.property_binder_documents;
create policy property_binder_documents_insert
on public.property_binder_documents for insert to authenticated
with check (
  uploaded_by_user_id = (select auth.uid())
  and (select private.can_access_property_binder(
    organization_id, property_id, (select auth.uid()), true
  ))
);

drop policy if exists property_binder_documents_update on public.property_binder_documents;
create policy property_binder_documents_update
on public.property_binder_documents for update to authenticated
using ((select private.can_access_property_binder(
  organization_id, property_id, (select auth.uid()), true
)))
with check ((select private.can_access_property_binder(
  organization_id, property_id, (select auth.uid()), true
)));

drop policy if exists property_binder_documents_delete on public.property_binder_documents;
create policy property_binder_documents_delete
on public.property_binder_documents for delete to authenticated
using ((select private.can_access_property_binder(
  organization_id, property_id, (select auth.uid()), true
)));

drop policy if exists property_maintenance_items_select on public.property_maintenance_items;
create policy property_maintenance_items_select
on public.property_maintenance_items for select to authenticated
using ((select private.can_access_property_binder(
  organization_id, property_id, (select auth.uid()), false
)));

drop policy if exists property_maintenance_items_insert on public.property_maintenance_items;
create policy property_maintenance_items_insert
on public.property_maintenance_items for insert to authenticated
with check (
  created_by_user_id = (select auth.uid())
  and (select private.can_access_property_binder(
    organization_id, property_id, (select auth.uid()), true
  ))
);

drop policy if exists property_maintenance_items_update on public.property_maintenance_items;
create policy property_maintenance_items_update
on public.property_maintenance_items for update to authenticated
using ((select private.can_access_property_binder(
  organization_id, property_id, (select auth.uid()), true
)))
with check ((select private.can_access_property_binder(
  organization_id, property_id, (select auth.uid()), true
)));

drop policy if exists property_maintenance_items_delete on public.property_maintenance_items;
create policy property_maintenance_items_delete
on public.property_maintenance_items for delete to authenticated
using ((select private.can_access_property_binder(
  organization_id, property_id, (select auth.uid()), true
)));

revoke all on public.property_binder_documents from anon, authenticated;
revoke all on public.property_maintenance_items from anon, authenticated;
grant select, insert, update, delete on public.property_binder_documents to authenticated;
grant select, insert, update, delete on public.property_maintenance_items to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values (
  'property-binder-documents',
  'property-binder-documents',
  false,
  26214400,
  array[
    'application/pdf','image/jpeg','image/png','image/webp','image/heic',
    'text/plain','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

create or replace function private.can_manage_property_binder_object(
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
  parts text[] := string_to_array(object_name,'/');
  organization_id uuid;
  property_id uuid;
begin
  if cardinality(parts) <> 4 or parts[4] in ('','.','..') then return false; end if;
  begin
    organization_id := parts[1]::uuid;
    property_id := parts[2]::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  return private.can_access_property_binder(
    organization_id, property_id, requested_user_id, true
  );
end;
$$;

revoke all on function private.can_manage_property_binder_object(text, uuid) from public;
grant execute on function private.can_manage_property_binder_object(text, uuid) to authenticated, service_role;

drop policy if exists property_binder_storage_select on storage.objects;
create policy property_binder_storage_select on storage.objects
for select to authenticated
using (
  bucket_id='property-binder-documents'
  and (select private.can_manage_property_binder_object(name,(select auth.uid())))
);

drop policy if exists property_binder_storage_insert on storage.objects;
create policy property_binder_storage_insert on storage.objects
for insert to authenticated
with check (
  bucket_id='property-binder-documents'
  and (select private.can_manage_property_binder_object(name,(select auth.uid())))
);

drop policy if exists property_binder_storage_update on storage.objects;
create policy property_binder_storage_update on storage.objects
for update to authenticated
using (
  bucket_id='property-binder-documents'
  and (select private.can_manage_property_binder_object(name,(select auth.uid())))
)
with check (
  bucket_id='property-binder-documents'
  and (select private.can_manage_property_binder_object(name,(select auth.uid())))
);

drop policy if exists property_binder_storage_delete on storage.objects;
create policy property_binder_storage_delete on storage.objects
for delete to authenticated
using (
  bucket_id='property-binder-documents'
  and (select private.can_manage_property_binder_object(name,(select auth.uid())))
);

create or replace function public.provision_personal_bynex_binder(
  p_property_name text,
  p_property_designation text,
  p_property_type text,
  p_address text,
  p_postal_code text,
  p_city text,
  p_construction_year integer default null,
  p_living_area_sqm numeric default null,
  p_plot_area_sqm numeric default null,
  p_billing_interval text default 'annual',
  p_confirmation_text text default 'Jag startar 14 dagars kostnadsfri provperiod och har tagit del av villkoren.'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  profile_record record;
  existing_record record;
  new_organization_id uuid;
  new_property_id uuid := gen_random_uuid();
  new_subscription_id uuid;
  billing_profile_id uuid;
  price_inc integer;
  price_ex integer;
  vat integer;
  trial_ends_at timestamptz := now() + interval '14 days';
  internal_property_number text;
begin
  if current_user_id is null then
    raise exception 'Inloggning krävs' using errcode='42501';
  end if;

  select profile.id,profile.full_name,lower(auth_user.email) email
  into profile_record
  from public.profiles profile
  join auth.users auth_user on auth_user.id=profile.user_id
  where profile.user_id=current_user_id
    and auth_user.email_confirmed_at is not null;

  if profile_record.id is null then
    raise exception 'Verifierad e-post krävs' using errcode='42501';
  end if;

  select organization.id organization_id,property.id property_id,subscription.id subscription_id
  into existing_record
  from public.organization_members member
  join public.organizations organization on organization.id=member.organization_id
  join public.properties property on property.organization_id=organization.id
  join public.digital_binder_subscriptions subscription
    on subscription.organization_id=organization.id
   and subscription.property_id=property.id
   and subscription.subscriber_user_id=current_user_id
  where member.user_id=current_user_id
    and member.active
    and organization.settings->>'workspace_kind'='personal_binder'
    and subscription.status in ('pending_activation','active','cancel_at_period_end')
  order by subscription.created_at
  limit 1;

  if existing_record.organization_id is not null then
    update public.profiles
    set current_organization_id=existing_record.organization_id,updated_at=now()
    where id=profile_record.id;
    return jsonb_build_object(
      'organizationId',existing_record.organization_id,
      'propertyId',existing_record.property_id,
      'subscriptionId',existing_record.subscription_id,
      'existing',true
    );
  end if;

  if char_length(btrim(coalesce(p_property_name,''))) not between 2 and 160
     or char_length(btrim(coalesce(p_property_designation,''))) not between 2 and 160
     or char_length(btrim(coalesce(p_address,''))) not between 2 and 200
     or char_length(btrim(coalesce(p_postal_code,''))) not between 3 and 20
     or char_length(btrim(coalesce(p_city,''))) not between 2 and 120 then
    raise exception 'Kontrollera fastighetens namn, beteckning och adress' using errcode='22023';
  end if;

  if p_property_type not in ('single_family','condominium','holiday_home','land') then
    raise exception 'Välj villa, bostadsrätt, fritidshus eller tomt' using errcode='22023';
  end if;
  if p_billing_interval not in ('monthly','annual') then
    raise exception 'Välj månads- eller årsbetalning' using errcode='22023';
  end if;
  if p_construction_year is not null and p_construction_year not between 1600 and 2200 then
    raise exception 'Byggåret är ogiltigt' using errcode='22023';
  end if;
  if p_living_area_sqm is not null and p_living_area_sqm not between 0 and 100000 then
    raise exception 'Boarean är ogiltig' using errcode='22023';
  end if;
  if p_plot_area_sqm is not null and p_plot_area_sqm not between 0 and 100000000 then
    raise exception 'Tomtarean är ogiltig' using errcode='22023';
  end if;
  if char_length(btrim(coalesce(p_confirmation_text,''))) not between 10 and 1000 then
    raise exception 'Villkorsbekräftelse krävs' using errcode='22023';
  end if;

  select case p_billing_interval when 'monthly' then 1900 else 19000 end,
         case p_billing_interval when 'monthly' then 1520 else 15200 end,
         case p_billing_interval when 'monthly' then 380 else 3800 end
  into price_inc,price_ex,vat;

  insert into public.organizations(name,status,business_form,created_by_user_id,settings)
  values(
    'Bynex Pärmen – '||btrim(p_property_name),
    'active','other',current_user_id,
    jsonb_build_object(
      'workspace_kind','personal_binder',
      'trial_days',14,
      'trial_ends_at',trial_ends_at,
      'personal_binder',true
    )
  ) returning id into new_organization_id;

  insert into public.organization_members(organization_id,profile_id,user_id,role,active)
  values(new_organization_id,profile_record.id,current_user_id,'owner',true);

  internal_property_number := 'PARM-' || upper(substr(replace(new_property_id::text,'-',''),1,8));
  insert into public.properties(
    id,organization_id,property_number,name,property_type,status,address,postal_code,city,
    property_designation,construction_year,living_area_sqm,plot_area_sqm,created_by_user_id
  ) values(
    new_property_id,new_organization_id,internal_property_number,btrim(p_property_name),
    p_property_type,'active',btrim(p_address),btrim(p_postal_code),btrim(p_city),
    upper(btrim(p_property_designation)),p_construction_year,p_living_area_sqm,p_plot_area_sqm,
    current_user_id
  );

  insert into public.digital_binder_billing_profiles(
    user_id,full_name,billing_email,address_line1,postal_code,city,country_code
  ) values(
    current_user_id,profile_record.full_name,profile_record.email,
    btrim(p_address),btrim(p_postal_code),btrim(p_city),'SE'
  )
  on conflict (user_id) do update set
    full_name=excluded.full_name,
    billing_email=excluded.billing_email,
    address_line1=excluded.address_line1,
    postal_code=excluded.postal_code,
    city=excluded.city,
    updated_at=now()
  returning id into billing_profile_id;

  insert into public.digital_binder_subscriptions(
    organization_id,property_id,subscriber_user_id,billing_profile_id,billing_interval,
    price_inc_vat_minor,price_ex_vat_minor,vat_minor,status,included_access_until,
    starts_on,next_billing_on,terms_version,confirmation_text,opted_in_at
  ) values(
    new_organization_id,new_property_id,current_user_id,billing_profile_id,p_billing_interval,
    price_inc,price_ex,vat,'pending_activation',trial_ends_at,
    current_date,current_date+14,'personal-binder-2026-08-07',btrim(p_confirmation_text),now()
  ) returning id into new_subscription_id;

  insert into public.digital_binder_subscription_events(
    subscription_id,subscriber_user_id,event_type,metadata
  ) values(
    new_subscription_id,current_user_id,'opted_in',
    jsonb_build_object('trial_days',14,'trial_ends_at',trial_ends_at,'workspace_kind','personal_binder')
  );

  update public.profiles
  set current_organization_id=new_organization_id,updated_at=now()
  where id=profile_record.id;

  return jsonb_build_object(
    'organizationId',new_organization_id,
    'propertyId',new_property_id,
    'subscriptionId',new_subscription_id,
    'trialEndsAt',trial_ends_at,
    'billingInterval',p_billing_interval,
    'existing',false
  );
end;
$$;

revoke all on function public.provision_personal_bynex_binder(
  text,text,text,text,text,text,integer,numeric,numeric,text,text
) from public,anon;
grant execute on function public.provision_personal_bynex_binder(
  text,text,text,text,text,text,integer,numeric,numeric,text,text
) to authenticated,service_role;

comment on function public.provision_personal_bynex_binder(
  text,text,text,text,text,text,integer,numeric,numeric,text,text
) is 'Creates a tenant-isolated personal Bynex Binder with a 14-day trial and deferred monthly or annual billing.';

select pg_notify('pgrst','reload schema');

commit;
