begin;

create table public.change_order_workflow_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  allow_onsite_price_pending_start boolean not null default true,
  require_customer_start_signature boolean not null default true,
  allow_contract_preapproval boolean not null default true,
  allow_emergency_start boolean not null default false,
  price_review_sla_hours integer not null default 4
    check (price_review_sla_hours between 1 and 168),
  require_final_price_before_invoice boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id),
  unique (organization_id,id)
);

insert into public.change_order_workflow_settings(organization_id)
select id from public.organizations
on conflict (organization_id) do nothing;

create or replace function private.provision_change_order_workflow_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.change_order_workflow_settings(organization_id)
  values (new.id)
  on conflict (organization_id) do nothing;
  return new;
end;
$$;

revoke all on function private.provision_change_order_workflow_settings()
  from public,anon,authenticated;
create trigger provision_change_order_workflow_settings
  after insert on public.organizations
  for each row execute function private.provision_change_order_workflow_settings();

create table public.change_order_start_authorizations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  change_order_id uuid not null,
  project_id uuid not null,
  intake_id uuid,
  started_by_worker_id uuid,
  authorization_method text not null
    check (authorization_method in (
      'onsite_customer','secure_link','contract_preapproval','emergency'
    )),
  scope_text text not null check (char_length(btrim(scope_text)) between 3 and 5000),
  pricing_status text not null default 'pending_calculation'
    check (pricing_status in ('pending_calculation','preagreed_rates')),
  price_notice text not null check (char_length(btrim(price_notice)) between 40 and 1000),
  authorization_statement text not null
    check (char_length(btrim(authorization_statement)) between 40 and 1000),
  customer_accepted_price_pending boolean not null default true
    check (customer_accepted_price_pending),
  signer_name text,
  signer_email text,
  customer_signature_hash text,
  contract_reference text,
  emergency_reason text,
  scope_content_hash text not null,
  authorized_at timestamptz not null default now(),
  authorized_by_user_id uuid references auth.users(id) on delete set null,
  ip_hash text,
  user_agent text,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,id,change_order_id),
  foreign key (organization_id,change_order_id,project_id)
    references public.change_orders(organization_id,id,project_id) on delete cascade,
  foreign key (organization_id,intake_id,change_order_id)
    references public.change_order_intakes(organization_id,id,change_order_id)
    on delete set null (intake_id),
  foreign key (organization_id,started_by_worker_id)
    references public.workers(organization_id,id) on delete set null (started_by_worker_id),
  check (
    (
      authorization_method in ('onsite_customer','secure_link')
      and signer_name is not null
      and customer_signature_hash is not null
      and contract_reference is null
      and emergency_reason is null
    )
    or (
      authorization_method = 'contract_preapproval'
      and contract_reference is not null
      and emergency_reason is null
    )
    or (
      authorization_method = 'emergency'
      and emergency_reason is not null
    )
  )
);

create table public.change_order_price_followups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  change_order_id uuid not null,
  start_authorization_id uuid not null,
  status text not null default 'queued'
    check (status in ('queued','calculating','ready_for_review','sent_to_customer','closed','cancelled')),
  priority text not null default 'high'
    check (priority in ('normal','high','urgent')),
  due_at timestamptz not null,
  assigned_to_user_id uuid references auth.users(id) on delete set null,
  started_at timestamptz,
  ready_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  foreign key (organization_id,change_order_id)
    references public.change_orders(organization_id,id) on delete cascade,
  foreign key (organization_id,start_authorization_id,change_order_id)
    references public.change_order_start_authorizations(organization_id,id,change_order_id)
    on delete cascade
);

create unique index change_order_price_followups_one_open
  on public.change_order_price_followups(organization_id,change_order_id)
  where status in ('queued','calculating','ready_for_review','sent_to_customer');
create index change_order_price_followups_due_idx
  on public.change_order_price_followups(organization_id,status,due_at)
  where status in ('queued','calculating','ready_for_review','sent_to_customer');

alter table public.change_orders
  add column price_status text not null default 'not_calculated',
  add column start_authorization_id uuid,
  add column work_started_at timestamptz,
  add column work_started_by_worker_id uuid,
  add column price_followup_due_at timestamptz,
  add column price_calculated_at timestamptz;

