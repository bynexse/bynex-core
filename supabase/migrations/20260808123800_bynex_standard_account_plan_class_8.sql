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
    ('8010','Utdelning från koncernföretag','revenue','credit',null,'finansiella intäkter från koncern','koncernutdelning|utdelning dotterbolag'),
    ('8020','Resultat från andelar i koncernföretag','revenue','credit',null,'finansiella intäkter från koncern','resultat dotterbolag|andel koncern'),
    ('8030','Ränteintäkt från koncernföretag','revenue','credit',null,'finansiella intäkter från koncern','koncernränta|ränta dotterbolag'),
    ('8040','Övriga finansiella intäkter från koncernföretag','revenue','credit',null,'finansiella intäkter från koncern','finansiell koncernintäkt'),
    ('8110','Ränteintäkt från bank','revenue','credit',null,'övriga finansiella intäkter','bankränta|sparränta'),
    ('8120','Ränteintäkt på kund- och andra fordringar','revenue','credit',null,'övriga finansiella intäkter','dröjsmålsränta intäkt|fordringsränta'),
    ('8130','Valutakursvinster','revenue','credit',null,'övriga finansiella intäkter','kursvinst|valutavinst'),
    ('8140','Vinst på kortfristiga placeringar','revenue','credit',null,'övriga finansiella intäkter','placeringsvinst|värdepappersvinst'),
    ('8150','Erhållna dröjsmålsräntor','revenue','credit',null,'övriga finansiella intäkter','dröjsmålsränta|påminnelseränta'),
    ('8190','Övriga finansiella intäkter','revenue','credit',null,'övriga finansiella intäkter','finansiell intäkt|ränteintäkt'),
    ('8210','Ränta på banklån och krediter','expense','debit',null,'finansiella kostnader','låneränta|bankränta kostnad'),
    ('8220','Ränta på leasing- och finansieringsskulder','expense','debit',null,'finansiella kostnader','leasingränta|finansieringsränta'),
    ('8230','Valutakursförluster','expense','debit',null,'finansiella kostnader','kursförlust|valutaförlust'),
    ('8240','Ränta och finansieringskostnad för factoring','expense','debit',null,'finansiella kostnader','factoringränta|fakturaköp ränta'),
    ('8250','Dröjsmålsräntor och förseningsräntor','expense','debit',null,'finansiella kostnader','dröjsmålsränta kostnad|förseningsränta'),
    ('8260','Ränta till koncernföretag och närstående','expense','debit',null,'finansiella kostnader','koncernränta kostnad|ägarlåneränta'),
    ('8290','Övriga finansiella kostnader','expense','debit',null,'finansiella kostnader','finansiell kostnad|räntekostnad'),
    ('8310','Skattefria ränteintäkter','revenue','credit',null,'skattejusterade finansiella intäkter','skattefri ränta'),
    ('8320','Övriga skattefria finansiella intäkter','revenue','credit',null,'skattejusterade finansiella intäkter','skattefri intäkt'),
    ('8390','Övriga justeringsposter bland finansiella intäkter','revenue','credit',null,'skattejusterade finansiella intäkter','finansiell justering intäkt'),
    ('8410','Ej avdragsgilla räntekostnader','expense','debit',null,'skattejusterade finansiella kostnader','icke avdragsgill ränta|ränteavdragsbegränsning'),
    ('8420','Andra ej avdragsgilla finansiella kostnader','expense','debit',null,'skattejusterade finansiella kostnader','ej avdragsgill finansiell kostnad'),
    ('8490','Övriga justeringsposter bland finansiella kostnader','expense','debit',null,'skattejusterade finansiella kostnader','finansiell justering kostnad'),
    ('8510','Resultat vid försäljning av långfristiga värdepapper','revenue','credit',null,'resultat från finansiella tillgångar','värdepappersförsäljning|reavinst värdepapper'),
    ('8520','Nedskrivning av långfristiga finansiella tillgångar','expense','debit',null,'resultat från finansiella tillgångar','nedskrivning värdepapper'),
    ('8590','Övriga resultatposter från finansiella tillgångar','revenue','credit',null,'resultat från finansiella tillgångar','finansiellt resultat'),
    ('8810','Avsättning till periodiseringsfond','expense','debit',null,'bokslutsdispositioner','periodiseringsfond avsättning|bokslutsdisposition'),
    ('8820','Återföring av periodiseringsfond','revenue','credit',null,'bokslutsdispositioner','periodiseringsfond återföring|bokslutsdisposition'),
    ('8830','Avsättning till överavskrivningar','expense','debit',null,'bokslutsdispositioner','överavskrivning avsättning|bokslutsdisposition'),
    ('8840','Återföring av överavskrivningar','revenue','credit',null,'bokslutsdispositioner','överavskrivning återföring|bokslutsdisposition'),
    ('8850','Erhållet koncernbidrag','revenue','credit',null,'bokslutsdispositioner','koncernbidrag mottaget'),
    ('8860','Lämnat koncernbidrag','expense','debit',null,'bokslutsdispositioner','koncernbidrag lämnat'),
    ('8890','Övriga bokslutsdispositioner','expense','debit',null,'bokslutsdispositioner','bokslutsdisposition'),
    ('8910','Aktuell skatt på årets resultat','expense','debit',null,'skatt och årets resultat','bolagsskatt|inkomstskatt'),
    ('8920','Förändring av uppskjuten skatt','expense','debit',null,'skatt och årets resultat','uppskjuten skatt|deferred tax'),
    ('8930','Skatt som avser tidigare år','expense','debit',null,'skatt och årets resultat','skatt tidigare år|skattejustering'),
    ('8990','Årets resultat – omföringskonto','equity','credit',null,'skatt och årets resultat','årsresultat omföring|resultatkonto')
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
  array[source.category,'kontoklass 8'],
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
