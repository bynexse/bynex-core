begin;

do $guard$
begin
  if not exists (
    select 1
    from public.account_plan_catalogs catalog
    where catalog.id = 'b1e00000-2026-4000-8000-000000000002'::uuid
      and catalog.catalog_code = 'BYNEX-STANDARD'
      and catalog.version_label = '2026.1'
      and catalog.status = 'draft'
  ) then
    raise exception 'Bynex standardkontoplan måste vara i utkastläge före inläsning'
      using errcode = 'P0002';
  end if;
end;
$guard$;

with source (
  account_number,
  name,
  account_type,
  normal_balance,
  vat_code,
  category,
  synonym_text
) as (
  values
    ('5010','Lokalhyra','expense','debit','25','lokalkostnader','hyra kontor|verkstadshyra'),
    ('5020','El i lokaler','expense','debit','25','lokalkostnader','lokalel|elräkning'),
    ('5030','Värme och kyla i lokaler','expense','debit','25','lokalkostnader','fjärrvärme|kyla lokal'),
    ('5040','Vatten och avlopp i lokaler','expense','debit','25','lokalkostnader','va lokal|vattenräkning'),
    ('5050','Städning och lokalvård','expense','debit','25','lokalkostnader','städfirma|lokalvård'),
    ('5060','Reparation och underhåll av lokaler','expense','debit','25','lokalkostnader','lokalreparation|underhåll lokal'),
    ('5070','Larm, bevakning och passersystem','expense','debit','25','lokalkostnader','larm|bevakning|passersystem'),
    ('5080','Fastighetsrelaterade serviceavtal','expense','debit','25','lokalkostnader','serviceavtal fastighet'),
    ('5090','Övriga lokalkostnader','expense','debit','25','lokalkostnader','lokalkostnad|kontorskostnad'),
    ('5110','Drift av egen fastighet','expense','debit','25','fastighetskostnader','fastighetsdrift|egen fastighet'),
    ('5120','Fastighetsavgift och fastighetsskatt','expense','debit',null,'fastighetskostnader','fastighetsskatt|fastighetsavgift'),
    ('5130','Reparation och underhåll av egen fastighet','expense','debit','25','fastighetskostnader','fastighetsunderhåll|fastighetsreparation'),
    ('5140','Snöröjning och markskötsel','expense','debit','25','fastighetskostnader','snöröjning|markskötsel'),
    ('5190','Övriga fastighetskostnader','expense','debit','25','fastighetskostnader','fastighetskostnad'),
    ('5210','Hyra av maskiner','expense','debit','25','hyror och leasing','maskinhyra|hyrmaskin'),
    ('5220','Hyra av verktyg och mätutrustning','expense','debit','25','hyror och leasing','verktygshyra|mätinstrument hyra'),
    ('5230','Hyra av fordon','expense','debit','25','hyror och leasing','bilhyra|fordonshyra'),
    ('5240','Hyra och leasing av IT-utrustning','expense','debit','25','hyror och leasing','datorleasing|it-hyra'),
    ('5250','Hyra av kontorsutrustning','expense','debit','25','hyror och leasing','skrivarhyra|kopiatorleasing'),
    ('5290','Övriga hyror och leasingkostnader','expense','debit','25','hyror och leasing','leasing|hyreskostnad'),
    ('5410','Mindre verktyg och förbrukningsinventarier','expense','debit','25','förbrukningsinventarier och material','småverktyg|förbrukningsinventarie|borrmaskin'),
    ('5420','Programvara, molntjänster och appar','expense','debit','25','förbrukningsinventarier och material','saas|programlicens|app|molntjänst'),
    ('5430','Arbetskläder och personlig skyddsutrustning','expense','debit','25','förbrukningsinventarier och material','arbetskläder|skyddsskor|hjälm|ppe'),
    ('5440','Mindre kontors- och IT-utrustning','expense','debit','25','förbrukningsinventarier och material','skärm|tangentbord|mobiltelefon'),
    ('5450','Verkstads- och servicematerial','expense','debit','25','förbrukningsinventarier och material','verkstadsmaterial|serviceförbrukning'),
    ('5460','Reservdelar och utbyteskomponenter','expense','debit','25','förbrukningsinventarier och material','reservdel|utbytesdel'),
    ('5470','Mät- och kontrollmaterial','expense','debit','25','förbrukningsinventarier och material','mätmaterial|kontrollutrustning'),
    ('5490','Övriga förbrukningsartiklar','expense','debit','25','förbrukningsinventarier och material','förbrukningsvara|övrigt material'),
    ('5510','Reparation och service av maskiner','expense','debit','25','reparation och underhåll','maskinservice|maskinreparation'),
    ('5520','Reparation och service av verktyg','expense','debit','25','reparation och underhåll','verktygsservice|verktygsreparation'),
    ('5530','Reparation och service av annan utrustning','expense','debit','25','reparation och underhåll','utrustningsservice'),
    ('5540','Kalibrering, kontroll och besiktning av utrustning','expense','debit','25','reparation och underhåll','kalibrering|maskinbesiktning'),
    ('5590','Övrigt underhåll av inventarier','expense','debit','25','reparation och underhåll','inventarieunderhåll'),
    ('5610','Drivmedel och laddning för fordon','expense','debit','25','fordonskostnader','diesel|bensin|elbilsladdning'),
    ('5620','Service och reparation av fordon','expense','debit','25','fordonskostnader','bilservice|fordonsreparation'),
    ('5630','Fordonsförsäkring','expense','debit',null,'fordonskostnader','bilförsäkring|maskinförsäkring fordon'),
    ('5640','Leasing av fordon','expense','debit','25','fordonskostnader','billeasing|fordonsleasing'),
    ('5650','Fordonsskatt och vägavgifter','expense','debit',null,'fordonskostnader','fordonsskatt|vägavgift'),
    ('5660','Parkering, trängselskatt och broavgifter','expense','debit',null,'fordonskostnader','parkering|trängselskatt|broavgift'),
    ('5670','Däck, tvätt och fordonsvård','expense','debit','25','fordonskostnader','däck|biltvätt|fordonsvård'),
    ('5680','Självrisk och skadekostnader för fordon','expense','debit','25','fordonskostnader','självrisk bil|fordonsskada'),
    ('5690','Övriga fordonskostnader','expense','debit','25','fordonskostnader','bilkostnad|fordonskostnad'),
    ('5710','Frakt och godstransport','expense','debit','25','transporter','frakt|transport gods'),
    ('5720','Bud, kurir och expressleverans','expense','debit','25','transporter','bud|kurir|expressfrakt'),
    ('5730','Tullhantering och spedition','expense','debit','25','transporter','spedition|tullhantering'),
    ('5740','Avfallstransport och containerlogistik','expense','debit','25','transporter','containertransport|avfallstransport'),
    ('5790','Övriga transportkostnader','expense','debit','25','transporter','transportkostnad|logistik'),
    ('5810','Biljetter och långväga tjänsteresor','expense','debit',null,'resor','flyg|tåg|tjänsteresa'),
    ('5820','Hotell och logi vid tjänsteresa','expense','debit','25','resor','hotell|logi'),
    ('5830','Måltider under resa','expense','debit',null,'resor','resmåltid|måltid resa'),
    ('5840','Taxi och lokal transport','expense','debit','25','resor','taxi|lokaltrafik'),
    ('5850','Pass, visum och resehandlingar','expense','debit',null,'resor','visum|resehandling'),
    ('5890','Övriga resekostnader','expense','debit',null,'resor','resa|resekostnad'),
    ('5910','Annonsering och kampanjer','expense','debit','25','marknadsföring och försäljning','annons|kampanj'),
    ('5920','Digital marknadsföring och sökannonser','expense','debit','25','marknadsföring och försäljning','google ads|sociala medier|digital reklam'),
    ('5930','Mässor, utställningar och event','expense','debit','25','marknadsföring och försäljning','mässa|utställning|event'),
    ('5940','Profilmaterial, prover och kundgåvor','expense','debit','25','marknadsföring och försäljning','profilkläder|prover|kundgåva'),
    ('5950','Sponsring','expense','debit','25','marknadsföring och försäljning','sponsor|sponsring'),
    ('5960','Kundträffar och demonstrationer','expense','debit','25','marknadsföring och försäljning','kundevent|demo'),
    ('5990','Övriga marknadsföringskostnader','expense','debit','25','marknadsföring och försäljning','marknadsföring|reklam')
)
insert into public.account_plan_catalog_accounts (
  catalog_id,
  account_number,
  name,
  account_type,
  normal_balance,
  vat_code,
  tax_form_mapping,
  description,
  synonyms,
  tags,
  business_forms,
  reporting_frameworks,
  active,
  search_text,
  source_payload
)
select
  'b1e00000-2026-4000-8000-000000000002'::uuid,
  source.account_number,
  left(source.name,240),
  source.account_type,
  source.normal_balance,
  nullif(left(btrim(coalesce(source.vat_code,'')),80),''),
  null,
  left(
    format(
      'Redovisningskonto för %s. Ingår i kategorin %s i Bynex egen standardkontoplan.',
      lower(source.name),
      source.category
    ),
    3000
  ),
  case
    when btrim(source.synonym_text) = '' then array[]::text[]
    else string_to_array(source.synonym_text,'|')
  end,
  array[source.category,'kontoklass 5'],
  array[]::text[],
  array['K2','K3'],
  true,
  left(
    lower(
      concat_ws(
        ' ',
        source.account_number,
        source.name,
        source.category,
        replace(source.synonym_text,'|',' ')
      )
    ),
    8000
  ),
  jsonb_build_object(
    'source','bynex-standard-2026.1',
    'independent_from_official_bas',true,
    'accountNumber',source.account_number,
    'category',source.category
  )
from source
on conflict (catalog_id,account_number) do update
set name = excluded.name,
    account_type = excluded.account_type,
    normal_balance = excluded.normal_balance,
    vat_code = excluded.vat_code,
    tax_form_mapping = excluded.tax_form_mapping,
    description = excluded.description,
    synonyms = excluded.synonyms,
    tags = excluded.tags,
    business_forms = excluded.business_forms,
    reporting_frameworks = excluded.reporting_frameworks,
    active = excluded.active,
    search_text = excluded.search_text,
    source_payload = excluded.source_payload,
    updated_at = now();

update public.account_plan_catalogs catalog
set account_count = (
      select count(*)
      from public.account_plan_catalog_accounts account
      where account.catalog_id = catalog.id
    ),
    updated_at = now()
where catalog.id = 'b1e00000-2026-4000-8000-000000000002'::uuid;

commit;