alter table public.change_orders
  add constraint change_orders_price_status_check
    check (price_status in (
      'not_calculated','pending_calculation','reviewed','customer_approved','not_required'
    )),
  add constraint change_orders_start_authorization_tenant_fkey
    foreign key (organization_id,start_authorization_id)
      references public.change_order_start_authorizations(organization_id,id) on delete restrict,
  add constraint change_orders_started_worker_tenant_fkey
    foreign key (organization_id,work_started_by_worker_id)
      references public.workers(organization_id,id) on delete set null (work_started_by_worker_id),
  add constraint change_orders_work_start_fields_check
    check (
      (work_started_at is null and start_authorization_id is null and work_started_by_worker_id is null)
      or (work_started_at is not null and start_authorization_id is not null)
    );

create or replace function private.guard_change_order_start_authorization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'ÄTA start authorization is immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_change_order_start_authorization()
  from public,anon,authenticated;
create trigger guard_change_order_start_authorization
  before update on public.change_order_start_authorizations
  for each row execute function private.guard_change_order_start_authorization();

create or replace function private.guard_change_order_start_reference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.start_authorization_id is not null and (
    new.start_authorization_id is distinct from old.start_authorization_id
    or new.work_started_at is distinct from old.work_started_at
    or new.work_started_by_worker_id is distinct from old.work_started_by_worker_id
  ) then
    raise exception 'Recorded ÄTA work start cannot be replaced'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_change_order_start_reference()
  from public,anon,authenticated;
create trigger guard_change_order_start_reference
  before update on public.change_orders
  for each row execute function private.guard_change_order_start_reference();

create or replace function private.enforce_change_order_work_gate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  has_final_price_approval boolean;
  has_valid_start_authorization boolean;
  invoice_requires_final_price boolean := true;
begin
  select exists (
    select 1
    from public.change_order_versions v
    join public.change_order_customer_approvals a
      on a.organization_id = v.organization_id
     and a.change_order_version_id = v.id
     and a.decision = 'approved'
     and a.content_hash = v.content_hash
    where v.organization_id = new.organization_id
      and v.change_order_id = new.id
      and v.id = new.approved_version_id
      and v.status = 'approved'
      and v.frozen_at is not null
  ) into has_final_price_approval;

  select exists (
    select 1
    from public.change_order_start_authorizations a
    where a.organization_id = new.organization_id
      and a.change_order_id = new.id
      and a.id = new.start_authorization_id
      and a.customer_accepted_price_pending
      and a.authorized_at is not null
  ) into has_valid_start_authorization;

  select coalesce(s.require_final_price_before_invoice,true)
    into invoice_requires_final_price
  from public.change_order_workflow_settings s
  where s.organization_id = new.organization_id and s.active;

  if new.status = 'invoice_ready'
     and invoice_requires_final_price
     and not has_final_price_approval then
    raise exception 'Final customer price approval is required before invoicing'
      using errcode = '42501';
  end if;

  if new.status = 'approved' and not has_final_price_approval then
    raise exception 'Final customer price approval is required'
      using errcode = '42501';
  end if;

  if (
    new.status in ('in_progress','completed')
    or not new.work_start_blocked
  ) and not (has_final_price_approval or has_valid_start_authorization) then
    raise exception 'Customer start authorization or final approval is required'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_change_order_work_gate()
  from public,anon,authenticated;

