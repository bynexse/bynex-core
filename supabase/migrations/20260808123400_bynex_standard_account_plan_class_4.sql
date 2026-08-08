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
    ('4010','Projektmaterial och inköpta varor','expense','debit','25','direkt material och varor','byggmaterial|material|inköp material'),
    ('4011','Projektmaterial från svensk leverantör','expense','debit','25','direkt material och varor','svenskt byggmaterial|material sverige'),
    ('4012','Projektmaterial med reducerad moms','expense','debit','25','direkt material och varor','material 12 moms|material 6 moms'),
    ('4020','Förbrukningsmaterial direkt i projekt','expense','debit','25','direkt material och varor','förbrukningsmaterial projekt|skruv|fog|tejp'),
    ('4030','Varor för vidareförsäljning','expense','debit','25','direkt material och varor','handelsvaror|varuinköp'),
    ('4040','Prefabricerade byggdelar och komponenter','expense','debit','25','direkt material och varor','prefab|byggkomponent|modul'),
    ('4050','Frakt och emballage på projektmaterial','expense','debit','25','direkt material och varor','materialfrakt|emballage'),
    ('4060','Materialspill, returer och kassationer','expense','debit','25','direkt material och varor','spill|retur material|kassation'),
    ('4090','Erhållna rabatter på material och varor','expense','debit',null,'direkt material och varor','leverantörsrabatt|inköpsbonus'),
    ('4110','Inköp av handelsvaror','expense','debit','25','varuinköp','varuinköp|handelsvara'),
    ('4120','Förpackning och emballage för försäljning','expense','debit','25','varuinköp','förpackning|emballage'),
    ('4130','Direkt inleveransfrakt','expense','debit','25','varuinköp','infrakt|inköpsfrakt'),
    ('4140','Tull och importavgifter för varor','expense','debit',null,'varuinköp','tull|importavgift'),
    ('4190','Övriga varukostnadsjusteringar','expense','debit','25','varuinköp','varukostnad justering|lagerdifferens'),
    ('4210','Underentreprenörer i projekt','expense','debit','25','direkta köpta projekttjänster','ue|underentreprenör|byggtjänst'),
    ('4220','Inhyrd yrkespersonal','expense','debit','25','direkta köpta projekttjänster','inhyrd personal|bemanning hantverkare'),
    ('4230','Inhyrda maskiner med förare','expense','debit','25','direkta köpta projekttjänster','maskin med förare|kran med förare'),
    ('4240','Projektering och ritning direkt till projekt','expense','debit','25','direkta köpta projekttjänster','projektering|ritning|konstruktör'),
    ('4250','Besiktning, mätning och kontroll direkt till projekt','expense','debit','25','direkta köpta projekttjänster','besiktning|mätning|kontrollansvarig'),
    ('4260','Avfall, återvinning och tippavgifter direkt till projekt','expense','debit','25','direkta köpta projekttjänster','container|tippavgift|avfall'),
    ('4270','Tillstånd, anslutningar och myndighetsavgifter direkt till projekt','expense','debit','25','direkta köpta projekttjänster','bygglov|anslutningsavgift|tillstånd'),
    ('4280','Projektledning köpt för enskilt projekt','expense','debit','25','direkta köpta projekttjänster','extern projektledare|byggledning'),
    ('4290','Övriga direkt köpta projekttjänster','expense','debit','25','direkta köpta projekttjänster','direkt tjänst|projektkostnad'),
    ('4310','Materialförvärv från annat EU-land','expense','debit','EU25','utländska och omvända inköp','eu-material|gemenskapsinternt förvärv'),
    ('4320','Materialimport från land utanför EU','expense','debit','IMPORT25','utländska och omvända inköp','import material|tullmaterial'),
    ('4330','Byggtjänst köpt med omvänd skattskyldighet','expense','debit','RC25','utländska och omvända inköp','omvänd byggmoms|underentreprenör omvänd moms'),
    ('4340','Tjänst köpt från företag inom EU','expense','debit','EU25','utländska och omvända inköp','eu-tjänst inköp|utländsk konsult eu'),
    ('4350','Tjänst köpt från företag utanför EU','expense','debit','FOREIGN','utländska och omvända inköp','utländsk tjänst|tjänsteimport'),
    ('4390','Övriga utländska inköpskostnader','expense','debit','FOREIGN','utländska och omvända inköp','utlandsinköp|importkostnad'),
    ('4410','Lagerförändring råvaror och material','expense','debit',null,'lager- och projektförändringar','lagerförändring material|lagerjustering'),
    ('4420','Lagerförändring handelsvaror','expense','debit',null,'lager- och projektförändringar','lagerförändring varor'),
    ('4430','Förändring av pågående arbete','expense','debit',null,'lager- och projektförändringar','wip|pågående arbete förändring'),
    ('4440','Förändring av färdigställda men ej levererade arbeten','expense','debit',null,'lager- och projektförändringar','färdiga arbeten lager'),
    ('4490','Övriga lager- och projektjusteringar','expense','debit',null,'lager- och projektförändringar','lagerjustering|projektjustering'),
    ('4510','Direkta fordonskostnader i projekt','expense','debit','25','övriga direkta projektkostnader','projektbil|fordon projekt'),
    ('4520','Direkt verktygshyra i projekt','expense','debit','25','övriga direkta projektkostnader','verktygshyra projekt'),
    ('4530','Direkt maskin- och utrustningshyra i projekt','expense','debit','25','övriga direkta projektkostnader','maskinhyra projekt|lift hyra'),
    ('4540','Etablering och bodar på arbetsplats','expense','debit','25','övriga direkta projektkostnader','etablering|byggbod|arbetsplats'),
    ('4550','El, vatten och värme på arbetsplats','expense','debit','25','övriga direkta projektkostnader','byggel|byggvatten|arbetsplatsel'),
    ('4560','Bevakning och säkerhet på arbetsplats','expense','debit','25','övriga direkta projektkostnader','byggbevakning|larm arbetsplats'),
    ('4570','Projekt- och entreprenadförsäkring','expense','debit','25','övriga direkta projektkostnader','entreprenadförsäkring|projektförsäkring'),
    ('4580','Projektboende och logi','expense','debit','25','övriga direkta projektkostnader','byggboende|logi projekt'),
    ('4590','Övriga direkta projektkostnader','expense','debit','25','övriga direkta projektkostnader','direkt projektkostnad|byggkostnad')
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
  array[source.category,'kontoklass 4'],
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
