begin;

create table if not exists public.platform_recovery_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_code text not null unique default (
    'BY-REC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))
  ),
  captured_by_user_id uuid not null references auth.users(id) on delete restrict,
  release_info jsonb not null default '{}'::jsonb
    check (
      jsonb_typeof(release_info) = 'object'
      and octet_length(release_info::text) <= 6000
    ),
  database_inventory jsonb not null
    check (
      jsonb_typeof(database_inventory) = 'object'
      and octet_length(database_inventory::text) <= 30000
    ),
  storage_inventory jsonb not null
    check (
      jsonb_typeof(storage_inventory) = 'object'
      and octet_length(storage_inventory::text) <= 30000
    ),
  configuration_inventory jsonb not null
    check (
      jsonb_typeof(configuration_inventory) = 'object'
      and octet_length(configuration_inventory::text) <= 30000
    ),
  snapshot_sha256 text not null check (snapshot_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now()
);

create index if not exists platform_recovery_snapshots_created_idx
  on public.platform_recovery_snapshots(created_at desc);

create table if not exists public.platform_recovery_drills (
  id uuid primary key default gen_random_uuid(),
  drill_code text not null unique default (
    'BY-DRILL-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
  ),
  source_snapshot_id uuid not null references public.platform_recovery_snapshots(id) on delete restrict,
  target_kind text not null
    check (target_kind in ('local_restore','staging_clone','new_project_restore')),
  objective text not null check (char_length(objective) between 5 and 1000),
  status text not null default 'planned'
    check (status in ('planned','in_progress','verified','failed','cancelled')),
  planned_for timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  initiated_by_user_id uuid not null references auth.users(id) on delete restrict,
  verified_by_user_id uuid references auth.users(id) on delete set null,
  verification_result jsonb not null default '{}'::jsonb
    check (
      jsonb_typeof(verification_result) = 'object'
      and octet_length(verification_result::text) <= 20000
    ),
  notes text check (notes is null or char_length(notes) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (started_at is null or started_at >= created_at),
  check (completed_at is null or started_at is not null),
  check (completed_at is null or completed_at >= started_at),
  check (status <> 'verified' or (completed_at is not null and verified_by_user_id is not null)),
  check (status not in ('failed','cancelled') or completed_at is not null)
);

create index if not exists platform_recovery_drills_status_created_idx
  on public.platform_recovery_drills(status, created_at desc);
create index if not exists platform_recovery_drills_snapshot_idx
  on public.platform_recovery_drills(source_snapshot_id, created_at desc);

create table if not exists public.platform_recovery_events (
  id bigint generated always as identity primary key,
  snapshot_id uuid references public.platform_recovery_snapshots(id) on delete restrict,
  drill_id uuid references public.platform_recovery_drills(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null
    check (event_type in ('snapshot_captured','drill_created','drill_status_changed')),
  detail jsonb not null default '{}'::jsonb
    check (
      jsonb_typeof(detail) = 'object'
      and octet_length(detail::text) <= 12000
    ),
  created_at timestamptz not null default now(),
  check ((snapshot_id is null) <> (drill_id is null))
);

create index if not exists platform_recovery_events_snapshot_idx
  on public.platform_recovery_events(snapshot_id, created_at desc)
  where snapshot_id is not null;
create index if not exists platform_recovery_events_drill_idx
  on public.platform_recovery_events(drill_id, created_at desc)
  where drill_id is not null;

create or replace function private.reject_platform_recovery_immutable_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Platform recovery evidence is immutable' using errcode = '42501';
end;
$$;

create or replace function private.guard_platform_recovery_drill_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.platform_recovery_rpc', true), '0') <> '1' then
    raise exception 'Recovery drills must be changed through the controlled workflow'
      using errcode = '42501';
  end if;

  if new.id is distinct from old.id
    or new.drill_code is distinct from old.drill_code
    or new.source_snapshot_id is distinct from old.source_snapshot_id
    or new.target_kind is distinct from old.target_kind
    or new.objective is distinct from old.objective
    or new.planned_for is distinct from old.planned_for
    or new.initiated_by_user_id is distinct from old.initiated_by_user_id
    or new.created_at is distinct from old.created_at then
    raise exception 'Recovery drill identity fields are immutable' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.reject_platform_recovery_immutable_mutation()
  from public, anon, authenticated;
revoke all on function private.guard_platform_recovery_drill_mutation()
  from public, anon, authenticated;

alter table public.platform_recovery_snapshots enable row level security;
alter table public.platform_recovery_snapshots force row level security;
alter table public.platform_recovery_drills enable row level security;
alter table public.platform_recovery_drills force row level security;
alter table public.platform_recovery_events enable row level security;
alter table public.platform_recovery_events force row level security;

drop trigger if exists platform_recovery_snapshots_immutable on public.platform_recovery_snapshots;
create trigger platform_recovery_snapshots_immutable
  before update or delete on public.platform_recovery_snapshots
  for each row execute function private.reject_platform_recovery_immutable_mutation();

drop trigger if exists platform_recovery_events_immutable on public.platform_recovery_events;
create trigger platform_recovery_events_immutable
  before update or delete on public.platform_recovery_events
  for each row execute function private.reject_platform_recovery_immutable_mutation();

drop trigger if exists guard_platform_recovery_drill_mutation on public.platform_recovery_drills;
create trigger guard_platform_recovery_drill_mutation
  before update on public.platform_recovery_drills
  for each row execute function private.guard_platform_recovery_drill_mutation();

drop trigger if exists platform_recovery_drills_no_delete on public.platform_recovery_drills;
create trigger platform_recovery_drills_no_delete
  before delete on public.platform_recovery_drills
  for each row execute function private.reject_platform_recovery_immutable_mutation();

drop policy if exists platform_recovery_snapshots_staff_select on public.platform_recovery_snapshots;
create policy platform_recovery_snapshots_staff_select
  on public.platform_recovery_snapshots
  for select
  to authenticated
  using (
    private.is_platform_staff(
      array['platform_owner','platform_admin','sales','support','finance','read_only']::text[]
    )
  );

drop policy if exists platform_recovery_drills_staff_select on public.platform_recovery_drills;
create policy platform_recovery_drills_staff_select
  on public.platform_recovery_drills
  for select
  to authenticated
  using (
    private.is_platform_staff(
      array['platform_owner','platform_admin','sales','support','finance','read_only']::text[]
    )
  );

drop policy if exists platform_recovery_events_staff_select on public.platform_recovery_events;
create policy platform_recovery_events_staff_select
  on public.platform_recovery_events
  for select
  to authenticated
  using (
    private.is_platform_staff(
      array['platform_owner','platform_admin','sales','support','finance','read_only']::text[]
    )
  );

revoke all on public.platform_recovery_snapshots from public, anon, authenticated;
revoke all on public.platform_recovery_drills from public, anon, authenticated;
revoke all on public.platform_recovery_events from public, anon, authenticated;
grant select on public.platform_recovery_snapshots to authenticated;
grant select on public.platform_recovery_drills to authenticated;
grant select on public.platform_recovery_events to authenticated;

create or replace function public.capture_platform_recovery_snapshot(
  p_release_info jsonb default '{}'::jsonb
)
returns table(snapshot_id uuid, snapshot_code text, snapshot_sha256 text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := (select auth.uid());
  v_database_inventory jsonb;
  v_storage_inventory jsonb;
  v_configuration_inventory jsonb;
  v_content jsonb;
  v_hash text;
  v_snapshot_id uuid;
  v_snapshot_code text;
  v_cron_job_count bigint := 0;
begin
  if v_actor_user_id is null or not private.is_platform_staff(
    array['platform_owner','platform_admin','support']::text[]
  ) then
    raise exception 'Bynex platform administration is required' using errcode = '42501';
  end if;

  if p_release_info is null
    or jsonb_typeof(p_release_info) <> 'object'
    or octet_length(p_release_info::text) > 6000 then
    raise exception 'Release information is invalid' using errcode = '22023';
  end if;

  if to_regclass('cron.job') is not null then
    execute 'select count(*)::bigint from cron.job' into v_cron_job_count;
  end if;

  select jsonb_build_object(
    'capturedAt', statement_timestamp(),
    'schemaMigrations', jsonb_build_object(
      'count', (select count(*) from supabase_migrations.schema_migrations),
      'latest', coalesce((
        select jsonb_build_object('version', migration.version, 'name', migration.name)
        from supabase_migrations.schema_migrations migration
        order by migration.version desc
        limit 1
      ), '{}'::jsonb)
    ),
    'publicTables', jsonb_build_object(
      'total', (
        select count(*)
        from pg_class relation
        join pg_namespace namespace on namespace.oid = relation.relnamespace
        where namespace.nspname = 'public'
          and relation.relkind in ('r','p')
      ),
      'rlsEnabled', (
        select count(*)
        from pg_class relation
        join pg_namespace namespace on namespace.oid = relation.relnamespace
        where namespace.nspname = 'public'
          and relation.relkind in ('r','p')
          and relation.relrowsecurity
      ),
      'forcedRls', (
        select count(*)
        from pg_class relation
        join pg_namespace namespace on namespace.oid = relation.relnamespace
        where namespace.nspname = 'public'
          and relation.relkind in ('r','p')
          and relation.relforcerowsecurity
      )
    ),
    'criticalRowCounts', jsonb_build_object(
      'organizations', (select count(*) from public.organizations),
      'activeMemberships', (select count(*) from public.organization_members where active),
      'activeProjects', (select count(*) from public.projects where active),
      'customerInvoices', (select count(*) from public.customer_invoices),
      'supplierInvoices', (select count(*) from public.supplier_invoices),
      'bynexFiles', (select count(*) from public.bynex_files),
      'assetFiles', (select count(*) from public.asset_files),
      'emailDeliveries', (select count(*) from public.bynex_email_deliveries),
      'connectMessages', (select count(*) from public.messages),
      'pilotDiagnostics', (select count(*) from public.pilot_diagnostics)
    )
  ) into v_database_inventory;

  select jsonb_build_object(
    'bucketCount', count(*),
    'publicBucketCount', count(*) filter (where bucket.public),
    'privateBucketCount', count(*) filter (where not bucket.public),
    'objectCount', coalesce(sum(inventory.object_count), 0),
    'totalBytes', coalesce(sum(inventory.total_bytes), 0),
    'buckets', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'bucketId', bucket.id,
          'public', bucket.public,
          'fileSizeLimit', bucket.file_size_limit,
          'allowedMimeTypeCount', coalesce(cardinality(bucket.allowed_mime_types), 0),
          'objectCount', inventory.object_count,
          'totalBytes', inventory.total_bytes,
          'latestObjectAt', inventory.latest_object_at
        ) order by bucket.id
      ),
      '[]'::jsonb
    ),
    'objectNamesIncluded', false,
    'storageObjectsRequireSeparateRecovery', true
  ) into v_storage_inventory
  from storage.buckets bucket
  left join lateral (
    select
      count(*)::bigint as object_count,
      coalesce(sum(
        case
          when object.metadata ->> 'size' ~ '^[0-9]+$'
            then (object.metadata ->> 'size')::bigint
          else 0
        end
      ), 0)::bigint as total_bytes,
      max(object.created_at) as latest_object_at
    from storage.objects object
    where object.bucket_id = bucket.id
  ) inventory on true;

  select jsonb_build_object(
    'activeExtensions', coalesce((
      select jsonb_agg(
        jsonb_build_object('name', extension.extname, 'version', extension.extversion)
        order by extension.extname
      )
      from pg_extension extension
    ), '[]'::jsonb),
    'cronJobCount', v_cron_job_count,
    'realtimePublicationTableCount', (
      select count(*)
      from pg_publication_tables publication
      where publication.pubname = 'supabase_realtime'
    ),
    'providerBackupStatus', 'external_verification_required',
    'storageBackupStatus', 'separate_object_copy_required',
    'restoreExecutionAvailableInBynex', false,
    'restoreRequiresExplicitPlatformApproval', true
  ) into v_configuration_inventory;

  v_content := jsonb_build_object(
    'release', p_release_info,
    'database', v_database_inventory,
    'storage', v_storage_inventory,
    'configuration', v_configuration_inventory
  );
  v_hash := encode(
    extensions.digest(convert_to(v_content::text, 'UTF8'), 'sha256'),
    'hex'
  );

  insert into public.platform_recovery_snapshots(
    captured_by_user_id,
    release_info,
    database_inventory,
    storage_inventory,
    configuration_inventory,
    snapshot_sha256
  ) values (
    v_actor_user_id,
    p_release_info,
    v_database_inventory,
    v_storage_inventory,
    v_configuration_inventory,
    v_hash
  ) returning id, platform_recovery_snapshots.snapshot_code
    into v_snapshot_id, v_snapshot_code;

  insert into public.platform_recovery_events(
    snapshot_id,
    actor_user_id,
    event_type,
    detail
  ) values (
    v_snapshot_id,
    v_actor_user_id,
    'snapshot_captured',
    jsonb_build_object(
      'snapshot_code', v_snapshot_code,
      'snapshot_sha256', v_hash,
      'release_id', p_release_info ->> 'releaseId'
    )
  );

  insert into public.platform_admin_audit_events(
    staff_user_id,
    action,
    metadata
  ) values (
    v_actor_user_id,
    'platform_recovery_snapshot_captured',
    jsonb_build_object(
      'snapshot_id', v_snapshot_id,
      'snapshot_code', v_snapshot_code,
      'snapshot_sha256', v_hash
    )
  );

  return query select v_snapshot_id, v_snapshot_code, v_hash;
