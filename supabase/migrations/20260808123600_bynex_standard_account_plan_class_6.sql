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
    ('6010','Försäljningsprovisioner','expense','debit','25','försäljningskostnader','provision|säljprovision'),
    ('6020','Marknadsplats- och förmedlingsavgifter','expense','debit','25','försäljningskostnader','marketplace avgift|förmedling'),
    ('6030','Factoring- och fakturaköpsavgifter','expense','debit','25','försäljningskostnader','factoringavgift|fakturaköp'),
    ('6040','Kort-, Swish- och betalväxelavgifter','expense','debit','25','försäljningskostnader','kortavgift|swishavgift|stripeavgift'),
    ('6090','Övriga försäljningskostnader','expense','debit','25','försäljningskostnader','säljkostnad'),
    ('6110','Kontorsmaterial','expense','debit','25','kontor och administration','papper|pennor|kontorsvaror'),
    ('6120','Tryck, kopiering och ritningsutskrifter','expense','debit','25','kontor och administration','utskrift|ritningskopia|tryck'),
    ('6130','Porto och paket','expense','debit','25','kontor och administration','porto|frimärke|paket'),
    ('6140','Arkivering och dokumenthantering','expense','debit','25','kontor och administration','arkiv|dokumentförvaring'),
    ('6190','Övriga kontorskostnader','expense','debit','25','kontor och administration','kontor|administration'),
    ('6210','Mobiltelefoni','expense','debit','25','kommunikation och IT-drift','mobilabonnemang|telefon'),
    ('6220','Internet och datakommunikation','expense','debit','25','kommunikation och IT-drift','bredband|internet'),
    ('6230','IT-support och teknisk drift','expense','debit','25','kommunikation och IT-drift','it-support|driftavtal'),
    ('6240','Data-, integrations- och API-tjänster','expense','debit','25','kommunikation och IT-drift','api|datatjänst|integration'),
    ('6250','Webbhotell, domäner och e-posttjänster','expense','debit','25','kommunikation och IT-drift','webbhotell|domän|e-post'),
    ('6290','Övriga kommunikationskostnader','expense','debit','25','kommunikation och IT-drift','kommunikation|telekom'),
    ('6310','Företags- och egendomsförsäkring','expense','debit',null,'försäkringar','företagsförsäkring|egendomsförsäkring'),
    ('6320','Ansvars- och entreprenadförsäkring','expense','debit',null,'försäkringar','ansvarsförsäkring|entreprenadförsäkring'),
    ('6330','Rättsskydds- och kreditförsäkring','expense','debit',null,'försäkringar','rättsskydd|kreditförsäkring'),
    ('6340','Cyber- och dataskyddsförsäkring','expense','debit',null,'försäkringar','cyberförsäkring|it-försäkring'),
    ('6390','Övriga försäkringar','expense','debit',null,'försäkringar','försäkring|premie'),
    ('6420','Revision och granskning','expense','debit','25','externa konsulter','revisor|revision'),
    ('6430','Redovisning, bokslut och lönetjänster','expense','debit','25','externa konsulter','redovisningsbyrå|bokföringshjälp|lönebyrå'),
    ('6440','Juridisk rådgivning','expense','debit','25','externa konsulter','advokat|jurist'),
    ('6450','Företags- och ledningskonsulter','expense','debit','25','externa konsulter','managementkonsult|företagsrådgivare'),
    ('6460','Teknisk rådgivning som inte hör till ett enskilt projekt','expense','debit','25','externa konsulter','teknikkonsult|rådgivning'),
    ('6470','HR- och arbetsrättskonsulter','expense','debit','25','externa konsulter','hr-konsult|arbetsrätt'),
    ('6480','Säkerhets- och kvalitetskonsulter','expense','debit','25','externa konsulter','kvalitetskonsult|arbetsmiljökonsult'),
    ('6490','Övriga externa konsulter','expense','debit','25','externa konsulter','konsultkostnad|extern rådgivare'),
    ('6510','Program-, bransch- och myndighetslicenser','expense','debit','25','licenser, avgifter och köpta tjänster','licensavgift|tillstånd'),
    ('6520','Branschavgifter och serviceavgifter','expense','debit','25','licenser, avgifter och köpta tjänster','branschavgift|serviceavgift'),
    ('6530','Medlemsavgifter','expense','debit',null,'licenser, avgifter och köpta tjänster','medlemskap|föreningsavgift'),
    ('6540','Certifiering och behörighetsavgifter','expense','debit','25','licenser, avgifter och köpta tjänster','certifikat|behörighet'),
    ('6550','Miljö-, kontroll- och tillsynsavgifter','expense','debit',null,'licenser, avgifter och köpta tjänster','miljöavgift|tillsyn'),
    ('6570','Bank- och betalningsavgifter','expense','debit',null,'finansiella serviceavgifter','bankavgift|transaktionsavgift'),
    ('6580','Garanti-, kredit- och säkerhetsavgifter','expense','debit',null,'finansiella serviceavgifter','garantiavgift|kreditavgift'),
    ('6590','Övriga köpta tjänster','expense','debit','25','licenser, avgifter och köpta tjänster','köpt tjänst|extern tjänst'),
    ('6595','Inkasso- och kravavgifter','expense','debit',null,'finansiella serviceavgifter','inkasso|kravavgift'),
    ('6610','Emballage och skyddsmaterial','expense','debit','25','gemensamt förbrukningsmaterial','plast|kartong|skyddsmaterial'),
    ('6620','Förbrukningsmaterial för städning','expense','debit','25','gemensamt förbrukningsmaterial','städmaterial|rengöring'),
    ('6630','Kök, kaffe och enklare förtäring på arbetsplats','expense','debit','25','gemensamt förbrukningsmaterial','kaffe|frukt|personalmat'),
    ('6640','Första hjälpen och säkerhetsförbrukning','expense','debit','25','gemensamt förbrukningsmaterial','första hjälpen|säkerhetsmaterial'),
    ('6690','Övriga gemensamma förbrukningskostnader','expense','debit','25','gemensamt förbrukningsmaterial','förbrukning|gemensamt material'),
    ('6710','Outsourcad administration','expense','debit','25','administrativa tjänster','administrationstjänst|backoffice'),
    ('6720','Extern löneadministration','expense','debit','25','administrativa tjänster','löneoutsourcing|lönehantering'),
    ('6730','Inkasso- och kravhantering','expense','debit','25','administrativa tjänster','kravhantering|inkassotjänst'),
    ('6740','Översättning och språkservice','expense','debit','25','administrativa tjänster','översättare|tolk'),
    ('6750','Bevakning och säkerhetstjänster','expense','debit','25','administrativa tjänster','väktare|säkerhetstjänst'),
    ('6790','Övriga administrativa tjänster','expense','debit','25','administrativa tjänster','administrativ tjänst|kontorstjänst'),
    ('6810','Rekrytering och annonsering efter personal','expense','debit','25','köpta personaltjänster','rekryteringsfirma|jobbannons'),
    ('6820','Inhyrd administrativ personal','expense','debit','25','köpta personaltjänster','bemanning kontor|inhyrd tjänsteman'),
    ('6830','Företagshälsovård','expense','debit','25','köpta personaltjänster','företagshälsa|hälsokontroll'),
    ('6840','Bakgrunds- och behörighetskontroller','expense','debit','25','köpta personaltjänster','bakgrundskontroll|id06 kontroll'),
    ('6890','Övriga personaltjänster','expense','debit','25','köpta personaltjänster','personaltjänst|hr-tjänst'),
    ('6910','Facklitteratur och digitala kunskapstjänster','expense','debit','6','övriga externa kostnader','fackbok|kunskapsdatabas'),
    ('6920','Tidningar och prenumerationer','expense','debit','6','övriga externa kostnader','prenumeration|tidning'),
    ('6930','Rapporter, standarder och tekniska regelverk','expense','debit','25','övriga externa kostnader','standard|regelverk|handbok'),
    ('6950','Registrerings- och myndighetsavgifter','expense','debit',null,'övriga externa kostnader','bolagsverket|registreringsavgift'),
    ('6970','Representation mot kund och affärspartner','expense','debit',null,'övriga externa kostnader','kundrepresentation|affärslunch'),
    ('6990','Övriga avdragsgilla rörelsekostnader','expense','debit',null,'övriga externa kostnader','övrig kostnad|avdragsgill'),
    ('6991','Ej avdragsgilla rörelsekostnader','expense','debit',null,'övriga externa kostnader','ej avdragsgill|icke avdragsgill'),
    ('6992','Böter, viten och sanktionsavgifter','expense','debit',null,'övriga externa kostnader','böter|vite|sanktionsavgift')
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
  array[source.category,'kontoklass 6'],
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
