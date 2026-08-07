begin;

create or replace function public.allocate_customer_number(
  p_organization_id uuid,
  p_prefix text default 'K'
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_prefix text := upper(btrim(coalesce(p_prefix, 'K')));
  next_number integer;
  candidate text;
begin
  if not private.has_organization_role(
    p_organization_id,
    array['owner','admin','office']::text[],
    (select auth.uid())
  ) then
    raise exception 'Behörighet saknas' using errcode='42501';
  end if;

  if normalized_prefix !~ '^[A-Z0-9-]{1,12}$' then
    raise exception 'Ogiltigt kundnummerprefix' using errcode='22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_organization_id::text || ':customer-number', 20260807)
  );

  select coalesce(max(
    case
      when customer_number ~ ('^' || normalized_prefix || '[0-9]+$')
      then substring(customer_number from char_length(normalized_prefix) + 1)::integer
      else null
    end
  ), 0) + 1
  into next_number
  from public.customers
  where organization_id = p_organization_id;

  loop
    candidate := normalized_prefix || lpad(next_number::text, 4, '0');
    exit when not exists (
      select 1
      from public.customers
      where organization_id = p_organization_id
        and customer_number = candidate
    );
    next_number := next_number + 1;
  end loop;

  return candidate;
end;
$$;

revoke all on function public.allocate_customer_number(uuid, text) from public, anon;
grant execute on function public.allocate_customer_number(uuid, text) to authenticated, service_role;

