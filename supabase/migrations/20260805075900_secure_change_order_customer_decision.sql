begin;

create or replace function public.create_change_order_customer_link(
  p_organization_id uuid,
  p_change_order_id uuid,
  p_version_id uuid,
  p_valid_days integer default 14
)
returns table(approval_url text, content_hash text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_hash text;
begin
  if not private.has_organization_role(
    p_organization_id,array['owner','admin','office','manager']::text[],(select auth.uid())
  ) then raise exception 'Behörighet saknas' using errcode='42501'; end if;
  if p_valid_days not between 1 and 30 then
    raise exception 'Giltighetstiden måste vara 1–30 dagar' using errcode='22023';
  end if;

  select x.approval_url,x.content_hash into v_url,v_hash
  from public.create_change_order_approval_link_internal(
    (select auth.uid()),p_organization_id,p_change_order_id,p_version_id,
    now() + make_interval(days => p_valid_days)
  ) x;

  return query select
    regexp_replace(v_url,'^https://app\.bynex\.se/ata/godkann/','https://bynex.se/ata/'),
    v_hash;
end;
$$;
revoke all on function public.create_change_order_customer_link(uuid,uuid,uuid,integer) from public,anon;
grant execute on function public.create_change_order_customer_link(uuid,uuid,uuid,integer) to authenticated;

create or replace function public.get_change_order_customer_decision_payload(
  p_version_id uuid,
  p_secret text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token record;
  v_payload jsonb;
begin
  if char_length(coalesce(p_secret,'')) <> 64 then return null; end if;
  select t.* into v_token
  from private.change_order_approval_tokens t
  where t.change_order_version_id=p_version_id
    and t.token_hash=encode(extensions.digest(p_secret,'sha256'),'hex')
    and t.used_at is null and t.expires_at>now();
  if v_token.id is null then return null; end if;

  select jsonb_build_object(
    'organization_name',o.name,
    'change_order_number',c.change_order_number,
    'project_name',p.name,
    'project_number',p.project_number,
    'customer_name',c.customer_name,
    'expires_at',v_token.expires_at,
    'version',jsonb_build_object(
      'id',v.id,'version_number',v.version_number,'title',v.title,
      'customer_description',v.customer_description,'currency',v.currency,
      'vat_percent',v.vat_percent,'labor_hours',v.labor_hours,
      'price_ex_vat',v.price_ex_vat,'vat_amount',v.vat_amount,
      'price_inc_vat',v.price_inc_vat,'estimated_working_days',v.estimated_working_days,
      'proposed_start_date',v.proposed_start_date,'proposed_end_date',v.proposed_end_date,
      'assumptions',v.assumptions,'exclusions',v.exclusions,
      'price_type',v.price_type,'price_disclaimer',v.price_disclaimer,
      'content_hash',v.content_hash
    ),
    'lines',coalesce((select jsonb_agg(jsonb_build_object(
      'category',li.category,'description',li.description,'quantity',li.quantity,
      'unit',li.unit,'sell_amount',li.sell_amount
    ) order by li.sort_order,li.id)
    from public.change_order_line_items li
    where li.organization_id=v_token.organization_id
      and li.change_order_version_id=p_version_id),'[]'::jsonb)
  ) into v_payload
  from public.change_order_versions v
  join public.change_orders c on c.organization_id=v.organization_id and c.id=v.change_order_id
  join public.organizations o on o.id=v.organization_id
  join public.projects p on p.organization_id=c.organization_id and p.id=c.project_id
  where v.organization_id=v_token.organization_id and v.id=p_version_id
    and v.change_order_id=v_token.change_order_id and v.status='customer_review'
    and v.frozen_at is not null and v.content_hash is not null;
  return v_payload;
end;
$$;
revoke all on function public.get_change_order_customer_decision_payload(uuid,text) from public,authenticated;
grant execute on function public.get_change_order_customer_decision_payload(uuid,text) to anon;

create or replace function public.submit_change_order_customer_decision(
  p_version_id uuid,
  p_secret text,
  p_decision text,
  p_signer_name text,
  p_signer_email text,
  p_customer_comment text,
  p_ip_hash text,
  p_user_agent text
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select public.decide_change_order_approval_internal(
    p_version_id,p_secret,p_decision,p_signer_name,p_signer_email,
    p_customer_comment,p_ip_hash,p_user_agent
  )
$$;
revoke all on function public.submit_change_order_customer_decision(uuid,text,text,text,text,text,text,text) from public,authenticated;
grant execute on function public.submit_change_order_customer_decision(uuid,text,text,text,text,text,text,text) to anon;

commit;
