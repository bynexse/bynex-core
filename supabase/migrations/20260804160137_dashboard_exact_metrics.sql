-- Exact, tenant-scoped dashboard aggregates. The function runs with the
-- caller's privileges so the existing table RLS remains the source of truth.

create index if not exists dashboard_project_risks_open_idx
  on public.project_risks (organization_id)
  where status <> 'closed';

create index if not exists dashboard_quotes_pending_idx
  on public.quotes (organization_id)
  where status not in ('signed', 'declined', 'expired', 'converted');

create index if not exists dashboard_change_orders_open_idx
  on public.change_orders (organization_id)
  where status not in ('completed', 'rejected');

create index if not exists dashboard_change_orders_blocked_idx
  on public.change_orders (organization_id)
  where work_start_blocked is true;

create index if not exists dashboard_customer_invoices_amounts_idx
  on public.customer_invoices (organization_id)
  include (amount_payable, amount_paid);

create index if not exists dashboard_customer_invoices_unbooked_idx
  on public.customer_invoices (organization_id)
  where status <> 'draft' and accounting_status <> 'synced';

create index if not exists dashboard_project_financials_latest_idx
  on public.project_financials (organization_id, project_id, version desc, updated_at desc)
  include (invoice_ready);

create or replace function public.get_organization_dashboard_metrics(
  requested_organization_id uuid
)
returns table (
  active_projects bigint,
  open_risks bigint,
  pending_quotes bigint,
  open_changes bigint,
  invoice_ready numeric,
  outstanding numeric,
  blocked_changes bigint,
  unbooked_invoices bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with latest_financials as (
    select distinct on (financial.project_id)
      financial.project_id,
      financial.invoice_ready
    from public.project_financials as financial
    where financial.organization_id = requested_organization_id
    order by
      financial.project_id,
      financial.version desc,
      financial.updated_at desc
  )
  select
    (
      select count(*)
      from public.projects as project
      where project.organization_id = requested_organization_id
        and project.active is true
        and project.status not in ('completed', 'cancelled')
    ) as active_projects,
    (
      select count(*)
      from public.project_risks as risk
      where risk.organization_id = requested_organization_id
        and risk.status <> 'closed'
    ) as open_risks,
    (
      select count(*)
      from public.quotes as quote
      where quote.organization_id = requested_organization_id
        and quote.status not in ('signed', 'declined', 'expired', 'converted')
    ) as pending_quotes,
    (
      select count(*)
      from public.change_orders as change_order
      where change_order.organization_id = requested_organization_id
        and change_order.status not in ('completed', 'rejected')
    ) as open_changes,
    coalesce((select sum(financial.invoice_ready) from latest_financials as financial), 0) as invoice_ready,
    (
      select coalesce(sum(greatest(invoice.amount_payable - invoice.amount_paid, 0)), 0)
      from public.customer_invoices as invoice
      where invoice.organization_id = requested_organization_id
    ) as outstanding,
    (
      select count(*)
      from public.change_orders as change_order
      where change_order.organization_id = requested_organization_id
        and change_order.work_start_blocked is true
    ) as blocked_changes,
    (
      select count(*)
      from public.customer_invoices as invoice
      where invoice.organization_id = requested_organization_id
        and invoice.status <> 'draft'
        and invoice.accounting_status <> 'synced'
    ) as unbooked_invoices;
$$;

revoke all on function public.get_organization_dashboard_metrics(uuid) from public, anon;
grant execute on function public.get_organization_dashboard_metrics(uuid) to authenticated;