create or replace function public.authorize_change_order_start_internal(
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_change_order_id uuid,
  p_intake_id uuid,
  p_started_by_worker_id uuid,
  p_method text,
  p_scope_text text,
  p_signer_name text,
  p_signer_email text,
  p_customer_signature_hash text,
  p_contract_reference text,
  p_emergency_reason text,
  p_ip_hash text,
  p_user_agent text,
  p_evidence jsonb default '{}'::jsonb
)
returns table (
  start_authorization_id uuid,
  price_followup_due_at timestamptz,
  price_notice text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_change record;
  selected_settings record;
  authorization_id uuid;
  followup_due timestamptz;
  notice_text constant text :=
    'Arbetet får starta innan slutligt pris är beräknat. Priset kommer att uppdateras när behörig personal har räknat på tid, material och övriga kostnader. Ändrad omfattning kräver ett nytt godkännande.';
  statement_text constant text :=
    'Jag godkänner att det beskrivna ÄTA-arbetet startar nu och förstår att slutligt pris beräknas och meddelas senare av behörig personal.';
  content_hash_value text;
  actor_is_management boolean;
begin
  select c.organization_id,c.project_id,c.status,c.start_authorization_id
    into selected_change
  from public.change_orders c
  where c.organization_id = p_organization_id and c.id = p_change_order_id
  for update;
  if selected_change.organization_id is null then
    raise exception 'ÄTA not found' using errcode = 'P0002';
  end if;
  if selected_change.start_authorization_id is not null then
    raise exception 'ÄTA work has already been started' using errcode = '23505';
  end if;

  select * into selected_settings
  from public.change_order_workflow_settings s
  where s.organization_id = p_organization_id and s.active;
  if selected_settings.id is null
     or not selected_settings.allow_onsite_price_pending_start then
    raise exception 'Price-pending work start is disabled' using errcode = '42501';
  end if;

  actor_is_management := private.has_organization_role(
    p_organization_id,
    array['owner','admin','office','manager','supervisor']::text[],
    p_actor_user_id
  );
  if not private.can_work_on_project(
    p_organization_id,selected_change.project_id,p_actor_user_id
  ) then
    raise exception 'User is not assigned to the project' using errcode = '42501';
  end if;
  if p_started_by_worker_id is not null
     and not (
       private.is_own_worker(
         p_organization_id,p_started_by_worker_id,p_actor_user_id
       )
       or actor_is_management
     ) then
    raise exception 'Invalid starting worker' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_scope_text,''))) not between 3 and 5000 then
    raise exception 'ÄTA scope is required' using errcode = '22023';
  end if;
  if p_intake_id is not null and not exists (
    select 1 from public.change_order_intakes i
    where i.organization_id = p_organization_id
      and i.change_order_id = p_change_order_id
      and i.id = p_intake_id
  ) then
    raise exception 'ÄTA intake not found' using errcode = '22023';
  end if;

  if p_method in ('onsite_customer','secure_link') then
    if selected_settings.require_customer_start_signature
       and (
         char_length(btrim(coalesce(p_signer_name,''))) < 2
         or char_length(coalesce(p_customer_signature_hash,'')) < 32
       ) then
      raise exception 'Customer start signature is required' using errcode = '22023';
    end if;
  elsif p_method = 'contract_preapproval' then
    if not selected_settings.allow_contract_preapproval
       or not actor_is_management
       or char_length(btrim(coalesce(p_contract_reference,''))) < 3 then
      raise exception 'Valid contract preapproval is required' using errcode = '42501';
    end if;
  elsif p_method = 'emergency' then
    if not selected_settings.allow_emergency_start
       or not actor_is_management
       or char_length(btrim(coalesce(p_emergency_reason,''))) < 10 then
      raise exception 'Emergency start is not allowed' using errcode = '42501';
    end if;
  else
    raise exception 'Unknown start authorization method' using errcode = '22023';
  end if;

  followup_due := now() + make_interval(hours => selected_settings.price_review_sla_hours);
  content_hash_value := encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'change_order_id',p_change_order_id,
          'scope',btrim(p_scope_text),
          'method',p_method,
          'price_notice',notice_text,
          'statement',statement_text,
          'signer_name',nullif(btrim(p_signer_name),''),
          'contract_reference',nullif(btrim(p_contract_reference),''),
          'emergency_reason',nullif(btrim(p_emergency_reason),'')
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  insert into public.change_order_start_authorizations(
    organization_id,change_order_id,project_id,intake_id,started_by_worker_id,
    authorization_method,scope_text,pricing_status,price_notice,
    authorization_statement,signer_name,signer_email,customer_signature_hash,
    contract_reference,emergency_reason,scope_content_hash,authorized_by_user_id,
    ip_hash,user_agent,evidence
  ) values (
    p_organization_id,p_change_order_id,selected_change.project_id,p_intake_id,
    p_started_by_worker_id,p_method,btrim(p_scope_text),
    case when p_method='contract_preapproval' then 'preagreed_rates'
      else 'pending_calculation' end,
    notice_text,statement_text,nullif(left(btrim(p_signer_name),160),''),
    nullif(left(lower(btrim(p_signer_email)),320),''),
    nullif(left(p_customer_signature_hash,256),''),
    nullif(left(btrim(p_contract_reference),500),''),
    nullif(left(btrim(p_emergency_reason),2000),''),
    content_hash_value,p_actor_user_id,left(p_ip_hash,128),left(p_user_agent,500),
    coalesce(p_evidence,'{}'::jsonb)
  ) returning id into authorization_id;

  update public.change_orders
  set start_authorization_id = authorization_id,
      work_started_at = now(),
      work_started_by_worker_id = p_started_by_worker_id,
      price_status = 'pending_calculation',
      price_followup_due_at = followup_due,
      status = 'in_progress',
      work_start_blocked = false,
      updated_at = now()
  where organization_id = p_organization_id and id = p_change_order_id;

  insert into public.change_order_price_followups(
    organization_id,change_order_id,start_authorization_id,priority,due_at
  ) values (
    p_organization_id,p_change_order_id,authorization_id,'high',followup_due
  );

  insert into public.change_order_events(
    organization_id,change_order_id,event_type,actor_user_id,actor_kind,detail
  ) values (
    p_organization_id,p_change_order_id,'work_started',p_actor_user_id,'user',
    jsonb_build_object(
      'start_authorization_id',authorization_id,
      'method',p_method,
      'price_status','pending_calculation',
      'price_followup_due_at',followup_due
    )
  );

  return query select authorization_id,followup_due,notice_text;
