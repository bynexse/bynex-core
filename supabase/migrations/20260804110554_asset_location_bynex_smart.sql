begin;

create table public.asset_locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid,
  parent_location_id uuid,
  location_code text not null,
  name text not null,
  location_type text not null check (location_type in (
    'depot','yard','site','building','container','shelf','room','vehicle','zone','other'
  )),
  description text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,id),
  unique(organization_id,location_code),
  foreign key(organization_id,project_id)
    references public.projects(organization_id,id) on delete cascade,
  foreign key(organization_id,parent_location_id)
    references public.asset_locations(organization_id,id)
    on delete set null (parent_location_id),
  check(parent_location_id is null or parent_location_id<>id)
);

create or replace function private.guard_asset_location_hierarchy()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.parent_location_id is not null and exists (
    with recursive ancestors(id) as (
      select new.parent_location_id
      union all
      select l.parent_location_id
      from public.asset_locations l
      join ancestors a on a.id=l.id
      where l.organization_id=new.organization_id
        and l.parent_location_id is not null
    )
    select 1 from ancestors where id=new.id
  ) then
    raise exception 'En maskinplats kan inte innehålla en cirkelreferens'
      using errcode='23514';
  end if;
  if new.parent_location_id is not null and exists (
    select 1 from public.asset_locations p
    where p.organization_id=new.organization_id and p.id=new.parent_location_id
      and p.project_id is distinct from new.project_id
      and p.project_id is not null and new.project_id is not null
  ) then
    raise exception 'Underplats och överordnad plats måste tillhöra samma projekt'
      using errcode='23514';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_asset_location_hierarchy()
  from public,anon,authenticated;
create trigger guard_asset_location_hierarchy
  before insert or update of parent_location_id,project_id on public.asset_locations
  for each row execute function private.guard_asset_location_hierarchy();

create or replace function private.asset_location_path(
  p_organization_id uuid,
  p_location_id uuid
)
returns text
language sql
stable
security definer
set search_path=''
as $$
  with recursive location_path(id,parent_location_id,name,depth) as (
    select l.id,l.parent_location_id,l.name,0
    from public.asset_locations l
    where l.organization_id=p_organization_id and l.id=p_location_id and l.active
    union all
    select p.id,p.parent_location_id,p.name,c.depth+1
    from public.asset_locations p
    join location_path c on c.parent_location_id=p.id
    where p.organization_id=p_organization_id and p.active and c.depth<30
  )
  select string_agg(name,', ' order by depth desc) from location_path
$$;

revoke all on function private.asset_location_path(uuid,uuid)
  from public,anon,authenticated;

alter table public.assets
  add column current_location_id uuid,
  add constraint assets_current_location_fkey
    foreign key(organization_id,current_location_id)
    references public.asset_locations(organization_id,id)
    on delete set null (current_location_id);

alter table public.asset_loans
  add column checkout_location_id uuid,
  add column deployed_location_id uuid,
  add column expected_return_location_id uuid,
  add column returned_location_id uuid,
  add constraint asset_loans_checkout_location_fkey
    foreign key(organization_id,checkout_location_id)
    references public.asset_locations(organization_id,id)
    on delete set null (checkout_location_id),
  add constraint asset_loans_deployed_location_fkey
    foreign key(organization_id,deployed_location_id)
    references public.asset_locations(organization_id,id)
    on delete set null (deployed_location_id),
  add constraint asset_loans_expected_return_location_fkey
    foreign key(organization_id,expected_return_location_id)
    references public.asset_locations(organization_id,id)
    on delete set null (expected_return_location_id),
  add constraint asset_loans_returned_location_fkey
    foreign key(organization_id,returned_location_id)
    references public.asset_locations(organization_id,id)
    on delete set null (returned_location_id);

create table public.asset_location_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  asset_id uuid not null,
  loan_id uuid,
  project_id uuid,
  location_id uuid not null,
  event_type text not null check (event_type in (
    'registered','moved','checkout','project_arrival','return','inventory','correction'
  )),
  note text,
  occurred_at timestamptz not null default now(),
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(organization_id,id),
  foreign key(organization_id,asset_id)
    references public.assets(organization_id,id) on delete cascade,
  foreign key(organization_id,loan_id,asset_id)
    references public.asset_loans(organization_id,id,asset_id)
    on delete set null (loan_id),
  foreign key(organization_id,project_id)
    references public.projects(organization_id,id) on delete set null (project_id),
  foreign key(organization_id,location_id)
    references public.asset_locations(organization_id,id) on delete restrict
);

