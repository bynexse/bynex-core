-- Cover the composite delivery-job foreign key used by invoice cleanup and joins.
create index if not exists customer_invoice_delivery_jobs_invoice_fk_idx
  on public.customer_invoice_delivery_jobs(organization_id, invoice_id);
