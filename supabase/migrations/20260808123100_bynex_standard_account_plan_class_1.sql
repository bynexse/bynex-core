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
    ('1010','Utvecklingsutgifter','asset','debit',null,'immateriella tillgångar',''),
    ('1018','Ackumulerade avskrivningar på utvecklingsutgifter','asset','credit',null,'immateriella tillgångar',''),
    ('1019','Nedskrivning av utvecklingsutgifter','asset','credit',null,'immateriella tillgångar',''),
    ('1020','Programvara och digitala rättigheter','asset','debit',null,'immateriella tillgångar',''),
    ('1028','Ackumulerade avskrivningar på programvara','asset','credit',null,'immateriella tillgångar',''),
    ('1029','Nedskrivning av programvara','asset','credit',null,'immateriella tillgångar',''),
    ('1030','Patent, licenser och liknande rättigheter','asset','debit',null,'immateriella tillgångar',''),
    ('1038','Ackumulerade avskrivningar på patent och licenser','asset','credit',null,'immateriella tillgångar',''),
    ('1039','Nedskrivning av patent och licenser','asset','credit',null,'immateriella tillgångar',''),
    ('1040','Goodwill och förvärvade kundvärden','asset','debit',null,'immateriella tillgångar',''),
    ('1048','Ackumulerade avskrivningar på goodwill','asset','credit',null,'immateriella tillgångar',''),
    ('1049','Nedskrivning av goodwill','asset','credit',null,'immateriella tillgångar',''),
    ('1110','Byggnader','asset','debit',null,'fastigheter och mark',''),
    ('1118','Ackumulerade avskrivningar på byggnader','asset','credit',null,'fastigheter och mark',''),
    ('1119','Nedskrivning av byggnader','asset','credit',null,'fastigheter och mark',''),
    ('1120','Markanläggningar','asset','debit',null,'fastigheter och mark',''),
    ('1128','Ackumulerade avskrivningar på markanläggningar','asset','credit',null,'fastigheter och mark',''),
    ('1129','Nedskrivning av markanläggningar','asset','credit',null,'fastigheter och mark',''),
    ('1130','Mark och tomter','asset','debit',null,'fastigheter och mark',''),
    ('1140','Pågående ny-, till- och ombyggnad','asset','debit',null,'fastigheter och mark',''),
    ('1150','Förbättringsutgifter på annans fastighet','asset','debit',null,'fastigheter och mark',''),
    ('1158','Ackumulerade avskrivningar på förbättringsutgifter','asset','credit',null,'fastigheter och mark',''),
    ('1159','Nedskrivning av förbättringsutgifter','asset','credit',null,'fastigheter och mark',''),
    ('1210','Maskiner för produktion och entreprenad','asset','debit',null,'maskiner och inventarier','grävmaskin|lastmaskin|produktionsmaskin'),
    ('1218','Ackumulerade avskrivningar på maskiner','asset','credit',null,'maskiner och inventarier',''),
    ('1219','Nedskrivning av maskiner','asset','credit',null,'maskiner och inventarier',''),
    ('1220','Inventarier och arbetsutrustning','asset','debit',null,'maskiner och inventarier','inventarie|utrustning'),
    ('1228','Ackumulerade avskrivningar på inventarier','asset','credit',null,'maskiner och inventarier',''),
    ('1229','Nedskrivning av inventarier','asset','credit',null,'maskiner och inventarier',''),
    ('1230','Installationer och tekniska system','asset','debit',null,'maskiner och inventarier','installation|tekniskt system'),
    ('1238','Ackumulerade avskrivningar på installationer','asset','credit',null,'maskiner och inventarier',''),
    ('1239','Nedskrivning av installationer','asset','credit',null,'maskiner och inventarier',''),
    ('1240','Bilar och andra transportmedel','asset','debit',null,'maskiner och inventarier','bil|transportfordon|servicebil'),
    ('1248','Ackumulerade avskrivningar på fordon','asset','credit',null,'maskiner och inventarier',''),
    ('1249','Nedskrivning av fordon','asset','credit',null,'maskiner och inventarier',''),
    ('1250','Datorer, telefoner och nätverksutrustning','asset','debit',null,'maskiner och inventarier','dator|mobil|router|it-utrustning'),
    ('1258','Ackumulerade avskrivningar på IT-utrustning','asset','credit',null,'maskiner och inventarier',''),
    ('1259','Nedskrivning av IT-utrustning','asset','credit',null,'maskiner och inventarier',''),
    ('1260','Leasade tillgångar redovisade i balansräkningen','asset','debit',null,'maskiner och inventarier','leasingtillgång|leasad tillgång'),
    ('1268','Ackumulerade avskrivningar på leasade tillgångar','asset','credit',null,'maskiner och inventarier',''),
    ('1269','Nedskrivning av leasade tillgångar','asset','credit',null,'maskiner och inventarier',''),
    ('1290','Övriga materiella anläggningstillgångar','asset','debit',null,'maskiner och inventarier',''),
    ('1298','Ackumulerade avskrivningar på övriga materiella tillgångar','asset','credit',null,'maskiner och inventarier',''),
    ('1299','Nedskrivning av övriga materiella tillgångar','asset','credit',null,'maskiner och inventarier',''),
    ('1310','Andelar i koncernföretag','asset','debit',null,'finansiella anläggningstillgångar',''),
    ('1320','Långfristiga fordringar på koncernföretag','asset','debit',null,'finansiella anläggningstillgångar',''),
    ('1330','Andelar i intresseföretag','asset','debit',null,'finansiella anläggningstillgångar',''),
    ('1340','Andra långfristiga värdepapper','asset','debit',null,'finansiella anläggningstillgångar',''),
    ('1350','Långfristiga depositioner','asset','debit',null,'finansiella anläggningstillgångar',''),
    ('1360','Långfristiga lån till andra','asset','debit',null,'finansiella anläggningstillgångar',''),
    ('1380','Andra långfristiga fordringar','asset','debit',null,'finansiella anläggningstillgångar',''),
    ('1390','Nedskrivning av finansiella anläggningstillgångar','asset','credit',null,'finansiella anläggningstillgångar',''),
    ('1410','Råvaror och basmaterial','asset','debit',null,'lager och pågående arbete','råvara|basmaterial'),
    ('1420','Förbrukningsmaterial i lager','asset','debit',null,'lager och pågående arbete','förbrukningsmaterial|lager'),
    ('1430','Komponenter och halvfabrikat','asset','debit',null,'lager och pågående arbete','komponent|halvfabrikat'),
    ('1440','Färdiga varor för försäljning','asset','debit',null,'lager och pågående arbete','färdig vara|handelsvara'),
    ('1450','Produkter i arbete','asset','debit',null,'lager och pågående arbete','pågående produkt|produktion i arbete'),
    ('1460','Projektmaterial på arbetsplats','asset','debit',null,'lager och pågående arbete','byggmaterial på plats|projektlager'),
    ('1470','Pågående arbete – fastprisprojekt','asset','debit',null,'lager och pågående arbete','pågående arbete|fast pris|wip'),
    ('1480','Pågående arbete – löpande projekt','asset','debit',null,'lager och pågående arbete','pågående arbete|löpande projekt|wip'),
    ('1490','Förskott till leverantörer för lager och material','asset','debit',null,'lager och pågående arbete','leverantörsförskott|materialförskott'),
    ('1510','Kundfordringar','asset','debit',null,'kortfristiga fordringar','kundfaktura|obetalda kundfakturor'),
    ('1513','Fordran för ROT- och RUT-utbetalning','asset','debit',null,'kortfristiga fordringar','rotfordran|rutfordran|skattereduktion'),
    ('1515','Osäkra kundfordringar','asset','debit',null,'kortfristiga fordringar','osäker kund|befarad kundförlust'),
    ('1518','Ej fakturerat arbete','asset','debit',null,'kortfristiga fordringar','ofakturerat|upparbetad intäkt'),
    ('1520','Växelfordringar och andra dokumenterade kundkrav','asset','debit',null,'kortfristiga fordringar','växelfordran'),
    ('1530','Fordringar hos koncernföretag','asset','debit',null,'kortfristiga fordringar','koncernfordran'),
    ('1580','Kort-, betal- och marknadsplatsfordringar','asset','debit',null,'kortfristiga fordringar','kortinlösen|klarna|stripe|swishfordran'),
    ('1610','Fordringar hos anställda','asset','debit',null,'kortfristiga fordringar','personalfordran|löneförskott'),
    ('1620','Förskott till anställda och resor','asset','debit',null,'kortfristiga fordringar','reseförskott|förskott personal'),
    ('1630','Skattekonto','asset','debit',null,'kortfristiga fordringar','skatteverket|skattekonto'),
    ('1640','Fordran på inkomstskatt','asset','debit',null,'kortfristiga fordringar','skattefordran|preliminär skatt'),
    ('1650','Momsfordran','asset','debit',null,'kortfristiga fordringar','moms att få tillbaka|momsfordran'),
    ('1660','Fordran på försäkringsbolag','asset','debit',null,'kortfristiga fordringar','försäkringsersättning|skadefordran'),
    ('1680','Andra kortfristiga fordringar','asset','debit',null,'kortfristiga fordringar','övrig fordran'),
    ('1690','Nedskrivning av kortfristiga fordringar','asset','credit',null,'kortfristiga fordringar','nedskrivning fordran'),
    ('1710','Förutbetald lokalhyra','asset','debit',null,'förutbetalda kostnader och upplupna intäkter','förutbetald hyra|periodisering hyra'),
    ('1720','Förutbetald försäkring','asset','debit',null,'förutbetalda kostnader och upplupna intäkter','periodisering försäkring'),
    ('1730','Förutbetald leasing och abonnemang','asset','debit',null,'förutbetalda kostnader och upplupna intäkter','förutbetald leasing|förutbetalt abonnemang'),
    ('1740','Förutbetald ränta','asset','debit',null,'förutbetalda kostnader och upplupna intäkter','periodisering ränta'),
    ('1750','Upplupen avtalsintäkt','asset','debit',null,'förutbetalda kostnader och upplupna intäkter','upplupen intäkt|ej fakturerad intäkt'),
    ('1760','Upplupen ränteintäkt','asset','debit',null,'förutbetalda kostnader och upplupna intäkter','upplupen ränta'),
    ('1790','Övriga förutbetalda kostnader och upplupna intäkter','asset','debit',null,'förutbetalda kostnader och upplupna intäkter','interimsfordran|periodisering'),
    ('1810','Kortfristiga aktieplaceringar','asset','debit',null,'kortfristiga placeringar','aktier kortfristigt'),
    ('1820','Kortfristiga ränteplaceringar','asset','debit',null,'kortfristiga placeringar','räntefond|kort placering'),
    ('1830','Digitala tillgångar avsedda för handel','asset','debit',null,'kortfristiga placeringar','kryptotillgång|digital valuta'),
    ('1880','Andra kortfristiga placeringar','asset','debit',null,'kortfristiga placeringar','kortfristig investering'),
    ('1890','Nedskrivning av kortfristiga placeringar','asset','credit',null,'kortfristiga placeringar','nedskrivning placering'),
    ('1910','Kassa','asset','debit',null,'kassa och bank','kontanter|handkassa'),
    ('1920','Betalkonto och plusgiro','asset','debit',null,'kassa och bank','plusgiro|betalningskonto'),
    ('1930','Företagskonto i bank','asset','debit',null,'kassa och bank','bankkonto|transaktionskonto'),
    ('1940','Övriga bankkonton','asset','debit',null,'kassa och bank','sparkonto företag|annat bankkonto'),
    ('1950','Klientmedelskonto','asset','debit',null,'kassa och bank','klientmedel|redovisningsmedel'),
    ('1960','Valutakonto','asset','debit',null,'kassa och bank','eur-konto|usd-konto|valutakonto'),
    ('1970','Spärrade bankmedel','asset','debit',null,'kassa och bank','spärrat konto|deposition bank'),
    ('1990','Övriga likvida medel','asset','debit',null,'kassa och bank','likvida medel|betalmedel')
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
  array[source.category,'kontoklass 1'],
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