create or replace function private.guard_asset_current_location_change()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.current_location_id is distinct from old.current_location_id
     and coalesce(current_setting('bynex.asset_location_context',true),'')<>'event' then
    raise exception 'Flytta maskinen genom en platshändelse så att historiken sparas'
      using errcode='42501';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_asset_current_location_change()
  from public,anon,authenticated;
create trigger guard_asset_current_location_change
  before update of current_location_id on public.assets
  for each row execute function private.guard_asset_current_location_change();

create or replace function private.guard_asset_location_event()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if tg_op<>'INSERT' then
    raise exception 'Maskinens platshistorik är oföränderlig'
      using errcode='42501';
  end if;
  if new.project_id is not null and exists (
    select 1 from public.asset_locations l
    where l.organization_id=new.organization_id and l.id=new.location_id
      and l.project_id is not null and l.project_id<>new.project_id
  ) then
    raise exception 'Maskinplatsen tillhör ett annat projekt'
      using errcode='23514';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_asset_location_event()
  from public,anon,authenticated;
create trigger guard_asset_location_event
  before insert or update or delete on public.asset_location_events
  for each row execute function private.guard_asset_location_event();

create or replace function private.sync_asset_current_location_from_event()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare location_path text;
begin
  location_path:=private.asset_location_path(new.organization_id,new.location_id);
  perform set_config('bynex.asset_location_context','event',true);
  update public.assets
  set current_location_id=new.location_id,
      location_text=location_path,
      project_id=case
        when new.event_type in ('checkout','project_arrival') then coalesce(new.project_id,project_id)
        when new.event_type='return' then null
        else project_id
      end,
      updated_at=now()
  where organization_id=new.organization_id and id=new.asset_id;
  return new;
end;
$$;

revoke all on function private.sync_asset_current_location_from_event()
  from public,anon,authenticated;
create trigger sync_asset_current_location_from_event
  after insert on public.asset_location_events
  for each row execute function private.sync_asset_current_location_from_event();

create or replace function private.guard_asset_loan_change()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  caller_id uuid:=auth.uid();
  privileged boolean;
begin
  privileged:=private.has_organization_role(
    coalesce(new.organization_id,old.organization_id),
    array['owner','admin','office','manager','supervisor']::text[],caller_id
  );

  if tg_op='INSERT' and caller_id is not null and not privileged then
    if not private.is_own_worker(new.organization_id,new.borrower_worker_id,caller_id)
       or new.status<>'active' or new.returned_at is not null
       or new.returned_location_id is not null then
      raise exception 'Maskinutlåningen är inte tillåten' using errcode='42501';
    end if;
  elsif tg_op='UPDATE' then
    if new.organization_id<>old.organization_id or new.id<>old.id
       or new.asset_id<>old.asset_id
       or new.borrower_worker_id<>old.borrower_worker_id
       or new.checked_out_at<>old.checked_out_at
       or new.checkout_location_id is distinct from old.checkout_location_id
       or new.deployed_location_id is distinct from old.deployed_location_id
       or new.expected_return_location_id is distinct from old.expected_return_location_id then
      raise exception 'Låsta uppgifter i maskinutlåningen får inte ändras'
        using errcode='42501';
    end if;

    if caller_id is not null and not privileged then
      if not private.is_own_worker(old.organization_id,old.borrower_worker_id,caller_id)
         or old.status not in ('active','overdue') or new.status<>'returned'
         or new.returned_at is null
         or new.returned_location_id is null
         or new.project_id is distinct from old.project_id
         or new.due_at is distinct from old.due_at
         or new.checkout_meter is distinct from old.checkout_meter
         or new.checkout_note is distinct from old.checkout_note then
        raise exception 'Låntagaren får endast registrera en fullständig retur'
          using errcode='42501';
      end if;
    end if;
    if old.status in ('active','overdue') and new.status='returned'
       and new.returned_location_id is null then
      raise exception 'Returplats måste anges, till exempel Grusplan 1'
        using errcode='23514';
    end if;
  end if;

  if new.deployed_location_id is not null and new.project_id is not null
     and exists (
       select 1 from public.asset_locations l
       where l.organization_id=new.organization_id and l.id=new.deployed_location_id
         and l.project_id is not null and l.project_id<>new.project_id
     ) then
    raise exception 'Utlämningsplatsen tillhör ett annat projekt'
      using errcode='23514';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_asset_loan_change()
  from public,anon,authenticated;

