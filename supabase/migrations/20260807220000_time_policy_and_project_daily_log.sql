begin;

-- The employer decides whether workers may enter time manually. The project
-- diary remains available regardless of the selected time-capture method.
create table if not exists public.organization_time_capture_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  manual_entry_policy text not null default 'manual_allowed'
    check (manual_entry_policy in ('manual_allowed','clock_required')),
  gps_project_suggestion_enabled boolean not null default true,
  daily_log_required boolean not null default false,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.organization_time_capture_settings (organization_id)
select organization.id
from public.organizations organization
on conflict (organization_id) do nothing;

drop trigger if exists organization_time_capture_settings_set_updated_at
  on public.organization_time_capture_settings;
create trigger organization_time_capture_settings_set_updated_at
before update on public.organization_time_capture_settings
for each row execute function public.set_updated_at();

alter table public.organization_time_capture_settings enable row level security;
alter table public.organization_time_capture_settings force row level security;

drop policy if exists organization_time_capture_settings_member_select
  on public.organization_time_capture_settings;
create policy organization_time_capture_settings_member_select
on public.organization_time_capture_settings
for select to authenticated
using (
  private.is_organization_member(organization_id,(select auth.uid()))
);

revoke all on public.organization_time_capture_settings
  from public,anon,authenticated;
grant select on public.organization_time_capture_settings to authenticated;

create or replace function public.set_organization_time_capture_settings(
  p_organization_id uuid,
  p_manual_entry_policy text,
  p_gps_project_suggestion_enabled boolean,
  p_daily_log_required boolean
)
returns public.organization_time_capture_settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_policy text := btrim(coalesce(p_manual_entry_policy,''));
  v_result public.organization_time_capture_settings;
begin
  if v_user_id is null
     or not private.has_organization_role(
       p_organization_id,
       array['owner','admin','office','manager']::text[],
       v_user_id
     ) then
    raise exception 'Behörighet att ändra tidsregler saknas'
      using errcode = '42501';
  end if;
  if v_policy not in ('manual_allowed','clock_required') then
    raise exception 'Tidsregeln är ogiltig' using errcode = '22023';
  end if;

  insert into public.organization_time_capture_settings (
    organization_id,manual_entry_policy,gps_project_suggestion_enabled,
    daily_log_required,updated_by_user_id
  ) values (
    p_organization_id,v_policy,
    coalesce(p_gps_project_suggestion_enabled,true),
    coalesce(p_daily_log_required,false),v_user_id
  )
  on conflict (organization_id) do update
  set manual_entry_policy = excluded.manual_entry_policy,
      gps_project_suggestion_enabled = excluded.gps_project_suggestion_enabled,
      daily_log_required = excluded.daily_log_required,
      updated_by_user_id = excluded.updated_by_user_id,
      updated_at = now()
  returning * into v_result;

  return v_result;
end;
$$;

revoke all on function public.set_organization_time_capture_settings(
  uuid,text,boolean,boolean
) from public,anon;
grant execute on function public.set_organization_time_capture_settings(
  uuid,text,boolean,boolean
) to authenticated;

-- Bynex already has one project-level daily summary per project and date.
-- These worker contributions extend that diary without replacing or mutating
-- the existing project_daily_logs contract.
create table if not exists public.project_daily_log_contributions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null,
  worker_id uuid not null,
  time_entry_id uuid,
  work_date date not null,
  work_performed text not null default '',
  blockers text,
  next_steps text,
  weather text,
  crew_count integer,
  status text not null default 'draft',
  created_by_user_id uuid references auth.users(id) on delete set null,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  submitted_at timestamptz,
  reviewed_by_user_id uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,project_id,worker_id,work_date),
  foreign key (organization_id,project_id)
    references public.projects(organization_id,id) on delete cascade,
  foreign key (organization_id,worker_id)
    references public.workers(organization_id,id) on delete restrict,
  foreign key (organization_id,time_entry_id)
    references public.time_entries(organization_id,id)
    on delete set null (time_entry_id),
  constraint project_daily_log_contributions_crew_count_check
    check (crew_count is null or crew_count between 0 and 10000),
  constraint project_daily_log_contributions_status_check
    check (status in ('draft','submitted','reviewed','rejected')),
  constraint project_daily_log_contributions_work_performed_check
    check (char_length(work_performed) <= 5000),
  constraint project_daily_log_contributions_blockers_check
    check (blockers is null or char_length(blockers) <= 3000),
  constraint project_daily_log_contributions_next_steps_check
    check (next_steps is null or char_length(next_steps) <= 3000),
  constraint project_daily_log_contributions_weather_check
    check (weather is null or char_length(weather) <= 160),
  constraint project_daily_log_contributions_review_note_check
    check (review_note is null or char_length(review_note) <= 2000),
  constraint project_daily_log_contributions_content_check
    check (
      status = 'draft'
      or char_length(btrim(work_performed)) > 0
    ),
  constraint project_daily_log_contributions_submission_state_check
    check (
      (status in ('submitted','reviewed','rejected'))
      = (submitted_at is not null)
    ),
  constraint project_daily_log_contributions_decision_state_check
    check (
      (
        status in ('draft','submitted')
        and reviewed_by_user_id is null
        and reviewed_at is null
      )
      or
      (
        status in ('reviewed','rejected')
        and reviewed_by_user_id is not null
        and reviewed_at is not null
      )
    )
);