end;
$$;

create or replace function public.create_platform_recovery_drill(
  p_source_snapshot_id uuid,
  p_target_kind text,
  p_objective text,
  p_planned_for timestamptz default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := (select auth.uid());
  v_drill_id uuid;
  v_drill_code text;
  v_objective text := btrim(coalesce(p_objective, ''));
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
begin
  if v_actor_user_id is null or not private.is_platform_staff(
    array['platform_owner','platform_admin','support']::text[]
  ) then
    raise exception 'Bynex platform administration is required' using errcode = '42501';
  end if;

  if p_target_kind not in ('local_restore','staging_clone','new_project_restore')
    or char_length(v_objective) not between 5 and 1000
    or (v_notes is not null and char_length(v_notes) > 5000)
    or not exists (
      select 1 from public.platform_recovery_snapshots snapshot
      where snapshot.id = p_source_snapshot_id
    ) then
    raise exception 'Recovery drill input is invalid' using errcode = '22023';
  end if;

  insert into public.platform_recovery_drills(
    source_snapshot_id,
    target_kind,
    objective,
    planned_for,
    initiated_by_user_id,
    notes
  ) values (
    p_source_snapshot_id,
    p_target_kind,
    v_objective,
    p_planned_for,
    v_actor_user_id,
    v_notes
  ) returning id, drill_code into v_drill_id, v_drill_code;

  insert into public.platform_recovery_events(
    drill_id,
    actor_user_id,
    event_type,
    detail
  ) values (
    v_drill_id,
    v_actor_user_id,
    'drill_created',
    jsonb_build_object(
      'drill_code', v_drill_code,
      'source_snapshot_id', p_source_snapshot_id,
      'target_kind', p_target_kind
    )
  );

  insert into public.platform_admin_audit_events(
    staff_user_id,
    action,
    metadata
  ) values (
    v_actor_user_id,
    'platform_recovery_drill_created',
    jsonb_build_object(
      'drill_id', v_drill_id,
      'drill_code', v_drill_code,
      'source_snapshot_id', p_source_snapshot_id,
      'target_kind', p_target_kind
    )
  );

  return v_drill_id;
end;
$$;

create or replace function public.update_platform_recovery_drill(
  p_drill_id uuid,
  p_status text,
  p_verification_result jsonb default '{}'::jsonb,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := (select auth.uid());
  v_drill public.platform_recovery_drills;
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
begin
  if v_actor_user_id is null or not private.is_platform_staff(
    array['platform_owner','platform_admin','support']::text[]
  ) then
    raise exception 'Bynex platform administration is required' using errcode = '42501';
  end if;

  if p_status not in ('planned','in_progress','verified','failed','cancelled')
    or p_verification_result is null
    or jsonb_typeof(p_verification_result) <> 'object'
    or octet_length(p_verification_result::text) > 20000
    or (v_notes is not null and char_length(v_notes) > 5000) then
    raise exception 'Recovery drill update is invalid' using errcode = '22023';
  end if;

  select * into v_drill
  from public.platform_recovery_drills drill
  where drill.id = p_drill_id
  for update;

  if v_drill.id is null then
    raise exception 'Recovery drill not found' using errcode = 'P0002';
  end if;

  if v_drill.status in ('verified','cancelled') then
    raise exception 'Completed recovery drills are immutable' using errcode = '23514';
  end if;

  if v_drill.status = 'planned' and p_status not in ('planned','in_progress','cancelled') then
    raise exception 'A planned drill must start before it can complete' using errcode = '23514';
  end if;

  if v_drill.status = 'in_progress' and p_status not in ('in_progress','verified','failed','cancelled') then
    raise exception 'Invalid recovery drill transition' using errcode = '23514';
  end if;

  if v_drill.status = 'failed' and p_status not in ('failed','in_progress','cancelled') then
    raise exception 'A failed drill must be restarted before verification' using errcode = '23514';
  end if;

  if p_status in ('verified','failed') and p_verification_result = '{}'::jsonb then
    raise exception 'Completed drills require a verification result' using errcode = '22023';
  end if;

  perform set_config('app.platform_recovery_rpc', '1', true);
  update public.platform_recovery_drills
  set status = p_status,
      started_at = case
        when p_status in ('in_progress','verified','failed') then coalesce(started_at, statement_timestamp())
        else started_at
      end,
      completed_at = case
        when p_status in ('verified','failed','cancelled') then statement_timestamp()
        else null
      end,
      verified_by_user_id = case when p_status = 'verified' then v_actor_user_id else null end,
      verification_result = case
        when p_status in ('verified','failed') then p_verification_result
        else verification_result
      end,
      notes = coalesce(v_notes, notes),
      updated_at = statement_timestamp()
  where id = p_drill_id;

  insert into public.platform_recovery_events(
    drill_id,
    actor_user_id,
    event_type,
    detail
  ) values (
    p_drill_id,
    v_actor_user_id,
    'drill_status_changed',
    jsonb_build_object(
      'from', v_drill.status,
      'to', p_status,
      'verification_result', case
        when p_status in ('verified','failed') then p_verification_result
        else null
      end
    )
  );

  insert into public.platform_admin_audit_events(
    staff_user_id,
    action,
    metadata
  ) values (
    v_actor_user_id,
    'platform_recovery_drill_status_changed',
    jsonb_build_object(
      'drill_id', p_drill_id,
      'from', v_drill.status,
      'to', p_status
    )
  );

  return p_drill_id;
end;
$$;

revoke all on function public.capture_platform_recovery_snapshot(jsonb)
  from public, anon;
revoke all on function public.create_platform_recovery_drill(uuid,text,text,timestamptz,text)
  from public, anon;
revoke all on function public.update_platform_recovery_drill(uuid,text,jsonb,text)
  from public, anon;
grant execute on function public.capture_platform_recovery_snapshot(jsonb)
  to authenticated;
grant execute on function public.create_platform_recovery_drill(uuid,text,text,timestamptz,text)
  to authenticated;
grant execute on function public.update_platform_recovery_drill(uuid,text,jsonb,text)
  to authenticated;

comment on table public.platform_recovery_snapshots is
  'Immutable, aggregate-only recovery inventory. This is readiness evidence, not a database or Storage object backup.';
comment on table public.platform_recovery_drills is
  'Controlled recovery rehearsal records. Bynex never exposes a production restore button.';
comment on function public.capture_platform_recovery_snapshot(jsonb) is
  'Captures a privacy-preserving database, Storage metadata and configuration inventory for recovery readiness.';
comment on function public.create_platform_recovery_drill(uuid,text,text,timestamptz,text) is
  'Creates a controlled recovery rehearsal against an immutable readiness snapshot.';
comment on function public.update_platform_recovery_drill(uuid,text,jsonb,text) is
  'Moves a recovery rehearsal through validated states with audit evidence.';

select pg_notify('pgrst', 'reload schema');

commit;