create or replace function public.populate_invoice_from_project(
  p_organization_id uuid,
  p_invoice_id uuid,
  p_include_change_orders boolean default true,
  p_include_approved_time boolean default true,
  p_include_delivered_material boolean default true
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv record;
  settings record;
  item record;
  next_line integer;
  added integer := 0;
  quantity_hours numeric(14,4);
  unit_price numeric(14,4);
  amount_snapshot numeric(14,2);
begin
  if not private.has_organization_role(
    p_organization_id,
    array['owner','admin','office']::text[],
    (select auth.uid())
  ) then
    raise exception 'Behörighet saknas' using errcode='42501';
  end if;

  select * into inv
  from public.customer_invoices
  where organization_id=p_organization_id
    and id=p_invoice_id
    and status='draft'
  for update;

  if inv.id is null or inv.project_id is null then
    raise exception 'Fakturautkast med projekt krävs' using errcode='P0002';
  end if;

  select * into settings
  from public.project_billing_settings
  where organization_id=p_organization_id
    and project_id=inv.project_id;

  select coalesce(max(line_number),0)+1 into next_line
  from public.customer_invoice_lines
  where organization_id=p_organization_id
    and invoice_id=p_invoice_id;

  if p_include_change_orders then
    for item in
      select c.*
      from public.change_orders c
      where c.organization_id=p_organization_id
        and c.project_id=inv.project_id
        and c.status in ('approved','in_progress','completed','invoice_ready')
        and c.price_status='customer_approved'
        and c.price_amount>0
        and not exists(
          select 1
          from public.customer_invoice_source_links l
          where l.organization_id=p_organization_id
            and l.source_type='change_order'
            and l.source_id=c.id
        )
      order by c.change_order_number
    loop
      insert into public.customer_invoice_lines(
        organization_id,invoice_id,line_number,item_code,description,quantity,unit,
        unit_price_ex_vat,vat_rate,cost_category,source_type,source_id
      ) values(
        p_organization_id,p_invoice_id,next_line,'ATA-'||item.change_order_number,
        'ÄTA: '||item.title,1,'st',item.price_amount,coalesce(settings.default_vat_rate,25),
        'other','change_order',item.id
      );
      insert into public.customer_invoice_source_links(
        organization_id,invoice_id,source_type,source_id,amount_ex_vat_snapshot
      ) values(p_organization_id,p_invoice_id,'change_order',item.id,item.price_amount);
      next_line:=next_line+1;
      added:=added+1;
    end loop;
  end if;

  if p_include_approved_time
     and settings.default_hourly_rate_ex_vat is not null
     and settings.default_hourly_rate_ex_vat > 0
     and coalesce(settings.time_rounding_minutes,0) > 0 then
    for item in
      select t.*,w.full_name
      from public.time_entries t
      join public.workers w
        on w.organization_id=t.organization_id
       and w.id=t.worker_id
      where t.organization_id=p_organization_id
        and t.project_id=inv.project_id
        and t.status='approved'
        and t.clock_out is not null
        and not exists(
          select 1
          from public.customer_invoice_source_links l
          where l.organization_id=p_organization_id
            and l.source_type='time_entry'
            and l.source_id=t.id
        )
      order by t.clock_in
    loop
      quantity_hours:=ceil((extract(epoch from (item.clock_out-item.clock_in))/60)
        /settings.time_rounding_minutes)*settings.time_rounding_minutes/60;
      amount_snapshot:=round(quantity_hours*settings.default_hourly_rate_ex_vat,2);
      insert into public.customer_invoice_lines(
        organization_id,invoice_id,line_number,description,quantity,unit,
        unit_price_ex_vat,vat_rate,cost_category,tax_deduction_eligible,source_type,source_id
      ) values(
        p_organization_id,p_invoice_id,next_line,
        'Arbete '||item.full_name||' '||to_char(item.clock_in,'YYYY-MM-DD'),
        quantity_hours,'tim',settings.default_hourly_rate_ex_vat,coalesce(settings.default_vat_rate,25),
        'labor',true,'time_entry',item.id
      );
      insert into public.customer_invoice_source_links(
        organization_id,invoice_id,source_type,source_id,amount_ex_vat_snapshot
      ) values(p_organization_id,p_invoice_id,'time_entry',item.id,amount_snapshot);
      next_line:=next_line+1;
      added:=added+1;
    end loop;
  end if;

  if p_include_delivered_material then
    for item in
      select m.*
      from public.material_items m
      where m.organization_id=p_organization_id
        and m.project_id=inv.project_id
        and m.status='delivered'
        and m.quantity>0
        and m.unit_price>=0
        and not exists(
          select 1
          from public.customer_invoice_source_links l
          where l.organization_id=p_organization_id
            and l.source_type='material_item'
            and l.source_id=m.id
        )
      order by m.created_at
    loop
      unit_price:=round(item.unit_price*(1+coalesce(settings.material_markup_percent,0)/100),4);
      amount_snapshot:=round(item.quantity*unit_price,2);
      insert into public.customer_invoice_lines(
        organization_id,invoice_id,line_number,item_code,description,quantity,unit,
        unit_price_ex_vat,vat_rate,cost_category,source_type,source_id
      ) values(
        p_organization_id,p_invoice_id,next_line,item.article_number,item.name,
        item.quantity,item.unit,unit_price,coalesce(settings.default_vat_rate,25),
        'material','material_item',item.id
      );
      insert into public.customer_invoice_source_links(
        organization_id,invoice_id,source_type,source_id,amount_ex_vat_snapshot
      ) values(p_organization_id,p_invoice_id,'material_item',item.id,amount_snapshot);
      next_line:=next_line+1;
      added:=added+1;
    end loop;
  end if;

  if added>0 then
    update public.customer_invoices
    set source_mode='project',updated_at=now()
    where id=p_invoice_id
      and organization_id=p_organization_id;

    insert into public.customer_invoice_events(
      organization_id,invoice_id,event_type,actor_user_id,safe_summary,metadata
    ) values(
      p_organization_id,p_invoice_id,'source_added',(select auth.uid()),
      'Tillgängliga projektunderlag tillagda',jsonb_build_object('source_count',added)
    );
  end if;

  return added;
end;
$$;

select pg_notify('pgrst', 'reload schema');

commit;
