-- Idempotent reference catalogue for clean staging/restore environments.
-- Customer, organization and accounting transaction data is intentionally absent.

insert into public.plans (
  slug, name, tagline, description, monthly_price_ex_vat,
  included_users, extra_user_price_ex_vat, trial_days,
  highlighted, active, sort_order
)
values
  ('time-payroll', 'Bynex Företag', 'Hela företagsgrunden i ett paket',
   'Bokföring, fakturering, Bynex Tid, lön och projekt för enskild firma och mindre aktiebolag.',
   439, 1, 99, 30, false, true, 10),
  ('sole-trader', 'Bynex Solo', 'Tidigare paket – inte längre till försäljning',
   'Behålls endast för historiska avtal.', 349, 1, 99, 30, false, false, 15),
  ('construction', 'Bynex Bygg', 'Byggflödet från offert till överlämning',
   'Företagsgrunden plus offert, ÄTA, material, kundportal och maskinpark.',
   899, 5, 99, 30, true, true, 20),
  ('property', 'Bynex Fastighet', 'Fastighet, service och långsiktig förvaltning',
   'Företagsgrunden plus fastighet, kundportal och maskinpark.',
   1295, 4, 199, 30, false, true, 30),
  ('complete', 'Bynex Komplett', 'Alla tillgängliga Bynex-moduler',
   'Företagsgrunden, bygg, fastighet, kundportal, material och maskinpark.',
   1499, 10, 99, 30, false, true, 40)
on conflict (slug) do update set
  name = excluded.name,
  tagline = excluded.tagline,
  description = excluded.description,
  monthly_price_ex_vat = excluded.monthly_price_ex_vat,
  included_users = excluded.included_users,
  extra_user_price_ex_vat = excluded.extra_user_price_ex_vat,
  trial_days = excluded.trial_days,
  highlighted = excluded.highlighted,
  active = excluded.active,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into public.product_modules (
  slug, name, description, product_area,
  standalone_available, beta_available, active, sort_order
)
values
  ('time_payroll', 'Bynex Tid', 'Tidrapportering, frånvaro, attest och löneunderlag.', 'workforce', true, true, true, 10),
  ('projects', 'Projekt', 'Projektstyrning, bemanning, dokumentation och uppföljning.', 'construction', true, true, true, 20),
  ('quotes', 'Offerter', 'Kalkyl, offert, kunduppgifter och digitalt godkännande.', 'commercial', true, true, true, 30),
  ('change_orders', 'ÄTA', 'ÄTA på plats, prisflöde, bevis och kundgodkännande.', 'commercial', true, true, true, 40),
  ('materials', 'Material & inköp', 'Prisunderlag, lager, inköp och stilleståndskalkyl från verifierade källor.', 'construction', true, true, true, 50),
  ('invoicing', 'Fakturering', 'Fristående faktura eller faktura från projektets underlag.', 'commercial', true, true, true, 60),
  ('customer_portal', 'Kundportal', 'Granskad projekttidslinje, dokument och godkännanden.', 'construction', true, true, true, 70),
  ('assets', 'Maskiner & tillgångar', 'QR, utlåning, placering, service och återlämning.', 'construction', false, true, true, 80),
  ('property', 'Fastighet', 'Överlämning, drift, underhåll och byggnadens digitala minne.', 'property', true, true, true, 90),
  ('bookkeeping', 'Bynex Bokföring', 'Bokföring, leverantörsfakturor, moms och SIE-import/export.', 'accounting', true, true, true, 100)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  product_area = excluded.product_area,
  standalone_available = excluded.standalone_available,
  beta_available = excluded.beta_available,
  active = excluded.active,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into public.plan_modules (plan_id, module_slug, included)
select plan.id, mapping.module_slug, true
from public.plans plan
join (values
  ('time-payroll', 'time_payroll'), ('time-payroll', 'projects'),
  ('time-payroll', 'invoicing'), ('time-payroll', 'bookkeeping'),
  ('sole-trader', 'time_payroll'), ('sole-trader', 'quotes'),
  ('sole-trader', 'invoicing'), ('sole-trader', 'bookkeeping'),
  ('construction', 'time_payroll'), ('construction', 'projects'),
  ('construction', 'quotes'), ('construction', 'change_orders'),
  ('construction', 'materials'), ('construction', 'invoicing'),
  ('construction', 'customer_portal'), ('construction', 'assets'),
  ('construction', 'bookkeeping'),
  ('property', 'property'), ('property', 'customer_portal'),
  ('property', 'assets'), ('property', 'time_payroll'),
  ('property', 'projects'), ('property', 'invoicing'),
  ('property', 'bookkeeping'),
  ('complete', 'time_payroll'), ('complete', 'projects'),
  ('complete', 'quotes'), ('complete', 'change_orders'),
  ('complete', 'materials'), ('complete', 'invoicing'),
  ('complete', 'customer_portal'), ('complete', 'assets'),
  ('complete', 'property'), ('complete', 'bookkeeping')
) as mapping(plan_slug, module_slug) on mapping.plan_slug = plan.slug
on conflict (plan_id, module_slug) do update set included = true;

insert into public.subscription_term_options (
  term_months, discount_percent, label, customer_description, highlighted, active, sort_order
)
values
  (12, 0, 'Vanligast i branschen', 'Ordinarie månadspris med 12 månaders bindningstid.', true, true, 10),
  (24, 10, 'Spara 10 %', '10 % lägre månadspris under 24 månader.', false, true, 20),
  (36, 15, 'Spara 15 %', '15 % lägre månadspris under 36 månader.', false, true, 30),
  (48, 20, 'Spara 20 %', '20 % lägre månadspris under 48 månader.', false, true, 40)
on conflict (term_months) do update set
  discount_percent = excluded.discount_percent,
  label = excluded.label,
  customer_description = excluded.customer_description,
  highlighted = excluded.highlighted,
  active = excluded.active,
  sort_order = excluded.sort_order,
  updated_at = now();

-- Only Bynex's own ledger and neutral SIE transfer are presented as usable.
-- Direct vendor, bank and authority integrations remain unseeded until verified.
insert into public.accounting_connectors (
  slug, name, vendor_name, transport, auth_mode, implementation_status,
  capabilities, official_docs_url, requires_partner_agreement,
  fallback_connector, active, sort_order
)
values
  ('bynex-bookkeeping', 'Bynex Bokföring', 'Bynex', 'api', 'none', 'available',
   array['customers','suppliers','customer_invoices','supplier_invoices','vouchers','projects','receipts'],
   null, false, false, true, 1),
  ('generic-sie4', 'SIE4', 'SIE-Gruppen', 'sie4', 'none', 'adapter_foundation',
   array['vouchers','accounts','projects','dimensions'],
   'https://sie.se/', false, true, true, 10)
on conflict (slug) do update set
  name = excluded.name,
  vendor_name = excluded.vendor_name,
  transport = excluded.transport,
  auth_mode = excluded.auth_mode,
  implementation_status = excluded.implementation_status,
  capabilities = excluded.capabilities,
  official_docs_url = excluded.official_docs_url,
  requires_partner_agreement = excluded.requires_partner_agreement,
  fallback_connector = excluded.fallback_connector,
  active = excluded.active,
  sort_order = excluded.sort_order,
  updated_at = now();