create table if not exists public.project_daily_log_contribution_requests (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  request_id uuid not null,
  contribution_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (organization_id,request_id),
  foreign key (organization_id,contribution_id)
    references public.project_daily_log_contributions(organization_id,id)
    on delete restrict
);

create index if not exists project_daily_log_contributions_project_date_idx
  on public.project_daily_log_contributions(
    organization_id,project_id,work_date desc,status
  );

create index if not exists project_daily_log_contributions_worker_date_idx
  on public.project_daily_log_contributions(
    organization_id,worker_id,work_date desc
  );

drop trigger if exists project_daily_log_contributions_set_updated_at
  on public.project_daily_log_contributions;
create trigger project_daily_log_contributions_set_updated_at
before update on public.project_daily_log_contributions
for each row execute function public.set_updated_at();

alter table public.project_daily_log_contributions enable row level security;
alter table public.project_daily_log_contributions force row level security;
alter table public.project_daily_log_contribution_requests enable row level security;
alter table public.project_daily_log_contribution_requests force row level security;

drop policy if exists project_daily_log_contributions_select
  on public.project_daily_log_contributions;
create policy project_daily_log_contributions_select
on public.project_daily_log_contributions
for select to authenticated
using (
  private.has_organization_role(
    organization_id,
    array['owner','admin','office','manager','supervisor']::text[],
    (select auth.uid())
  )
  or private.is_own_worker(
    organization_id,worker_id,(select auth.uid())
  )
);

revoke all on public.project_daily_log_contributions
  from public,anon,authenticated;
revoke all on public.project_daily_log_contribution_requests
  from public,anon,authenticated;
grant select on public.project_daily_log_contributions to authenticated;

