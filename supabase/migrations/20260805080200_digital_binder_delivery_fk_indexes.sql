-- Cover the foreign keys used when Digitalpärm billing records are removed,
-- reconciled or inspected. The pipeline itself remains service-role only.

create index if not exists bynex_billing_documents_source_idx
  on private.bynex_billing_documents (source_id);

create index if not exists bynex_billing_documents_organization_idx
  on private.bynex_billing_documents (source_organization_id);

create index if not exists bynex_billing_documents_payer_idx
  on private.bynex_billing_documents (payer_user_id);
