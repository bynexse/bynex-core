begin;

-- New self-service trials use the current 14-day commercial policy.
-- Existing organization_subscriptions keep their already promised trial_ends_at.
update public.plans
set trial_days = 14,
    updated_at = now()
where slug in ('time-payroll', 'construction', 'property', 'complete')
  and trial_days is distinct from 14;

-- Keep the product catalogue consistent with the customer-facing Bynex menu.
update public.product_modules as module
set name = catalogue.name,
    description = catalogue.description,
    updated_at = now()
from (values
  ('time_payroll', 'Bynex Tid',
   'Tidrapportering, frånvaro, attest, anställningskort och löneunderlag.'),
  ('projects', 'Bynex Projekt',
   'Projektstyrning, bemanning, byggdagbok, dokumentation och uppföljning.'),
  ('quotes', 'Bynex Offert',
   'Kalkyl, offert, kunduppgifter och spårbart digitalt godkännande.'),
  ('change_orders', 'Bynex ÄTA',
   'ÄTA på plats, Bynex Smart prisunderlag, bevis och kundbeslut.'),
  ('materials', 'Bynex Material',
   'Prislistor, artiklar, lager, inköp och stilleståndskalkyl.'),
  ('invoicing', 'Bynex Faktura',
   'Fristående faktura eller faktura från projektets granskade underlag.'),
  ('customer_portal', 'Bynex Pärmen',
   'Granskad projekttidslinje, byggdagbok, dokument och godkännanden.'),
  ('assets', 'Bynex Maskiner',
   'QR-koder, utlåning, placering, service och återlämning.'),
  ('property', 'Bynex Fastighet',
   'Fastigheter, service, drift, underhåll och byggnadens digitala minne.'),
  ('bookkeeping', 'Bynex Bokföring',
   'Bokföring, leverantörsfakturor, moms och SIE-import eller export.')
) as catalogue(slug, name, description)
where module.slug = catalogue.slug
  and (
    module.name is distinct from catalogue.name
    or module.description is distinct from catalogue.description
  );

select pg_notify('pgrst', 'reload schema');

commit;