end;
$$;

revoke all on function public.authorize_change_order_start_internal(
  uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,jsonb
) from public,anon,authenticated;
grant execute on function public.authorize_change_order_start_internal(
  uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,jsonb
) to service_role;

create or replace function private.sync_change_order_price_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.requires_human_review and not new.requires_human_review
     and new.human_reviewed_at is not null then
    update public.change_orders
    set price_status = case
          when price_status = 'customer_approved' then price_status
          else 'reviewed'
        end,
        price_calculated_at = new.human_reviewed_at,
        current_version_id = new.id,
        updated_at = now()
    where organization_id = new.organization_id
      and id = new.change_order_id;

    update public.change_order_price_followups
    set status = 'ready_for_review',
        ready_at = now(),
        updated_at = now()
    where organization_id = new.organization_id
      and change_order_id = new.change_order_id
      and status in ('queued','calculating');
  end if;
  return new;
end;
$$;

revoke all on function private.sync_change_order_price_review()
  from public,anon,authenticated;
create trigger sync_change_order_price_review
  after update of requires_human_review,human_reviewed_at
  on public.change_order_versions
  for each row execute function private.sync_change_order_price_review();

create or replace function private.sync_change_order_final_price_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.decision = 'approved' then
    update public.change_orders
    set price_status = 'customer_approved',updated_at = now()
    where organization_id = new.organization_id and id = new.change_order_id;

    update public.change_order_price_followups
    set status = 'closed',closed_at = now(),updated_at = now()
    where organization_id = new.organization_id
      and change_order_id = new.change_order_id
      and status in ('queued','calculating','ready_for_review','sent_to_customer');
  end if;
  return new;
end;
$$;

revoke all on function private.sync_change_order_final_price_approval()
  from public,anon,authenticated;
create trigger sync_change_order_final_price_approval
  after insert on public.change_order_customer_approvals
  for each row execute function private.sync_change_order_final_price_approval();

create or replace function private.preserve_started_change_order_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'in_progress'
     and new.status = 'approved'
     and old.work_started_at is not null then
    new.status := 'in_progress';
  end if;
  return new;
end;
$$;

revoke all on function private.preserve_started_change_order_status()
  from public,anon,authenticated;
create trigger preserve_started_change_order_status
  before update of status on public.change_orders
  for each row execute function private.preserve_started_change_order_status();

