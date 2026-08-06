begin;

-- Every company, including trials, receives a stable Bynex customer number
-- independently of whether a complete billing profile exists yet.
create sequence if not exists public.platform_customer_number_seq
  as bigint start with 100001 increment by 1;
revoke all on sequence public.platform_customer_number_seq from public, anon, authenticated;

alter table public.organizations
  add column if not exists customer_number text;

create or replace function private.next_platform_customer_number()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate text;
begin
  loop
    candidate := 'BYX-' || lpad(nextval('public.platform_customer_number_seq')::text, 6, '0');
    exit when not exists (
      select 1 from public.organizations organization
      where organization.customer_number = candidate
    );
  end loop;
  return candidate;
end;
$$;

update public.organizations organization
set customer_number = billing.customer_number,
    updated_at = now()
from public.organization_billing_profiles billing
where billing.organization_id = organization.id
  and organization.customer_number is null
  and billing.customer_number is not null;

do $backfill$
declare
  organization_row record;
begin
  for organization_row in
    select organization.id
    from public.organizations organization
    where organization.customer_number is null
    order by organization.created_at, organization.id
  loop
    update public.organizations organization
    set customer_number = private.next_platform_customer_number(),
        updated_at = now()
    where organization.id = organization_row.id;
  end loop;
end
$backfill$;

alter table public.organizations
  alter column customer_number set not null;

create unique index if not exists organizations_customer_number_key
  on public.organizations (customer_number);
create index if not exists organizations_customer_number_search_idx
  on public.organizations (lower(customer_number));

create or replace function private.assign_platform_customer_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if nullif(btrim(coalesce(new.customer_number, '')), '') is null then
    new.customer_number := private.next_platform_customer_number();
  else
    new.customer_number := upper(btrim(new.customer_number));
  end if;
  return new;
end;
$$;

drop trigger if exists organizations_assign_platform_customer_number
  on public.organizations;
create trigger organizations_assign_platform_customer_number
before insert on public.organizations
for each row
execute function private.assign_platform_customer_number();

create or replace function private.sync_billing_profile_customer_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select organization.customer_number
  into new.customer_number
  from public.organizations organization
  where organization.id = new.organization_id;

  if new.customer_number is null then
    raise exception 'Bynex customer number is missing' using errcode = 'P0002';
  end if;
  return new;
end;
$$;

drop trigger if exists billing_profile_sync_customer_number
  on public.organization_billing_profiles;
create trigger billing_profile_sync_customer_number
before insert or update of organization_id, customer_number
on public.organization_billing_profiles
for each row
execute function private.sync_billing_profile_customer_number();

update public.organization_billing_profiles billing
set customer_number = organization.customer_number,
    updated_at = now()
from public.organizations organization
where organization.id = billing.organization_id
  and billing.customer_number is distinct from organization.customer_number;

-- The seeded internal account must never look like a customer or demo company in HQ.
update public.organizations organization
set name = 'Bynex',
    settings = jsonb_set(
      coalesce(organization.settings, '{}'::jsonb),
      '{platform_internal}',
      'true'::jsonb,
      true
    ),
    updated_at = now()
where organization.id = '00000000-0000-4000-8000-000000000001'::uuid
   or organization.name = 'Bynex Demo';