create or replace function public.upsert_project_daily_log_contribution(
  p_organization_id uuid,
  p_project_id uuid,
  p_worker_id uuid,
  p_time_entry_id uuid,
  p_work_date date,
  p_work_performed text,
  p_blockers text,
  p_next_steps text,
  p_weather text,
  p_crew_count integer,
  p_submit boolean,
  p_client_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_profile_id uuid;
  v_own_worker_id uuid;
  v_worker_id uuid;
  v_timezone text;
  v_today date;
  v_privileged boolean;
  v_existing public.project_daily_log_contributions;
  v_result_id uuid;
  v_work_performed text := left(btrim(coalesce(p_work_performed,'')),5000);
  v_blockers text := nullif(left(btrim(coalesce(p_blockers,'')),3000),'');
  v_next_steps text := nullif(left(btrim(coalesce(p_next_steps,'')),3000),'');
  v_weather text := nullif(left(btrim(coalesce(p_weather,'')),160),'');
begin
  if v_user_id is null then
    raise exception 'Inloggning krävs' using errcode = '42501';
  end if;
  if p_client_request_id is null then
    raise exception 'En säker engångsnyckel krävs' using errcode = '22023';
  end if;
  if p_project_id is null or p_work_date is null then
    raise exception 'Projekt och datum krävs' using errcode = '22023';
  end if;
  if coalesce(p_submit,false) and v_work_performed = '' then
    raise exception 'Beskriv kort vad som utfördes innan dagboken skickas'
      using errcode = '23514';
  end if;
  if p_crew_count is not null and (p_crew_count < 0 or p_crew_count > 10000) then
    raise exception 'Bemanningen är ogiltig' using errcode = '22023';
  end if;
  if not private.is_organization_member(p_organization_id,v_user_id) then
    raise exception 'Aktivt företagsmedlemskap krävs'
      using errcode = '42501';
  end if;

  select request.contribution_id into v_result_id
  from public.project_daily_log_contribution_requests request
  where request.organization_id = p_organization_id
    and request.request_id = p_client_request_id;
  if v_result_id is not null then return v_result_id; end if;

  select profile.id into v_profile_id
  from public.profiles profile
  where profile.user_id = v_user_id
    and profile.current_organization_id = p_organization_id;

  select worker.id into v_own_worker_id
  from public.workers worker
  where worker.organization_id = p_organization_id
    and worker.profile_id = v_profile_id
    and worker.active
  limit 1;

  v_privileged := private.has_organization_role(
    p_organization_id,
    array['owner','admin','office','manager','supervisor']::text[],
    v_user_id
  );
  v_worker_id := coalesce(p_worker_id,v_own_worker_id);

  if v_worker_id is null then
    raise exception 'En aktiv personalprofil krävs' using errcode = 'P0002';
  end if;
  if v_worker_id is distinct from v_own_worker_id and not v_privileged then
    raise exception 'Du får endast skriva ditt eget dagboksbidrag'
      using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.workers worker
    where worker.organization_id = p_organization_id
      and worker.id = v_worker_id
      and worker.active
  ) then
    raise exception 'Medarbetaren hittades inte' using errcode = 'P0002';
  end if;
  if not exists (
    select 1
    from public.projects project
    where project.organization_id = p_organization_id
      and project.id = p_project_id
      and project.active
  ) then
    raise exception 'Projektet hittades inte' using errcode = 'P0002';
  end if;
  if not v_privileged
     and not private.can_work_on_project(
       p_organization_id,p_project_id,v_user_id
     ) then
    raise exception 'Du är inte tilldelad projektet'
      using errcode = '42501';
  end if;

  select coalesce(organization.timezone,'Europe/Stockholm')
    into v_timezone
  from public.organizations organization
  where organization.id = p_organization_id;
  v_today := (
    statement_timestamp() at time zone coalesce(v_timezone,'Europe/Stockholm')
  )::date;
  if p_work_date > v_today + 1 or p_work_date < v_today - 400 then
    raise exception 'Dagboken får avse idag eller de senaste 400 dagarna'
      using errcode = '22023';
  end if;

  if p_time_entry_id is not null and not exists (
    select 1
    from public.time_entries entry
    where entry.organization_id = p_organization_id
      and entry.id = p_time_entry_id
      and entry.worker_id = v_worker_id
      and entry.project_id = p_project_id
      and entry.work_date = p_work_date
  ) then
    raise exception 'Tiden och dagboken måste avse samma projekt, person och datum'
      using errcode = '23514';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_organization_id::text || ':' || p_project_id::text || ':'
      || v_worker_id::text || ':' || p_work_date::text,
      20260807220000
    )
  );

  select * into v_existing
  from public.project_daily_log_contributions contribution
  where contribution.organization_id = p_organization_id
    and contribution.project_id = p_project_id
    and contribution.worker_id = v_worker_id
    and contribution.work_date = p_work_date
  for update;

  if v_existing.id is not null
     and v_existing.status = 'reviewed'
     and not v_privileged then
    raise exception 'Ett granskat dagboksbidrag kan bara ändras av arbetsledningen'
      using errcode = '42501';
  end if;

  insert into public.project_daily_log_contributions (
    organization_id,project_id,worker_id,time_entry_id,work_date,
    work_performed,blockers,next_steps,weather,crew_count,status,
    created_by_user_id,updated_by_user_id,submitted_at,
    reviewed_by_user_id,reviewed_at,review_note
  ) values (
    p_organization_id,p_project_id,v_worker_id,p_time_entry_id,p_work_date,
    v_work_performed,v_blockers,v_next_steps,v_weather,p_crew_count,
    case when coalesce(p_submit,false) then 'submitted' else 'draft' end,
    v_user_id,v_user_id,
    case when coalesce(p_submit,false) then now() else null end,
    null,null,null
  )
  on conflict (organization_id,project_id,worker_id,work_date) do update
  set time_entry_id = coalesce(
        excluded.time_entry_id,
        project_daily_log_contributions.time_entry_id
      ),
      work_performed = excluded.work_performed,
      blockers = excluded.blockers,
      next_steps = excluded.next_steps,
      weather = excluded.weather,
      crew_count = excluded.crew_count,
      status = excluded.status,
      updated_by_user_id = excluded.updated_by_user_id,
      submitted_at = excluded.submitted_at,
      reviewed_by_user_id = null,
      reviewed_at = null,
      review_note = null,
      updated_at = now()
  returning id into v_result_id;

  insert into public.project_daily_log_contribution_requests (
    organization_id,request_id,contribution_id
  ) values (
    p_organization_id,p_client_request_id,v_result_id
  )
  on conflict (organization_id,request_id) do nothing;

  return v_result_id;