create or replace function private.sync_asset_location_from_loan()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if tg_op='INSERT' and new.status in ('active','overdue')
     and new.deployed_location_id is not null then
    insert into public.asset_location_events(
      organization_id,asset_id,loan_id,project_id,location_id,event_type,
      note,created_by_user_id
    ) values (
      new.organization_id,new.asset_id,new.id,new.project_id,
      new.deployed_location_id,'checkout','Plats registrerad vid utlämning.',
      coalesce(new.checked_out_by_user_id,(select auth.uid()))
    );
  elsif tg_op='UPDATE' and old.status in ('active','overdue')
     and new.status='returned' and new.returned_location_id is not null then
    insert into public.asset_location_events(
      organization_id,asset_id,loan_id,project_id,location_id,event_type,
      note,created_by_user_id
    ) values (
      new.organization_id,new.asset_id,new.id,new.project_id,
      new.returned_location_id,'return',coalesce(new.return_note,'Maskinen återlämnad.'),
      coalesce(new.returned_by_user_id,(select auth.uid()))
    );
  end if;
  return new;
end;
$$;

revoke all on function private.sync_asset_location_from_loan()
  from public,anon,authenticated;
create trigger sync_asset_location_from_loan
  after insert or update of status,returned_at,returned_location_id
  on public.asset_loans
  for each row execute function private.sync_asset_location_from_loan();

create or replace function public.ask_bynex_smart_asset_location(
  p_organization_id uuid,
  p_query text
)
returns table(
  answer_kind text,
  answer text,
  asset_id uuid,
  asset_number text,
  asset_name text,
  asset_status text,
  project_id uuid,
  project_name text,
  expected_return_at timestamptz,
  location_path text,
  matched_assets integer
)
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  selected_asset record;
  match_count integer;
  open_loan record;
  resolved_path text;
  resolved_answer text;
begin
  if not private.is_organization_member(p_organization_id,(select auth.uid())) then
    raise exception 'Du får inte söka efter maskiner i detta företag'
      using errcode='42501';
  end if;
  if char_length(btrim(coalesce(p_query,''))) not between 1 and 160 then
    raise exception 'Sök efter maskinnamn, nummer eller registreringsnummer'
      using errcode='22023';
  end if;

  select count(*) into match_count
  from public.assets a
  where a.organization_id=p_organization_id and a.active
    and (
      upper(a.asset_number)=upper(btrim(p_query))
      or upper(coalesce(a.registration_number,''))=upper(btrim(p_query))
      or upper(coalesce(a.serial_number,''))=upper(btrim(p_query))
      or lower(a.name)=lower(btrim(p_query))
    );

  if match_count=1 then
    select a.* into selected_asset
    from public.assets a
    where a.organization_id=p_organization_id and a.active
      and (
        upper(a.asset_number)=upper(btrim(p_query))
        or upper(coalesce(a.registration_number,''))=upper(btrim(p_query))
        or upper(coalesce(a.serial_number,''))=upper(btrim(p_query))
        or lower(a.name)=lower(btrim(p_query))
      )
    limit 1;
  else
    select count(*) into match_count
    from public.assets a
    where a.organization_id=p_organization_id and a.active
      and (
        a.search_document @@ websearch_to_tsquery('pg_catalog.swedish',left(btrim(p_query),160))
        or a.asset_number ilike '%'||left(btrim(p_query),80)||'%'
        or a.registration_number ilike '%'||left(btrim(p_query),80)||'%'
        or a.name ilike '%'||left(btrim(p_query),80)||'%'
      );
    if match_count=1 then
      select a.* into selected_asset
      from public.assets a
      where a.organization_id=p_organization_id and a.active
        and (
          a.search_document @@ websearch_to_tsquery('pg_catalog.swedish',left(btrim(p_query),160))
          or a.asset_number ilike '%'||left(btrim(p_query),80)||'%'
          or a.registration_number ilike '%'||left(btrim(p_query),80)||'%'
          or a.name ilike '%'||left(btrim(p_query),80)||'%'
        )
      order by ts_rank(a.search_document,
        websearch_to_tsquery('pg_catalog.swedish',left(btrim(p_query),160))) desc,a.name
      limit 1;
    end if;
  end if;

  if match_count=0 then
    return query select 'not_found','Jag hittar ingen maskin som matchar ”'||
      left(btrim(p_query),160)||'”.',null::uuid,null::text,null::text,null::text,
      null::uuid,null::text,null::timestamptz,null::text,0;
    return;
  elsif match_count>1 then
    return query select 'ambiguous','Jag hittade flera maskiner. Ange maskinnummer eller registreringsnummer.',
      null::uuid,null::text,null::text,null::text,null::uuid,null::text,
      null::timestamptz,null::text,match_count;
    return;
  end if;

  select l.id,l.project_id,l.due_at,p.name project_name,
         coalesce(l.deployed_location_id,selected_asset.current_location_id) location_id
  into open_loan
  from public.asset_loans l
  left join public.projects p
    on p.organization_id=l.organization_id and p.id=l.project_id
  where l.organization_id=p_organization_id and l.asset_id=selected_asset.id
    and l.status in ('active','overdue')
  order by l.checked_out_at desc
  limit 1;

  resolved_path:=private.asset_location_path(
    p_organization_id,coalesce(open_loan.location_id,selected_asset.current_location_id)
  );

  if open_loan.id is not null then
    resolved_answer:='Den är'||case when open_loan.project_name is not null
      then ' på projekt '||open_loan.project_name else ' utlånad' end||
      case when resolved_path is not null then ', plats '||resolved_path else '' end||
      case when open_loan.due_at is not null
        then '. Den beräknas åter '||to_char(open_loan.due_at at time zone 'Europe/Stockholm','YYYY-MM-DD HH24:MI')
        else '. Beräknad återtid är inte registrerad' end||'.';
  elsif resolved_path is not null then
    resolved_answer:='Den står på '||resolved_path||'.';
  elsif selected_asset.status='available' then
    resolved_answer:='Den är återlämnad, men platsen behöver registreras.';
  else
    resolved_answer:='Aktuell status är '||selected_asset.status||
      ', men exakt plats behöver registreras.';
  end if;

  return query select 'found',resolved_answer,selected_asset.id,
    selected_asset.asset_number,selected_asset.name,selected_asset.status,
    open_loan.project_id,open_loan.project_name,open_loan.due_at,resolved_path,1;
