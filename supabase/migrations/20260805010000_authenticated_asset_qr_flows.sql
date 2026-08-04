begin;

-- The original QR primitives are service-only because they accept an actor id.
-- These wrappers bind that actor to auth.uid() so the web application can never
-- issue or resolve a QR code on behalf of another user.
create or replace function public.issue_asset_qr(
  p_organization_id uuid,
  p_asset_id uuid,
  p_expires_at timestamptz default null
)
returns table(qr_code_id uuid,human_code text,qr_url text)
language plpgsql
security definer
set search_path=''
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null then
    raise exception 'Inloggning krävs' using errcode='42501';
  end if;

  return query
  select result.qr_code_id,result.human_code,result.qr_url
  from public.issue_asset_qr_internal(
    caller_id,p_organization_id,p_asset_id,p_expires_at
  ) result;
end;
$$;

revoke all on function public.issue_asset_qr(uuid,uuid,timestamptz)
  from public,anon;
grant execute on function public.issue_asset_qr(uuid,uuid,timestamptz)
  to authenticated;

create or replace function public.resolve_asset_qr(
  p_qr_code_id uuid,
  p_secret text,
  p_action text default 'view',
  p_project_id uuid default null,
  p_ip_hash text default null,
  p_user_agent text default null
)
returns table(
  organization_id uuid,
  asset_id uuid,
  asset_number text,
  asset_name text,
  asset_type text,
  asset_status text
)
language plpgsql
security definer
set search_path=''
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null then
    raise exception 'Inloggning krävs' using errcode='42501';
  end if;

  return query
  select result.organization_id,result.asset_id,result.asset_number,
    result.asset_name,result.asset_type,result.asset_status
  from public.resolve_asset_qr_internal(
    p_qr_code_id,p_secret,caller_id,p_action,p_project_id,p_ip_hash,p_user_agent
  ) result;
end;
$$;

revoke all on function public.resolve_asset_qr(uuid,text,text,uuid,text,text)
  from public,anon;
grant execute on function public.resolve_asset_qr(uuid,text,text,uuid,text,text)
  to authenticated;

commit;