create or replace function public.get_platform_hq_workspace(
  requested_organization_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not private.is_platform_staff(array[
    'platform_owner','platform_admin','sales','support','finance','read_only'
  ]) then
    raise exception 'Platform staff access required' using errcode = '42501';
  end if;

  insert into public.platform_admin_audit_events (staff_user_id, action, metadata)
  values (
    (select auth.uid()),
    'view_platform_hq',
    jsonb_build_object('organization_id', requested_organization_id)
  );

  select jsonb_build_object(
    'summary', jsonb_build_object(
      'customers', (
        select count(*)
        from public.organizations organization
        where organization.status <> 'deleted'
          and coalesce(organization.settings->>'platform_internal', 'false') <> 'true'
      ),
      'leads', (
        select count(*)
        from public.platform_crm_accounts account
        join public.organizations organization on organization.id = account.organization_id
        where account.lifecycle_stage in ('lead','qualified','proposal','negotiation')
          and coalesce(organization.settings->>'platform_internal', 'false') <> 'true'
      ),
      'enterprise_proposals', (
        select count(*)
        from public.platform_pricing_proposals proposal
        where proposal.status in ('draft','internal_review','sent')
      ),
      'active_contracts', (
        select count(*) from public.platform_contracts contract
        where contract.status in ('signed','active')
      ),
      'open_tasks', (
        select count(*) from public.platform_crm_activities activity
        where activity.due_at is not null and activity.completed_at is null
      ),
      'active_subscriptions', (
        select count(*)
        from public.organizations organization
        join lateral (
          select candidate.status
          from public.organization_subscriptions candidate
          where candidate.organization_id = organization.id
          order by candidate.created_at desc
          limit 1
        ) subscription on true
        where subscription.status = 'active'
          and coalesce(organization.settings->>'platform_internal', 'false') <> 'true'
      ),
      'trials', (
        select count(*)
        from public.organizations organization
        join lateral (
          select candidate.status
          from public.organization_subscriptions candidate
          where candidate.organization_id = organization.id
          order by candidate.created_at desc
          limit 1
        ) subscription on true
        where subscription.status = 'trialing'
          and coalesce(organization.settings->>'platform_internal', 'false') <> 'true'
      ),
      'past_due_subscriptions', (
        select count(*)
        from public.organizations organization
        join lateral (
          select candidate.status
          from public.organization_subscriptions candidate
          where candidate.organization_id = organization.id
          order by candidate.created_at desc
          limit 1
        ) subscription on true
        where subscription.status = 'past_due'
          and coalesce(organization.settings->>'platform_internal', 'false') <> 'true'
      ),
      'monthly_recurring_revenue_ex_vat', coalesce((
        select round(sum(
          agreement.net_monthly_price_ex_vat
          + greatest(subscription.seat_count - agreement.included_users, 0)
            * agreement.net_extra_user_price_ex_vat
        ), 2)
        from public.organizations organization
        join lateral (
          select candidate.*
          from public.organization_subscriptions candidate
          where candidate.organization_id = organization.id
          order by candidate.created_at desc
          limit 1
        ) subscription on true
        join lateral (
          select candidate.*
          from public.subscription_agreements candidate
          where candidate.organization_id = organization.id
            and candidate.subscription_id = subscription.id
            and candidate.status = 'active'
          order by candidate.created_at desc
          limit 1
        ) agreement on true
        where subscription.status in ('active','past_due')
          and coalesce(organization.settings->>'platform_internal', 'false') <> 'true'
      ), 0),
      'outstanding_inc_vat', coalesce((
        select round(sum(greatest(invoice.amount_inc_vat - invoice.amount_paid, 0)), 2)
        from public.subscription_invoices invoice
        join public.organizations organization on organization.id = invoice.organization_id
        where invoice.document_type = 'invoice'
          and invoice.status not in ('void','credited','paid')
          and coalesce(organization.settings->>'platform_internal', 'false') <> 'true'
      ), 0),
      'open_support_cases', (
        select count(*)
        from public.platform_support_cases support_case
        join public.organizations organization on organization.id = support_case.organization_id
        where support_case.status not in ('resolved','closed')
          and coalesce(organization.settings->>'platform_internal', 'false') <> 'true'
      )
    ),
    'organizations', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.created_at desc)
      from (
        select
          organization.id,
          organization.name,
          organization.customer_number,
          organization.organization_number,
          organization.business_form,
          organization.status,
          organization.created_at,
          crm.lifecycle_stage,
          crm.account_status,
          crm.health_score,
          crm.next_action_at,
          crm.tags,
          subscription.id as subscription_id,
          subscription.status as subscription_status,
          subscription.seat_count,
          subscription.trial_ends_at,
          plan.id as plan_id,
          plan.name as plan_name,
          coalesce(billing.billing_email, primary_contact.email) as billing_email,
          primary_contact.full_name as primary_contact_name,
          primary_contact.email as primary_email,
          primary_contact.phone as primary_phone,
          billing.auto_invoice_enabled,
          coalesce(member_count.total, 0) as member_count,
          coalesce(invoice_stats.outstanding, 0) as outstanding_inc_vat,
          invoice_stats.last_invoice_date
        from public.organizations organization
        left join public.platform_crm_accounts crm
          on crm.organization_id = organization.id
        left join lateral (
          select candidate.*
          from public.organization_subscriptions candidate
          where candidate.organization_id = organization.id
          order by candidate.created_at desc
          limit 1
        ) subscription on true
        left join public.plans plan on plan.id = subscription.plan_id
        left join public.organization_billing_profiles billing
          on billing.organization_id = organization.id
        left join lateral (
          select contact.full_name, contact.email, contact.phone
          from public.platform_crm_contacts contact
          where contact.organization_id = organization.id
          order by contact.primary_contact desc, contact.created_at desc
          limit 1
        ) primary_contact on true
        left join lateral (
          select count(*) as total
          from public.organization_members member
          where member.organization_id = organization.id and member.active
        ) member_count on true
        left join lateral (
          select
            coalesce(sum(greatest(invoice.amount_inc_vat - invoice.amount_paid, 0)), 0)
              as outstanding,
            max(invoice.invoice_date) as last_invoice_date
          from public.subscription_invoices invoice
          where invoice.organization_id = organization.id
            and invoice.status not in ('void','credited')
        ) invoice_stats on true
        where organization.status <> 'deleted'
          and coalesce(organization.settings->>'platform_internal', 'false') <> 'true'
        order by organization.created_at desc
        limit 1000
      ) item
    ), '[]'::jsonb),
    'support_queue', coalesce((
      select jsonb_agg(to_jsonb(queue_item) order by
        case queue_item.priority
          when 'urgent' then 1
          when 'high' then 2
          when 'normal' then 3
          else 4
        end,
        queue_item.updated_at desc
      )
      from (
        select
          support_case.id,
          support_case.organization_id,
          organization.name as organization_name,
          organization.customer_number,
          support_case.category,
          support_case.subject,
          support_case.description,
          support_case.priority,
          support_case.status,
          support_case.assigned_to_user_id,
          assigned_profile.full_name as assigned_to_name,
          support_case.first_response_due_at,
          support_case.resolution_due_at,
          support_case.first_responded_at,
          support_case.resolved_at,
          support_case.created_at,
          support_case.updated_at
        from public.platform_support_cases support_case
        join public.organizations organization
          on organization.id = support_case.organization_id
        left join public.profiles assigned_profile
          on assigned_profile.user_id = support_case.assigned_to_user_id
        where coalesce(organization.settings->>'platform_internal', 'false') <> 'true'
        order by support_case.updated_at desc
        limit 500
      ) queue_item
    ), '[]'::jsonb),
    'selected', case
      when requested_organization_id is null then null
      else jsonb_build_object(
        'organization', (
          select to_jsonb(organization)
          from public.organizations organization
          where organization.id = requested_organization_id
        ),
        'crm', (
          select to_jsonb(account)
          from public.platform_crm_accounts account
          where account.organization_id = requested_organization_id
        ),
        'billing_profile', (
          select to_jsonb(profile)
          from public.organization_billing_profiles profile
          where profile.organization_id = requested_organization_id
        ),
        'subscription', (
          select to_jsonb(subscription) || jsonb_build_object('plan_name', plan.name)
          from public.organization_subscriptions subscription
          join public.plans plan on plan.id = subscription.plan_id
          where subscription.organization_id = requested_organization_id
          order by subscription.created_at desc
          limit 1
        ),
        'contacts', coalesce((
          select jsonb_agg(to_jsonb(contact) order by
            contact.primary_contact desc,
            contact.created_at desc
          )
          from public.platform_crm_contacts contact
          where contact.organization_id = requested_organization_id
        ), '[]'::jsonb),
        'activities', coalesce((
          select jsonb_agg(to_jsonb(activity) order by activity.occurred_at desc, activity.id desc)
          from (
            select *
            from public.platform_crm_activities
            where organization_id = requested_organization_id
            order by occurred_at desc
            limit 200
          ) activity
        ), '[]'::jsonb),
        'proposals', coalesce((
          select jsonb_agg(to_jsonb(proposal) order by proposal.created_at desc)
          from public.platform_pricing_proposals proposal
          where proposal.organization_id = requested_organization_id
        ), '[]'::jsonb),
        'contracts', coalesce((
          select jsonb_agg(to_jsonb(contract) order by contract.created_at desc)
          from public.platform_contracts contract
          where contract.organization_id = requested_organization_id
        ), '[]'::jsonb),
        'agreements', coalesce((
          select jsonb_agg(
            to_jsonb(agreement) || jsonb_build_object('plan_name', plan.name)
            order by agreement.created_at desc
          )
          from public.subscription_agreements agreement
          join public.plans plan on plan.id = agreement.plan_id
          where agreement.organization_id = requested_organization_id
        ), '[]'::jsonb),
        'invoices', coalesce((
          select jsonb_agg(to_jsonb(invoice) order by invoice.invoice_date desc, invoice.created_at desc)
          from (
            select *
            from public.subscription_invoices
            where organization_id = requested_organization_id
            order by invoice_date desc, created_at desc
            limit 200
          ) invoice
        ), '[]'::jsonb),
        'support_cases', coalesce((
          select jsonb_agg(to_jsonb(support_case) order by support_case.created_at desc)
          from public.platform_support_cases support_case
          where support_case.organization_id = requested_organization_id
        ), '[]'::jsonb)
      )
    end,
    'catalog', jsonb_build_object(
      'plans', coalesce((
        select jsonb_agg(
          to_jsonb(plan) || jsonb_build_object(
            'module_slugs', coalesce((
              select jsonb_agg(plan_module.module_slug order by module.sort_order, module.name)
              from public.plan_modules plan_module
              join public.product_modules module on module.slug = plan_module.module_slug
              where plan_module.plan_id = plan.id and plan_module.included
            ), '[]'::jsonb),
            'module_names', coalesce((
              select jsonb_agg(module.name order by module.sort_order, module.name)
              from public.plan_modules plan_module
              join public.product_modules module on module.slug = plan_module.module_slug
              where plan_module.plan_id = plan.id and plan_module.included
            ), '[]'::jsonb)
          )
          order by plan.sort_order, plan.name
        )
        from public.plans plan
        where plan.active
      ), '[]'::jsonb),
      'modules', coalesce((
        select jsonb_agg(to_jsonb(module) order by module.sort_order, module.name)
        from public.product_modules module
        where module.active
      ), '[]'::jsonb),
      'terms', coalesce((
        select jsonb_agg(to_jsonb(term) order by term.sort_order)
        from public.subscription_term_options term
        where term.active
      ), '[]'::jsonb)
    ),
    'recent_audit', coalesce((
      select jsonb_agg(to_jsonb(audit_item) order by audit_item.created_at desc, audit_item.id desc)
      from (
        select
          event.*,
          profile.full_name as staff_name,
          profile.email as staff_email
        from public.platform_admin_audit_events event
        left join public.profiles profile on profile.user_id = event.staff_user_id
        order by event.created_at desc, event.id desc
        limit 200
      ) audit_item
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

create or replace function public.get_platform_hq_management()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_staff(array[
    'platform_owner','platform_admin','sales','support','finance','read_only'
  ]) then
    raise exception 'Platform staff access required' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'staff', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.active desc, item.role, item.full_name)
      from (
        select
          staff.user_id,
          staff.role,
          staff.active,
          staff.granted_at,
          staff.last_reviewed_at,
          profile.full_name,
          profile.email,
          profile.avatar_url
        from public.platform_staff staff
        left join public.profiles profile on profile.user_id = staff.user_id
      ) item
    ), '[]'::jsonb),
    -- Never expose every customer's account as a possible Bynex employee.
    'candidate_users', '[]'::jsonb,
    'approvals', coalesce((
      select jsonb_agg(to_jsonb(approval) order by approval.requested_at desc)
      from public.platform_hq_approval_requests approval
      where approval.status = 'pending'
         or approval.requested_at >= now() - interval '180 days'
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.platform_set_staff_access_by_email(
  p_email text,
  p_role text,
  p_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user_id uuid;
  actor_role text;
begin
  select staff.role into actor_role
  from public.platform_staff staff
  where staff.user_id = (select auth.uid()) and staff.active;

  if actor_role <> 'platform_owner' then
    raise exception 'Platform owner access required' using errcode = '42501';
  end if;
  if lower(btrim(coalesce(p_email, ''))) !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$'
    or p_role not in ('platform_owner','platform_admin','sales','support','finance','read_only')
  then
    raise exception 'Kontrollera Bynex-medarbetarens e-post och roll' using errcode = '22023';
  end if;

  select account.id into target_user_id
  from auth.users account
  where lower(account.email) = lower(btrim(p_email))
    and account.email_confirmed_at is not null
  limit 1;

  if target_user_id is null then
    raise exception 'Användaren måste först ha ett verifierat Bynex-konto' using errcode = 'P0002';
  end if;

  perform public.platform_set_staff_access(target_user_id, p_role, p_active);
  return target_user_id;
end;
$$;

create or replace function public.get_platform_hq_billing(
  requested_organization_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text;
begin
  select staff.role into caller_role
  from public.platform_staff staff
  where staff.user_id = (select auth.uid()) and staff.active;

  if caller_role is null then
    raise exception 'Platform staff access required' using errcode = '42501';
  end if;

  if caller_role not in ('platform_owner','platform_admin','finance') then
    return jsonb_build_object(
      'restricted', true,
      'discounts', '[]'::jsonb,
      'manual_charges', '[]'::jsonb,
      'payments', '[]'::jsonb,
      'credit_notes', '[]'::jsonb,
      'delivery_jobs', '[]'::jsonb,
      'organization_balances', '[]'::jsonb
    );
  end if;

  return jsonb_build_object(
    'restricted', false,
    'discounts', coalesce((
      select jsonb_agg(to_jsonb(discount) order by discount.created_at desc)
      from public.platform_subscription_discounts discount
      where requested_organization_id is null
        or discount.organization_id = requested_organization_id
    ), '[]'::jsonb),
    'manual_charges', coalesce((
      select jsonb_agg(to_jsonb(charge) order by charge.created_at desc)
      from public.platform_manual_subscription_charges charge
      where requested_organization_id is null
        or charge.organization_id = requested_organization_id
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(to_jsonb(payment) order by payment.payment_date desc, payment.created_at desc)
      from public.platform_subscription_payments payment
      where requested_organization_id is null
        or payment.organization_id = requested_organization_id
    ), '[]'::jsonb),
    'credit_notes', coalesce((
      select jsonb_agg(to_jsonb(invoice) order by invoice.invoice_date desc, invoice.created_at desc)
      from public.subscription_invoices invoice
      where invoice.document_type = 'credit_note'
        and (
          requested_organization_id is null
          or invoice.organization_id = requested_organization_id
        )
    ), '[]'::jsonb),
    'delivery_jobs', coalesce((
      select jsonb_agg(to_jsonb(job) order by job.created_at desc)
      from (
        select candidate.*
        from public.subscription_invoice_delivery_jobs candidate
        where requested_organization_id is null
          or candidate.organization_id = requested_organization_id
        order by candidate.created_at desc
        limit 300
      ) job
    ), '[]'::jsonb),
    'organization_balances', coalesce((
      select jsonb_agg(to_jsonb(balance) order by balance.outstanding_inc_vat desc, balance.organization_id)
      from (
        select
          organization.id as organization_id,
          coalesce(sum(
            case
              when invoice.id is null
                or invoice.document_type <> 'invoice'
                or invoice.status in ('void','credited') then 0
              else greatest(
                invoice.amount_inc_vat
                  - invoice.amount_paid
                  - coalesce(credit.total_inc_vat, 0),
                0
              )
            end
          ), 0) as outstanding_inc_vat
        from public.organizations organization
        left join public.subscription_invoices invoice
          on invoice.organization_id = organization.id
        left join lateral (
          select coalesce(sum(note.amount_inc_vat), 0) as total_inc_vat
          from public.subscription_invoices note
          where note.document_type = 'credit_note'
            and note.credited_invoice_id = invoice.id
            and note.status <> 'void'
        ) credit on true
        where (
          requested_organization_id is null
          or organization.id = requested_organization_id
        )
          and coalesce(organization.settings->>'platform_internal', 'false') <> 'true'
        group by organization.id
      ) balance
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function private.next_platform_customer_number() from public, anon, authenticated;
revoke all on function public.get_platform_hq_workspace(uuid) from public, anon;
revoke all on function public.get_platform_hq_management() from public, anon;
revoke all on function public.platform_set_staff_access_by_email(text,text,boolean)
  from public, anon;
revoke all on function public.get_platform_hq_billing(uuid) from public, anon;

grant execute on function public.get_platform_hq_workspace(uuid) to authenticated;
grant execute on function public.get_platform_hq_management() to authenticated;
grant execute on function public.platform_set_staff_access_by_email(text,text,boolean)
  to authenticated;
grant execute on function public.get_platform_hq_billing(uuid) to authenticated;

select pg_notify('pgrst', 'reload schema');

commit;
