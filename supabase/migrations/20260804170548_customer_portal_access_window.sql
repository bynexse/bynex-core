-- Customer access remains included during the project and for one year after it ends.
-- The data is not deleted at expiry; only external portal access is stopped.

alter table public.project_portal_settings
  add column if not exists project_closed_at timestamptz,
  add column if not exists included_access_until timestamptz,
  add column if not exists extended_access_active boolean not null default false;

alter table public.project_portal_settings
  drop constraint if exists project_portal_settings_access_window_check;

alter table public.project_portal_settings
  add constraint project_portal_settings_access_window_check check (
    included_access_until is null
    or project_closed_at is null
    or included_access_until >= project_closed_at
  );

create index if not exists project_portal_settings_external_access_idx
  on public.project_portal_settings (project_id, included_access_until)
  where enabled;

update public.project_portal_settings settings
set
  project_closed_at = coalesce(project.end_date::timestamptz, project.updated_at),
  included_access_until = coalesce(project.end_date::timestamptz, project.updated_at) + interval '1 year'
from public.projects project
where project.organization_id = settings.organization_id
  and project.id = settings.project_id
  and project.status in ('completed', 'cancelled')
  and settings.project_closed_at is null;

create or replace function private.sync_project_portal_access_window()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  closed_at timestamptz;
begin
  if new.status in ('completed', 'cancelled')
     and old.status is distinct from new.status then
    closed_at := coalesce(new.end_date::timestamptz, now());
    update public.project_portal_settings
    set
      project_closed_at = closed_at,
      included_access_until = closed_at + interval '1 year',
      status = case when status = 'active' then 'handover' else status end,
      updated_at = now()
    where organization_id = new.organization_id
      and project_id = new.id;
  elsif new.status in ('planned', 'active', 'paused')
        and old.status in ('completed', 'cancelled') then
    update public.project_portal_settings
    set
      project_closed_at = null,
      included_access_until = null,
      status = case when enabled then 'active' else 'setup' end,
      updated_at = now()
    where organization_id = new.organization_id
      and project_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists projects_sync_portal_access_window on public.projects;
create trigger projects_sync_portal_access_window
after update of status, end_date on public.projects
for each row execute function private.sync_project_portal_access_window();

create or replace function private.portal_user_has_capability(
  requested_organization_id uuid,
  requested_project_id uuid,
  requested_capability text,
  requested_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.has_organization_role(
      requested_organization_id,
      array['owner','admin','office','manager','supervisor']::text[],
      requested_user_id
    )
    or exists (
      select 1
      from public.project_portal_members m
      join public.project_portal_settings s
        on s.organization_id=m.organization_id and s.project_id=m.project_id
      where m.organization_id=requested_organization_id
        and m.project_id=requested_project_id
        and m.user_id=requested_user_id
        and m.status='active'
        and s.enabled
        and (
          s.extended_access_active
          or s.included_access_until is null
          or s.included_access_until > now()
        )
        and case requested_capability
          when 'view' then m.can_view_timeline
          when 'documents' then m.can_view_documents
          when 'installations' then m.can_view_installations
          when 'checkins' then m.can_view_checkins and s.share_checkins
          when 'comment' then m.can_comment and s.allow_customer_comments
          when 'acknowledge' then m.can_acknowledge and s.allow_customer_acknowledgements
          when 'approve' then m.can_approve
          else false
        end
    )
$$;

create or replace function private.can_view_portal_publication(
  requested_publication_id uuid,
  requested_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.project_portal_publications p
    join public.project_portal_settings s
      on s.organization_id=p.organization_id and s.project_id=p.project_id
    join public.project_portal_members m
      on m.organization_id=p.organization_id and m.project_id=p.project_id
     and m.user_id=requested_user_id and m.status='active'
    where p.id=requested_publication_id
      and p.status='published'
      and s.enabled
      and (
        s.extended_access_active
        or s.included_access_until is null
        or s.included_access_until > now()
      )
      and m.portal_role=any(p.audience_roles)
      and m.can_view_timeline
      and case p.source_type
        when 'checkin_summary' then m.can_view_checkins and s.share_checkins
        when 'document' then m.can_view_documents and s.share_documents
        when 'drawing' then m.can_view_documents and s.share_documents
        when 'installation' then m.can_view_installations and s.share_installation_map
        when 'weather' then s.share_weather
        else true
      end
  )
$$;

drop policy if exists project_portal_members_self_select on public.project_portal_members;
create policy project_portal_members_self_select
on public.project_portal_members
for select
to authenticated
using (
  user_id = (select auth.uid())
  and status = 'active'
  and private.portal_user_has_capability(
    organization_id,
    project_id,
    'view',
    (select auth.uid())
  )
);

-- Subscription-controlled access fields must not be writable from tenant clients.
revoke update on public.project_portal_settings from authenticated;
grant update (
  status,
  portal_name,
  welcome_text,
  enabled,
  require_review_before_publish,
  allow_customer_comments,
  allow_customer_acknowledgements,
  share_project_progress,
  share_documents,
  share_installation_map,
  share_weather,
  share_checkins,
  checkin_display_mode,
  notify_on_publication,
  updated_at
) on public.project_portal_settings to authenticated;

revoke all on function private.sync_project_portal_access_window() from public;
revoke all on function private.portal_user_has_capability(uuid, uuid, text, uuid) from public;
revoke all on function private.can_view_portal_publication(uuid, uuid) from public;
grant execute on function private.portal_user_has_capability(uuid, uuid, text, uuid) to authenticated;
grant execute on function private.can_view_portal_publication(uuid, uuid) to authenticated;
