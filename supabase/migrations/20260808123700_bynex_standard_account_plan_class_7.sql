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
    ('7010','Timlöner till yrkesarbetare','expense','debit',null,'löner','timlön|hantverkarlön'),
    ('7020','Månadslöner till tjänstemän','expense','debit',null,'löner','månadslön|tjänstemannalön'),
    ('7030','Övertid och ob-tillägg','expense','debit',null,'löner','övertid|ob'),
    ('7040','Sjuklön','expense','debit',null,'löner','sjuklön|karens'),
    ('7050','Semesterlön och semesterersättning','expense','debit',null,'löner','semesterlön|semesterersättning'),
    ('7060','Bonus, provision och resultatlön','expense','debit',null,'löner','bonus lön|provision lön'),
    ('7070','Ackord och prestationsersättning','expense','debit',null,'löner','ackord|prestationslön'),
    ('7080','Skattepliktiga förmåner','expense','debit',null,'löner','bilförmån|kostförmån|förmån'),
    ('7090','Lönejusteringar och retroaktiva löner','expense','debit',null,'löner','retroaktiv lön|lönejustering'),
    ('7210','Löner till företagsledning','expense','debit',null,'ledning och arvoden','vd-lön|ledningslön'),
    ('7220','Styrelsearvoden','expense','debit',null,'ledning och arvoden','styrelsearvode'),
    ('7230','Lön till företagsägare som är anställd','expense','debit',null,'ledning och arvoden','ägarlön|delägarlön'),
    ('7290','Övriga löner och arvoden','expense','debit',null,'ledning och arvoden','arvode|övrig lön'),
    ('7310','Skattepliktiga kostnadsersättningar','expense','debit',null,'kostnadsersättningar','skattepliktig ersättning'),
    ('7320','Skattefria resekostnadsersättningar','expense','debit',null,'kostnadsersättningar','reseersättning skattefri'),
    ('7330','Milersättning för tjänstekörning','expense','debit',null,'kostnadsersättningar','milersättning|egen bil i tjänst'),
    ('7340','Traktamente inom Sverige','expense','debit',null,'kostnadsersättningar','traktamente sverige|dagtraktamente'),
    ('7350','Traktamente utomlands','expense','debit',null,'kostnadsersättningar','utlandstraktamente|traktamente utland'),
    ('7360','Ersättning för verktyg och arbetsutrustning','expense','debit',null,'kostnadsersättningar','verktygsersättning'),
    ('7390','Övriga kostnadsersättningar','expense','debit',null,'kostnadsersättningar','utläggsersättning|kostnadsersättning'),
    ('7410','Pensionsförsäkringspremier','expense','debit',null,'pensioner','tjänstepension|pensionspremie'),
    ('7420','Direktpension och pensionsutfästelser','expense','debit',null,'pensioner','direktpension|pensionsutfästelse'),
    ('7430','Pensionsadministration och rådgivning','expense','debit',null,'pensioner','pensionsrådgivning|pensionsavgift'),
    ('7490','Övriga pensionskostnader','expense','debit',null,'pensioner','pensionskostnad'),
    ('7510','Arbetsgivaravgifter på löner och förmåner','expense','debit',null,'sociala avgifter och löneskatt','arbetsgivaravgift|socialavgift'),
    ('7520','Särskild löneskatt på pensionskostnader','expense','debit',null,'sociala avgifter och löneskatt','särskild löneskatt|slp'),
    ('7530','Arbetsgivaravgifter på semester- och löneskulder','expense','debit',null,'sociala avgifter och löneskatt','socialavgift semester|upplupen arbetsgivaravgift'),
    ('7540','Nedsatta och återbetalda arbetsgivaravgifter','expense','debit',null,'sociala avgifter och löneskatt','växa-stöd|nedsatt arbetsgivaravgift'),
    ('7590','Övriga lagstadgade personalkostnader','expense','debit',null,'sociala avgifter och löneskatt','lagstadgad personalavgift'),
    ('7610','Utbildning och kompetensutveckling','expense','debit','25','övriga personalkostnader','kurs|utbildning|certifieringskurs'),
    ('7620','Sjuk- och hälsovård för personal','expense','debit',null,'övriga personalkostnader','hälsovård|vaccination|läkarvård'),
    ('7630','Friskvård','expense','debit',null,'övriga personalkostnader','friskvårdsbidrag|gym'),
    ('7640','Personalrepresentation','expense','debit',null,'övriga personalkostnader','personalfest|julbord'),
    ('7650','Rekrytering och introduktion','expense','debit',null,'övriga personalkostnader','onboarding|introduktion'),
    ('7660','Arbetsmiljö, skydd och säkerhetsutbildning','expense','debit','25','övriga personalkostnader','arbetsmiljö|heta arbeten|säkerhetskurs'),
    ('7670','Företagshälsovård och rehabilitering','expense','debit',null,'övriga personalkostnader','rehab|företagshälsa'),
    ('7680','Personalaktiviteter och trivsel','expense','debit',null,'övriga personalkostnader','personalevent|trivsel'),
    ('7690','Övriga personalkostnader','expense','debit',null,'övriga personalkostnader','personalkostnad|personalvård'),
    ('7710','Avskrivning av immateriella tillgångar','expense','debit',null,'av- och nedskrivningar','avskrivning programvara|avskrivning goodwill'),
    ('7720','Avskrivning av byggnader och markanläggningar','expense','debit',null,'av- och nedskrivningar','avskrivning byggnad|avskrivning mark'),
    ('7730','Avskrivning av maskiner','expense','debit',null,'av- och nedskrivningar','maskinavskrivning'),
    ('7740','Avskrivning av inventarier och verktyg','expense','debit',null,'av- och nedskrivningar','inventarieavskrivning|verktygsavskrivning'),
    ('7750','Avskrivning av fordon','expense','debit',null,'av- och nedskrivningar','bilavskrivning|fordonsavskrivning'),
    ('7760','Avskrivning av datorer och IT-utrustning','expense','debit',null,'av- och nedskrivningar','datoravskrivning|it-avskrivning'),
    ('7770','Avskrivning av leasade tillgångar','expense','debit',null,'av- och nedskrivningar','leasingavskrivning'),
    ('7780','Avskrivning av övriga materiella tillgångar','expense','debit',null,'av- och nedskrivningar','övrig avskrivning'),
    ('7790','Nedskrivning av anläggningstillgångar','expense','debit',null,'av- och nedskrivningar','nedskrivning inventarie|värdenedgång'),
    ('7910','Förlust vid försäljning av anläggningstillgångar','expense','debit',null,'övriga rörelsekostnader','reaförlust inventarie|såld maskin förlust'),
    ('7920','Kundförluster','expense','debit',null,'övriga rörelsekostnader','konstaterad kundförlust|befarad kundförlust'),
    ('7930','Skador och svinn','expense','debit',null,'övriga rörelsekostnader','svinn|skada'),
    ('7990','Övriga rörelsekostnader','expense','debit',null,'övriga rörelsekostnader','övrig rörelsekostnad')
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
  array[source.category,'kontoklass 7'],
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
