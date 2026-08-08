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
    ('2010','Eget kapital vid årets början','equity','credit',null,'eget kapital – enskild firma och handelsbolag','ingående eget kapital'),
    ('2013','Ägarens privata uttag','equity','debit',null,'eget kapital – enskild firma och handelsbolag','egna uttag|privat uttag'),
    ('2018','Ägarens privata insättningar','equity','credit',null,'eget kapital – enskild firma och handelsbolag','egna insättningar|privat insättning'),
    ('2020','Delägares kapitalkonto','equity','credit',null,'eget kapital – enskild firma och handelsbolag','delägarkapital'),
    ('2030','Årets resultat i ägarledd verksamhet','equity','credit',null,'eget kapital – enskild firma och handelsbolag','årsresultat'),
    ('2081','Registrerat aktiekapital','equity','credit',null,'eget kapital – aktiebolag och föreningar','aktiekapital'),
    ('2085','Reservfond och bundna reserver','equity','credit',null,'eget kapital – aktiebolag och föreningar','reservfond|bundet eget kapital'),
    ('2086','Överkursfond','equity','credit',null,'eget kapital – aktiebolag och föreningar','överkurs'),
    ('2088','Övrigt bundet eget kapital','equity','credit',null,'eget kapital – aktiebolag och föreningar','bundet kapital'),
    ('2091','Balanserat resultat','equity','credit',null,'eget kapital – aktiebolag och föreningar','balanserad vinst|balanserad förlust'),
    ('2092','Mottagna och lämnade villkorade aktieägartillskott','equity','credit',null,'eget kapital – aktiebolag och föreningar','aktieägartillskott'),
    ('2093','Erhållna ovillkorade aktieägartillskott','equity','credit',null,'eget kapital – aktiebolag och föreningar','ovillkorat tillskott'),
    ('2098','Föregående års resultat','equity','credit',null,'eget kapital – aktiebolag och föreningar','resultat föregående år'),
    ('2099','Årets resultat','equity','credit',null,'eget kapital – aktiebolag och föreningar','årsresultat|vinst|förlust'),
    ('2110','Periodiseringsfond – första öppna året','equity','credit',null,'obeskattade reserver',''),
    ('2120','Periodiseringsfond – andra öppna året','equity','credit',null,'obeskattade reserver',''),
    ('2130','Periodiseringsfond – tredje öppna året','equity','credit',null,'obeskattade reserver',''),
    ('2140','Periodiseringsfond – fjärde öppna året','equity','credit',null,'obeskattade reserver',''),
    ('2150','Periodiseringsfond – femte öppna året','equity','credit',null,'obeskattade reserver',''),
    ('2160','Periodiseringsfond – sjätte öppna året','equity','credit',null,'obeskattade reserver',''),
    ('2190','Övriga obeskattade reserver','equity','credit',null,'obeskattade reserver',''),
    ('2210','Avsättning för pensioner','liability','credit',null,'avsättningar','pensionsavsättning'),
    ('2220','Avsättning för garantiåtaganden','liability','credit',null,'avsättningar','garantireserv|garantiavsättning'),
    ('2230','Avsättning för återställande och miljöåtaganden','liability','credit',null,'avsättningar','miljöavsättning|återställande'),
    ('2240','Avsättning för tvister och skadestånd','liability','credit',null,'avsättningar','tvist|skadeståndsreserv'),
    ('2290','Övriga avsättningar','liability','credit',null,'avsättningar','avsättning'),
    ('2310','Obligations- och skuldebrevslån','liability','credit',null,'långfristiga skulder','obligationslån|skuldebrev'),
    ('2320','Konvertibla lån','liability','credit',null,'långfristiga skulder','konvertibel'),
    ('2330','Långfristig check- och kontokredit','liability','credit',null,'långfristiga skulder','checkkredit|kontokredit'),
    ('2340','Byggnadskreditiv','liability','credit',null,'långfristiga skulder','byggkreditiv|byggnadslån'),
    ('2350','Långfristiga banklån','liability','credit',null,'långfristiga skulder','banklån|företagslån'),
    ('2360','Långfristiga leasingskulder','liability','credit',null,'långfristiga skulder','leasingskuld'),
    ('2370','Långfristiga skulder till koncernföretag','liability','credit',null,'långfristiga skulder','koncernskuld'),
    ('2380','Långfristiga skulder till ägare och närstående','liability','credit',null,'långfristiga skulder','ägarlån|närståendelån'),
    ('2390','Övriga långfristiga skulder','liability','credit',null,'långfristiga skulder','långfristig skuld'),
    ('2410','Kortfristiga skuldebrev','liability','credit',null,'kortfristiga skulder','kort skuld|skuldebrev'),
    ('2420','Förskott från kunder','liability','credit',null,'kortfristiga skulder','kundförskott|handpenning'),
    ('2430','Pågående arbeten fakturerade i förskott','liability','credit',null,'kortfristiga skulder','förskottsfakturering|pågående arbete'),
    ('2440','Leverantörsskulder','liability','credit',null,'kortfristiga skulder','leverantörsfaktura|obetalda leverantörer'),
    ('2450','Skulder till koncernföretag','liability','credit',null,'kortfristiga skulder','kort koncernskuld'),
    ('2460','Skulder till ägare och närstående','liability','credit',null,'kortfristiga skulder','ägarskuld|närståendeskuld'),
    ('2480','Skulder för mottagna depositioner','liability','credit',null,'kortfristiga skulder','deposition skuld|säkerhet'),
    ('2490','Övriga kortfristiga skulder','liability','credit',null,'kortfristiga skulder','övrig skuld|kortfristig skuld'),
    ('2510','Beräknad aktuell inkomstskatt','liability','credit',null,'skatteskulder','inkomstskatt|bolagsskatt'),
    ('2512','Beräknad fastighetsavgift och fastighetsskatt','liability','credit',null,'skatteskulder','fastighetsskatt|fastighetsavgift'),
    ('2514','Beräknad särskild löneskatt','liability','credit',null,'skatteskulder','särskild löneskatt'),
    ('2518','Betald preliminär skatt','liability','debit',null,'skatteskulder','f-skatt|preliminär skatt'),
    ('2610','Utgående moms, samlingskonto','liability','credit',null,'moms','utgående moms'),
    ('2611','Utgående moms 25 procent','liability','credit','25','moms','moms försäljning 25|utgående moms'),
    ('2612','Utgående moms vid omvänd skattskyldighet 25 procent','liability','credit','RC25','moms','omvänd moms|byggmoms'),
    ('2613','Utgående moms på EU-förvärv 25 procent','liability','credit','EU25','moms','eu-moms|gemenskapsinternt förvärv'),
    ('2615','Utgående moms på import 25 procent','liability','credit','IMPORT25','moms','importmoms|tullmoms'),
    ('2620','Utgående moms, samlingskonto 12 procent','liability','credit','12','moms','utgående moms 12'),
    ('2621','Utgående moms 12 procent','liability','credit','12','moms','moms försäljning 12'),
    ('2630','Utgående moms, samlingskonto 6 procent','liability','credit','6','moms','utgående moms 6'),
    ('2631','Utgående moms 6 procent','liability','credit','6','moms','moms försäljning 6'),
    ('2640','Ingående moms, samlingskonto','asset','debit',null,'moms','ingående moms'),
    ('2641','Avdragsgill ingående moms','asset','debit','25','moms','moms inköp|avdragsgill moms'),
    ('2645','Beräknad ingående moms på utländska inköp','asset','debit','FOREIGN','moms','eu-moms inköp|omvänd moms inköp'),
    ('2646','Beräknad ingående moms på import','asset','debit','IMPORT25','moms','importmoms ingående'),
    ('2650','Momsavräkning','liability','credit',null,'moms','momsredovisning|momsdeklaration'),
    ('2660','Moms på särskilda transaktioner','liability','credit',null,'moms','specialmoms|momsjustering'),
    ('2710','Avdragen preliminärskatt på lön','liability','credit',null,'personalrelaterade skulder','personalskatt|skatteavdrag'),
    ('2720','Avdragen skatt på ersättning till andra','liability','credit',null,'personalrelaterade skulder','skatteavdrag leverantör|a-skatt'),
    ('2730','Lagstadgade arbetsgivaravgifter','liability','credit',null,'personalrelaterade skulder','arbetsgivaravgift|socialavgift'),
    ('2731','Arbetsgivaravgifter att betala','liability','credit',null,'personalrelaterade skulder','arbetsgivaravgift skuld'),
    ('2740','Särskild löneskatt att betala','liability','credit',null,'personalrelaterade skulder','löneskatt skuld'),
    ('2750','Utmätning och andra löneavdrag','liability','credit',null,'personalrelaterade skulder','löneutmätning|avdrag lön'),
    ('2760','Semester- och arbetstidsbank att betala','liability','credit',null,'personalrelaterade skulder','tidbank|semesterbank'),
    ('2790','Övriga löneskulder och personalavdrag','liability','credit',null,'personalrelaterade skulder','löneskuld|personalavdrag'),
    ('2810','Skulder till anställda','liability','credit',null,'övriga kortfristiga skulder','utlägg anställd|personal skuld'),
    ('2820','Kortfristiga lån','liability','credit',null,'övriga kortfristiga skulder','kort lån'),
    ('2830','Avräkning för kort och utlägg','liability','credit',null,'övriga kortfristiga skulder','företagskort|kortavräkning'),
    ('2840','Leverantörsfinansiering och factoring','liability','credit',null,'övriga kortfristiga skulder','factoring skuld|leverantörskredit'),
    ('2850','Skulder för presentkort och värdebevis','liability','credit',null,'övriga kortfristiga skulder','presentkort|värdebevis'),
    ('2860','Skulder för kundmedel','liability','credit',null,'övriga kortfristiga skulder','kundmedel|redovisningsmedel'),
    ('2890','Övriga kortfristiga skulder till närstående och andra','liability','credit',null,'övriga kortfristiga skulder','övrig kort skuld'),
    ('2910','Upplupna löner och arvoden','liability','credit',null,'upplupna kostnader och förutbetalda intäkter','upplupen lön|löneperiodisering'),
    ('2920','Upplupna semesterlöner','liability','credit',null,'upplupna kostnader och förutbetalda intäkter','semesterlöneskuld|semesterreserv'),
    ('2930','Upplupna pensionskostnader','liability','credit',null,'upplupna kostnader och förutbetalda intäkter','pensionsskuld|upplupen pension'),
    ('2940','Upplupna sociala avgifter','liability','credit',null,'upplupna kostnader och förutbetalda intäkter','socialavgift skuld|arbetsgivaravgift periodisering'),
    ('2950','Upplupna avtals- och projektkostnader','liability','credit',null,'upplupna kostnader och förutbetalda intäkter','upplupen projektkostnad|ej fakturerad kostnad'),
    ('2960','Upplupna räntekostnader','liability','credit',null,'upplupna kostnader och förutbetalda intäkter','upplupen ränta'),
    ('2970','Förutbetalda intäkter','liability','credit',null,'upplupna kostnader och förutbetalda intäkter','förutbetald intäkt|periodiserad intäkt'),
    ('2990','Övriga upplupna kostnader och förutbetalda intäkter','liability','credit',null,'upplupna kostnader och förutbetalda intäkter','interimsskuld|periodisering')
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
  array[source.category,'kontoklass 2'],
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