end;
$$;

revoke all on function public.ask_bynex_smart_asset_location(uuid,text)
  from public,anon;
grant execute on function public.ask_bynex_smart_asset_location(uuid,text)
  to authenticated;

alter table public.asset_locations enable row level security;
alter table public.asset_locations force row level security;
alter table public.asset_location_events enable row level security;
alter table public.asset_location_events force row level security;

create policy asset_locations_member_select on public.asset_locations
  for select to authenticated
  using(private.is_organization_member(organization_id,(select auth.uid())));
create policy asset_locations_management_insert on public.asset_locations
  for insert to authenticated
  with check(private.has_organization_role(
    organization_id,array['owner','admin','office','manager','supervisor']::text[],
    (select auth.uid())
  ));
create policy asset_locations_management_update on public.asset_locations
  for update to authenticated
  using(private.has_organization_role(
    organization_id,array['owner','admin','office','manager','supervisor']::text[],
    (select auth.uid())
  ))
  with check(private.has_organization_role(
    organization_id,array['owner','admin','office','manager','supervisor']::text[],
    (select auth.uid())
  ));
create policy asset_locations_management_delete on public.asset_locations
  for delete to authenticated
  using(private.has_organization_role(
    organization_id,array['owner','admin','office','manager']::text[],
    (select auth.uid())
  ));

create policy asset_location_events_member_select on public.asset_location_events
  for select to authenticated
  using(private.is_organization_member(organization_id,(select auth.uid())));
create policy asset_location_events_member_insert on public.asset_location_events
  for insert to authenticated
  with check(
    private.is_organization_member(organization_id,(select auth.uid()))
    and created_by_user_id=(select auth.uid())
  );

revoke all on public.asset_locations,public.asset_location_events
  from anon,authenticated;
grant select,insert,update,delete on public.asset_locations to authenticated;
grant select,insert on public.asset_location_events to authenticated;

create trigger set_updated_at before update on public.asset_locations
  for each row execute function public.set_updated_at();
create trigger write_audit_log after insert or update or delete on public.asset_locations
  for each row execute function private.write_audit_log();
create trigger write_audit_log after insert or update or delete on public.asset_location_events
  for each row execute function private.write_audit_log();

create index asset_locations_parent_idx
  on public.asset_locations(organization_id,parent_location_id,sort_order);
create index asset_locations_project_idx
  on public.asset_locations(organization_id,project_id,active);
create index asset_location_events_latest_idx
  on public.asset_location_events(organization_id,asset_id,occurred_at desc);
create index assets_current_location_idx
  on public.assets(organization_id,current_location_id,status)
  where current_location_id is not null and active;

commit;
