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
    ('3010','Försäljning inom Sverige, samlingskonto','revenue','credit',null,'försäljning Sverige','försäljning sverige|omsättning'),
    ('3011','Varuförsäljning i Sverige, 25 procent moms','revenue','credit','25','försäljning Sverige','försäljning varor 25|handelsvaror'),
    ('3012','Varuförsäljning i Sverige, 12 procent moms','revenue','credit','12','försäljning Sverige','försäljning varor 12'),
    ('3013','Varuförsäljning i Sverige, 6 procent moms','revenue','credit','6','försäljning Sverige','försäljning varor 6'),
    ('3020','Tjänsteförsäljning i Sverige, samlingskonto','revenue','credit',null,'försäljning Sverige','tjänsteintäkt|arbete'),
    ('3021','Tjänsteförsäljning i Sverige, 25 procent moms','revenue','credit','25','försäljning Sverige','tjänster 25|arbete 25'),
    ('3022','Tjänsteförsäljning i Sverige, 12 procent moms','revenue','credit','12','försäljning Sverige','tjänster 12'),
    ('3023','Tjänsteförsäljning i Sverige, 6 procent moms','revenue','credit','6','försäljning Sverige','tjänster 6'),
    ('3110','Debiterat arbete och hantverkstid','revenue','credit','25','projekt- och entreprenadintäkter','arbetstid|timdebitering|hantverkare'),
    ('3120','Debiterat material','revenue','credit','25','projekt- och entreprenadintäkter','materialintäkt|vidarefakturerat material'),
    ('3130','Debiterade maskiner och hjälpmedel','revenue','credit','25','projekt- och entreprenadintäkter','maskintid|maskinintäkt'),
    ('3140','Vidarefakturerade underentreprenörer','revenue','credit','25','projekt- och entreprenadintäkter','ue|underentreprenör intäkt'),
    ('3150','Debiterade resor och transporter','revenue','credit','25','projekt- och entreprenadintäkter','reseintäkt|framkörning|transportintäkt'),
    ('3160','Intäkt från ÄTA-arbeten','revenue','credit','25','projekt- och entreprenadintäkter','äta|ändringsarbete|tilläggsarbete'),
    ('3170','Intäkt från fastprisprojekt','revenue','credit','25','projekt- och entreprenadintäkter','fast pris|entreprenadintäkt'),
    ('3180','Intäkt från löpande projekt','revenue','credit','25','projekt- och entreprenadintäkter','löpande räkning|timprojekt'),
    ('3190','Övriga projektintäkter','revenue','credit','25','projekt- och entreprenadintäkter','projektintäkt|byggintäkt'),
    ('3210','Varuförsäljning till företag inom EU','revenue','credit','EU0','internationell och momssärskild försäljning','eu-försäljning varor|gemenskapsintern leverans'),
    ('3220','Tjänsteförsäljning till företag inom EU','revenue','credit','EU0','internationell och momssärskild försäljning','eu-tjänst|omvänd beskattning kund'),
    ('3230','Varuexport utanför EU','revenue','credit','EXPORT0','internationell och momssärskild försäljning','export varor|utanför eu'),
    ('3240','Tjänsteexport utanför EU','revenue','credit','EXPORT0','internationell och momssärskild försäljning','export tjänst|utanför eu'),
    ('3250','Försäljning med omvänd skattskyldighet i Sverige','revenue','credit','RC25','internationell och momssärskild försäljning','omvänd moms försäljning|byggtjänst omvänd'),
    ('3260','Momsfri försäljning i Sverige','revenue','credit','0','internationell och momssärskild försäljning','momsfri intäkt|utan moms'),
    ('3310','Lämnade kundrabatter','revenue','debit',null,'försäljningsreduktioner','kundrabatt|rabatt'),
    ('3320','Lämnade bonusar och återbäringar','revenue','debit',null,'försäljningsreduktioner','bonus kund|återbäring'),
    ('3330','Returer och krediteringar','revenue','debit',null,'försäljningsreduktioner','kreditnota kund|retur'),
    ('3390','Övriga försäljningsreduktioner','revenue','debit',null,'försäljningsreduktioner','prisavdrag|försäljningsavdrag'),
    ('3410','Aktiverat arbete för egen räkning','revenue','credit','25','vidaredebitering och aktiverat arbete','eget arbete aktiverat|egen tillverkning'),
    ('3510','Vidaredebiterad frakt','revenue','credit','25','vidaredebitering och aktiverat arbete','fraktintäkt|debiterad transport'),
    ('3520','Vidaredebiterade resor','revenue','credit','25','vidaredebitering och aktiverat arbete','reseersättning kund|debiterad resa'),
    ('3530','Faktura- och administrationsavgifter','revenue','credit','25','vidaredebitering och aktiverat arbete','fakturaavgift|adminavgift'),
    ('3540','Vidaredebiterade myndighets- och tillståndsavgifter','revenue','credit','25','vidaredebitering och aktiverat arbete','tillståndsavgift kund|myndighetsavgift'),
    ('3590','Övriga vidaredebiterade kostnader','revenue','credit','25','vidaredebitering och aktiverat arbete','vidarefakturering|utlägg kund'),
    ('3610','Hyresintäkt för maskiner och utrustning','revenue','credit',null,'sidoverksamhet','maskinhyra intäkt|uthyrning'),
    ('3620','Hyresintäkt för lokaler och fastigheter','revenue','credit',null,'sidoverksamhet','lokalhyra intäkt|fastighetshyra'),
    ('3630','Licens- och royaltyintäkter','revenue','credit',null,'sidoverksamhet','royalty|licensintäkt'),
    ('3640','Service- och supportabonnemang','revenue','credit',null,'sidoverksamhet','serviceavtal|supportintäkt'),
    ('3690','Övriga sidoverksamhetsintäkter','revenue','credit',null,'sidoverksamhet','övrig rörelseintäkt|sidointäkt'),
    ('3710','Öres- och avrundningsdifferenser på kundfakturor','revenue','credit',null,'fakturadifferenser','avrundning|öresutjämning'),
    ('3720','Valutakursdifferenser på kundfordringar','revenue','credit',null,'fakturadifferenser','valutavinst kund|kursdifferens'),
    ('3810','Offentliga bidrag till rörelsen','revenue','credit',null,'bidrag och ersättningar','företagsstöd|bidrag'),
    ('3820','Försäkringsersättningar','revenue','credit',null,'bidrag och ersättningar','skadeersättning|försäkring intäkt'),
    ('3830','Skadestånd och avtalsersättningar','revenue','credit',null,'bidrag och ersättningar','skadestånd intäkt|vite erhållet'),
    ('3840','Ersättning för sjuklönekostnader','revenue','credit',null,'bidrag och ersättningar','sjuklöneersättning'),
    ('3890','Övriga ersättningar och bidrag','revenue','credit',null,'bidrag och ersättningar','övrigt bidrag|ersättning'),
    ('3910','Vinst vid försäljning av anläggningstillgångar','revenue','credit',null,'övriga rörelseintäkter','reavinst inventarie|såld maskin vinst'),
    ('3920','Vinst vid försäljning av värdepapper i rörelsen','revenue','credit',null,'övriga rörelseintäkter','värdepappersvinst'),
    ('3980','Övriga rörelseintäkter','revenue','credit',null,'övriga rörelseintäkter','övrig intäkt')
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
  array[source.category,'kontoklass 3'],
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