do $$
declare t text;
begin
  foreach t in array array[
    'change_order_workflow_settings','change_order_start_authorizations',
    'change_order_price_followups'
  ]
  loop
    execute format('alter table public.%I enable row level security',t);
    execute format('alter table public.%I force row level security',t);
  end loop;
end $$;

create policy change_order_workflow_settings_member_select
  on public.change_order_workflow_settings for select to authenticated
  using (private.is_organization_member(organization_id,(select auth.uid())));
create policy change_order_workflow_settings_management_update
  on public.change_order_workflow_settings for update to authenticated
  using (private.has_organization_role(
    organization_id,array['owner','admin','office']::text[],(select auth.uid())
  ))
  with check (private.has_organization_role(
    organization_id,array['owner','admin','office']::text[],(select auth.uid())
  ));

create policy change_order_start_authorizations_access_select
  on public.change_order_start_authorizations for select to authenticated
  using (
    private.has_organization_role(
      organization_id,array['owner','admin','office','manager','supervisor']::text[],(select auth.uid())
    )
    or (
      started_by_worker_id is not null
      and private.is_own_worker(
        organization_id,started_by_worker_id,(select auth.uid())
      )
    )
  );

create policy change_order_price_followups_management_select
  on public.change_order_price_followups for select to authenticated
  using (private.has_organization_role(
    organization_id,array['owner','admin','office','manager','supervisor']::text[],(select auth.uid())
  ));
create policy change_order_price_followups_management_update
  on public.change_order_price_followups for update to authenticated
  using (private.has_organization_role(
    organization_id,array['owner','admin','office','manager']::text[],(select auth.uid())
  ))
  with check (private.has_organization_role(
    organization_id,array['owner','admin','office','manager']::text[],(select auth.uid())
  ));

revoke all on public.change_order_workflow_settings,
  public.change_order_start_authorizations,public.change_order_price_followups
from anon,authenticated;
grant select,update on public.change_order_workflow_settings to authenticated;
grant select on public.change_order_start_authorizations to authenticated;
grant select,update on public.change_order_price_followups to authenticated;

create trigger set_updated_at
  before update on public.change_order_workflow_settings
  for each row execute function public.set_updated_at();
create trigger set_updated_at
  before update on public.change_order_price_followups
  for each row execute function public.set_updated_at();

create trigger write_audit_log
  after insert or update or delete on public.change_order_workflow_settings
  for each row execute function private.write_audit_log();
create trigger write_audit_log
  after insert or update or delete on public.change_order_start_authorizations
  for each row execute function private.write_audit_log();
create trigger write_audit_log
  after insert or update or delete on public.change_order_price_followups
  for each row execute function private.write_audit_log();

do $$
declare fk record;
begin
  for fk in
    select n.nspname schema_name,t.relname table_name,c.conname constraint_name,
      string_agg(format('%I',a.attname),', ' order by k.ordinality) columns_sql
    from pg_constraint c
    join pg_class t on t.oid=c.conrelid
    join pg_namespace n on n.oid=t.relnamespace
    cross join lateral unnest(c.conkey) with ordinality k(attnum,ordinality)
    join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum
    where c.contype='f' and n.nspname='public'
      and t.relname in (
        'change_orders','change_order_workflow_settings',
        'change_order_start_authorizations','change_order_price_followups'
      )
      and not exists (
        select 1 from pg_index i
        where i.indrelid=c.conrelid and i.indisvalid and i.indpred is null
          and i.indnkeyatts>=cardinality(c.conkey)
          and c.conkey=(
            select array_agg(i.indkey[p-1] order by p)::smallint[]
            from generate_series(1,cardinality(c.conkey)) p
          )
      )
    group by n.nspname,t.relname,c.conname,c.conrelid,c.conkey
  loop
    execute format(
      'create index if not exists %I on %I.%I (%s)',
      left('idx_fk_'||fk.table_name||'_'||substr(md5(fk.constraint_name),1,8),63),
      fk.schema_name,fk.table_name,fk.columns_sql
    );
  end loop;
end $$;

commit;