end;
$$;

revoke all on function public.upsert_project_daily_log_contribution(
  uuid,uuid,uuid,uuid,date,text,text,text,text,integer,boolean,uuid
) from public,anon;
grant execute on function public.upsert_project_daily_log_contribution(
  uuid,uuid,uuid,uuid,date,text,text,text,text,integer,boolean,uuid
) to authenticated;

create or replace function public.review_project_daily_log_contribution(
  p_organization_id uuid,
  p_contribution_id uuid,
  p_decision text,
  p_review_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_decision text := btrim(coalesce(p_decision,''));
  v_result_id uuid;
begin
  if v_user_id is null
     or not private.has_organization_role(
       p_organization_id,
       array['owner','admin','office','manager','supervisor']::text[],
       v_user_id
     ) then
    raise exception 'Behörighet att granska dagboken saknas'
      using errcode = '42501';
  end if;
  if v_decision not in ('reviewed','rejected') then
    raise exception 'Granskningsbeslutet är ogiltigt' using errcode = '22023';
  end if;

  update public.project_daily_log_contributions
  set status = v_decision,
      reviewed_by_user_id = v_user_id,
      reviewed_at = now(),
      review_note = nullif(left(btrim(coalesce(p_review_note,'')),2000),''),
      updated_by_user_id = v_user_id,
      updated_at = now()
  where organization_id = p_organization_id
    and id = p_contribution_id
    and status in ('submitted','reviewed','rejected')
  returning id into v_result_id;

  if v_result_id is null then
    raise exception 'Dagboksbidraget hittades inte eller är inte skickat'
      using errcode = 'P0002';
  end if;
  return v_result_id;
end;
$$;

revoke all on function public.review_project_daily_log_contribution(
  uuid,uuid,text,text
) from public,anon;
grant execute on function public.review_project_daily_log_contribution(
  uuid,uuid,text,text
) to authenticated;

-- Enforce the employer's policy without preventing authorised corrections.
create or replace function private.guard_manual_time_policy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_policy text;
begin
  if new.entry_mode <> 'manual' or v_user_id is null then
    return new;
  end if;
  if private.has_organization_role(
    new.organization_id,
    array['owner','admin','office','manager','supervisor']::text[],
    v_user_id
  ) then
    return new;
  end if;

  select settings.manual_entry_policy into v_policy
  from public.organization_time_capture_settings settings
  where settings.organization_id = new.organization_id;

  if coalesce(v_policy,'manual_allowed') = 'clock_required' then
    raise exception 'Företaget kräver in- och utstämpling. Kontakta arbetsledningen om tiden behöver rättas.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_manual_time_policy()
  from public,anon,authenticated;

drop trigger if exists guard_manual_time_policy on public.time_entries;
create trigger guard_manual_time_policy
before insert or update of entry_mode,organization_id,worker_id
on public.time_entries
for each row execute function private.guard_manual_time_policy();

-- Keep a visible audit trail for employer policy changes and diary decisions.
drop trigger if exists write_audit_log
  on public.organization_time_capture_settings;
create trigger write_audit_log
after insert or update or delete on public.organization_time_capture_settings
for each row execute function private.write_audit_log();

drop trigger if exists write_audit_log
  on public.project_daily_log_contributions;
create trigger write_audit_log
after insert or update or delete on public.project_daily_log_contributions
for each row execute function private.write_audit_log();

commit;
