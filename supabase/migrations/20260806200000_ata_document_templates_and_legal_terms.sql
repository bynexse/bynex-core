begin;

-- Extend the reusable document-template catalogue. Contract standards such as
-- AB 04, ABT 06 and Hantverkarformuläret are references only; their licensed
-- or official full text is never copied into Bynex-owned templates.
alter table public.document_template_catalog
  drop constraint if exists document_template_catalog_document_type_check;
alter table public.document_template_catalog
  add constraint document_template_catalog_document_type_check
  check (document_type in (
    'quote','change_order','invoice','time_report','payslip',
    'self_control','inspection_protocol','warranty_certificate',
    'agreement','checklist','daily_log'
  ));

alter table public.organization_document_templates
  drop constraint if exists organization_document_templates_document_type_check;
alter table public.organization_document_templates
  add constraint organization_document_templates_document_type_check
  check (document_type in (
    'quote','change_order','invoice','time_report','payslip',
    'self_control','inspection_protocol','warranty_certificate',
    'agreement','checklist','daily_log'
  ));

insert into public.document_template_catalog (
  template_key,
  name,
  document_type,
  industry,
  jurisdiction,
  version_label,
  content_schema,
  license_status,
  source_url,
  legal_review_required,
  active
)
values
  (
    'change_order_business_estimated_se',
    'Bynex ÄTA – företag, uppskattat pris',
    'change_order',
    'construction',
    'SE',
    'bynex-1',
    jsonb_build_object(
      'customer_context','business',
      'price_type','estimated',
      'sections',jsonb_build_array(
        'parties','project','scope','reason','price','price_range','schedule',
        'assumptions','exclusions','agreement_reference','legal_terms',
        'warranty_terms','payment_terms','attachments','customer_decision'
      ),
      'defaults',jsonb_build_object(
        'agreement_reference','Huvudavtal eller projektavtal',
        'legal_terms','Denna ÄTA kompletterar parternas huvudavtal. Vid motstridiga uppgifter gäller huvudavtalet om parterna inte uttryckligen avtalar annat i den låsta ÄTA-versionen. Ändrad omfattning, tid eller ersättning dokumenteras i en ny version före fortsatt arbete.',
        'warranty_terms','Garanti, ansvarstid och avhjälpande följer huvudavtalet om inget annat uttryckligen anges i denna ÄTA.',
        'payment_terms','Fakturering sker enligt huvudavtalet efter godkänd ÄTA och utfört eller attesterat arbete.'
      )
    ),
    'owned',
    null,
    true,
    true
  ),
  (
    'change_order_business_fixed_se',
    'Bynex ÄTA – företag, fast pris',
    'change_order',
    'construction',
    'SE',
    'bynex-1',
    jsonb_build_object(
      'customer_context','business',
      'price_type','fixed',
      'sections',jsonb_build_array(
        'parties','project','scope','reason','fixed_price','schedule',
        'assumptions','exclusions','agreement_reference','legal_terms',
        'warranty_terms','payment_terms','attachments','customer_decision'
      ),
      'defaults',jsonb_build_object(
        'agreement_reference','Huvudavtal eller projektavtal',
        'legal_terms','Det fasta priset gäller den uttryckligen beskrivna omfattningen och de angivna förutsättningarna. Ny eller ändrad omfattning dokumenteras och godkänns separat innan arbetet utökas.',
        'warranty_terms','Garanti, ansvarstid och avhjälpande följer huvudavtalet om inget annat uttryckligen anges i denna ÄTA.',
        'payment_terms','Fakturering sker enligt huvudavtalet och den betalningsplan som anges för denna ÄTA.'
      )
    ),
    'owned',
    null,
    true,
    true
  ),
  (
    'change_order_business_running_se',
    'Bynex ÄTA – företag, löpande räkning',
    'change_order',
    'construction',
    'SE',
    'bynex-1',
    jsonb_build_object(
      'customer_context','business',
      'price_type','running_account',
      'sections',jsonb_build_array(
        'parties','project','scope','reason','rates','estimated_total','schedule',
        'assumptions','exclusions','agreement_reference','legal_terms',
        'warranty_terms','payment_terms','attachments','customer_decision'
      ),
      'defaults',jsonb_build_object(
        'agreement_reference','Huvudavtal eller projektavtal',
        'legal_terms','Arbetet debiteras enligt avtalade priser och verifierat utfall. Väsentliga förändringar i omfattning eller förväntat slutbelopp kommuniceras och dokumenteras innan ytterligare kostnadsdrivande arbete utförs.',
        'warranty_terms','Garanti, ansvarstid och avhjälpande följer huvudavtalet om inget annat uttryckligen anges i denna ÄTA.',
        'payment_terms','Tid, material, maskiner och underentreprenörer faktureras enligt angivna priser och godkända underlag.'
      )
    ),
    'owned',
    null,
    true,
    true
  ),
  (
    'change_order_consumer_estimated_se',
    'Bynex ÄTA – privatkund, uppskattat pris',
    'change_order',
    'construction',
    'SE',
    'bynex-1',
    jsonb_build_object(
      'customer_context','consumer',
      'price_type','estimated',
      'sections',jsonb_build_array(
        'parties','project','scope','reason','price','price_range','schedule',
        'assumptions','exclusions','consumer_price_notice','legal_terms',
        'warranty_terms','payment_terms','attachments','customer_decision'
      ),
      'defaults',jsonb_build_object(
        'agreement_reference','Kundens huvudavtal för hantverkstjänsten',
        'legal_terms','ÄTA-underlaget kompletterar parternas huvudavtal. Företaget ska dokumentera ny eller ändrad omfattning och inhämta kundens godkännande innan ytterligare kostnadsdrivande arbete utförs, utom när lag eller huvudavtal medger annat.',
        'warranty_terms','Avtalad garanti anges särskilt. Kundens rättigheter enligt tvingande konsumentskyddsregler begränsas inte av denna text.',
        'payment_terms','Betalning och fakturering sker enligt huvudavtalet och det godkända ÄTA-underlaget.',
        'consumer_price_notice','För privatkund gäller konsumenttjänstlagen. En ungefärlig prisuppgift får normalt inte överskridas med mer än 15 procent, om inte annan prisgräns har avtalats eller företaget har rätt till pristillägg enligt lagen.'
      )
    ),
    'owned',
    'https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/konsumenttjanstlag-1985716_sfs-1985-716/',
    true,
    true
  ),
  (
    'change_order_consumer_fixed_se',
    'Bynex ÄTA – privatkund, fast pris',
    'change_order',
    'construction',
    'SE',
    'bynex-1',
    jsonb_build_object(
      'customer_context','consumer',
      'price_type','fixed',
      'sections',jsonb_build_array(
        'parties','project','scope','reason','fixed_price','schedule',
        'assumptions','exclusions','legal_terms','warranty_terms',
        'payment_terms','attachments','customer_decision'
      ),
      'defaults',jsonb_build_object(
        'agreement_reference','Kundens huvudavtal för hantverkstjänsten',
        'legal_terms','Det fasta priset gäller den uttryckligen beskrivna omfattningen och de angivna förutsättningarna. Ändrad omfattning dokumenteras och godkänns separat innan arbetet utökas. Tvingande konsumentskyddsregler gäller alltid.',
        'warranty_terms','Avtalad garanti anges särskilt. Kundens rättigheter enligt tvingande konsumentskyddsregler begränsas inte av denna text.',
        'payment_terms','Betalning och fakturering sker enligt huvudavtalet och det godkända ÄTA-underlaget.'
      )
    ),
    'owned',
    'https://www.konsumentverket.se/marknadsratt-foretag/boende-regler-for-foretag/',
    true,
    true
  ),
  (
    'change_order_start_now_price_later_se',
    'Bynex ÄTA – startbesked, pris kompletteras',
    'change_order',
    'construction',
    'SE',
    'bynex-1',
    jsonb_build_object(
      'customer_context','all',
      'price_type','estimated',
      'sections',jsonb_build_array(
        'parties','project','urgent_scope','reason','start_authorization',
        'price_followup_deadline','agreement_reference','legal_terms',
        'attachments','customer_decision'
      ),
      'defaults',jsonb_build_object(
        'agreement_reference','Huvudavtal eller projektavtal',
        'legal_terms','Kunden godkänner endast den tydligt avgränsade arbetsstart som beskrivs här. Prisunderlaget ska kompletteras och godkännas separat inom angiven tid. Ytterligare arbete utanför startbeskedet kräver ett nytt dokumenterat beslut.',
        'warranty_terms','Garanti och ansvar följer huvudavtalet och den slutligt godkända omfattningen.',
        'payment_terms','Fakturering får endast avse godkänt och verifierat arbete enligt startbeskedet och senare godkänd prisversion.'
      )
    ),
    'owned',
    null,
    true,
    true
  ),
  (
    'change_order_consumer_hf17_reference_se',
    'ÄTA privatkund – referens Hantverkarformuläret 17',
    'change_order',
    'construction',
    'SE',
    'reference-2026',
    jsonb_build_object(
      'customer_context','consumer',
      'price_type','estimated',
      'reference_only',true,
      'reference_notice','Detta är en Bynex-komplettering och inte den fullständiga officiella blanketten. Använd originalblanketten när huvudavtalet kräver det.',
      'sections',jsonb_build_array(
        'parties','project','scope','reason','price','schedule','legal_terms',
        'warranty_terms','payment_terms','attachments','customer_decision'
      ),
      'defaults',jsonb_build_object(
        'agreement_reference','Hantverkarformuläret 17 – referens till parternas undertecknade huvudavtal',
        'legal_terms','Detta ÄTA-underlag kompletterar parternas undertecknade huvudavtal. Originalavtalets villkor och tillämplig konsumentlagstiftning gäller. Ändrad omfattning dokumenteras före fortsatt arbete.',
        'warranty_terms','Avtalad garanti anges särskilt. Kundens lagstadgade rättigheter påverkas inte.',
        'payment_terms','Betalning och fakturering sker enligt huvudavtalet och detta godkända tillägg.'
      )
    ),
    'reference_only',
    'https://www.konsumentverket.se/marknadsratt-foretag/boende-regler-for-foretag/',
    true,
    true
  )
on conflict (template_key) do update set
  name = excluded.name,
  document_type = excluded.document_type,
  industry = excluded.industry,
  jurisdiction = excluded.jurisdiction,
  version_label = excluded.version_label,
  content_schema = excluded.content_schema,
  license_status = excluded.license_status,
  source_url = excluded.source_url,
  legal_review_required = excluded.legal_review_required,
  active = excluded.active,
  updated_at = now();

alter table public.change_order_versions
  add column if not exists document_template_key text not null
    default 'change_order_business_estimated_se',
  add column if not exists document_template_name text not null
    default 'Bynex ÄTA – företag, uppskattat pris',
  add column if not exists customer_context text not null default 'business',
  add column if not exists agreement_reference text,
  add column if not exists legal_terms text not null default '',
  add column if not exists warranty_terms text not null default '',
  add column if not exists payment_terms text not null default '',
  add column if not exists consumer_price_notice text,
  add column if not exists template_snapshot jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'change_order_versions_document_template_key_check'
  ) then
    alter table public.change_order_versions
      add constraint change_order_versions_document_template_key_check
      check (document_template_key ~ '^[a-z0-9_]{3,100}$');
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'change_order_versions_document_template_name_check'
  ) then
    alter table public.change_order_versions
      add constraint change_order_versions_document_template_name_check
      check (char_length(btrim(document_template_name)) between 3 and 200);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'change_order_versions_customer_context_check'
  ) then
    alter table public.change_order_versions
      add constraint change_order_versions_customer_context_check
      check (customer_context in ('business','consumer','all'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'change_order_versions_agreement_reference_check'
  ) then
    alter table public.change_order_versions
      add constraint change_order_versions_agreement_reference_check
      check (agreement_reference is null or char_length(btrim(agreement_reference)) between 2 and 500);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'change_order_versions_legal_terms_check'
  ) then
    alter table public.change_order_versions
      add constraint change_order_versions_legal_terms_check
      check (char_length(legal_terms) <= 6000);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'change_order_versions_warranty_terms_check'
  ) then
    alter table public.change_order_versions
      add constraint change_order_versions_warranty_terms_check
      check (char_length(warranty_terms) <= 4000);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'change_order_versions_payment_terms_check'
  ) then
    alter table public.change_order_versions
      add constraint change_order_versions_payment_terms_check
      check (char_length(payment_terms) <= 4000);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'change_order_versions_consumer_price_notice_check'
  ) then
    alter table public.change_order_versions
      add constraint change_order_versions_consumer_price_notice_check
      check (consumer_price_notice is null or char_length(btrim(consumer_price_notice)) between 20 and 2000);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'change_order_versions_template_snapshot_check'
  ) then
    alter table public.change_order_versions
      add constraint change_order_versions_template_snapshot_check
      check (jsonb_typeof(template_snapshot) = 'object');
  end if;
end
$$;

create index if not exists change_order_versions_template_idx
  on public.change_order_versions (organization_id, document_template_key, created_at desc);

create or replace function public.get_change_order_customer_decision_payload(
  p_version_id uuid,
  p_secret text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token record;
  v_payload jsonb;
begin
  if char_length(coalesce(p_secret,'')) <> 64 then return null; end if;

  select t.* into v_token
  from private.change_order_approval_tokens t
  where t.change_order_version_id = p_version_id
    and t.token_hash = encode(extensions.digest(p_secret,'sha256'),'hex')
    and t.used_at is null
    and t.expires_at > now();

  if v_token.id is null then return null; end if;

  select jsonb_build_object(
    'organization_name',o.name,
    'change_order_number',c.change_order_number,
    'project_name',p.name,
    'project_number',p.project_number,
    'customer_name',c.customer_name,
    'expires_at',v_token.expires_at,
    'version',jsonb_build_object(
      'id',v.id,
      'version_number',v.version_number,
      'title',v.title,
      'customer_description',v.customer_description,
      'currency',v.currency,
      'vat_percent',v.vat_percent,
      'labor_hours',v.labor_hours,
      'price_ex_vat',v.price_ex_vat,
      'vat_amount',v.vat_amount,
      'price_inc_vat',v.price_inc_vat,
      'estimated_working_days',v.estimated_working_days,
      'proposed_start_date',v.proposed_start_date,
      'proposed_end_date',v.proposed_end_date,
      'assumptions',v.assumptions,
      'exclusions',v.exclusions,
      'price_type',v.price_type,
      'price_disclaimer',v.price_disclaimer,
      'document_template_key',v.document_template_key,
      'document_template_name',v.document_template_name,
      'customer_context',v.customer_context,
      'agreement_reference',v.agreement_reference,
      'legal_terms',v.legal_terms,
      'warranty_terms',v.warranty_terms,
      'payment_terms',v.payment_terms,
      'consumer_price_notice',v.consumer_price_notice,
      'template_snapshot',v.template_snapshot,
      'content_hash',v.content_hash
    ),
    'lines',coalesce((
      select jsonb_agg(jsonb_build_object(
        'category',li.category,
        'description',li.description,
        'quantity',li.quantity,
        'unit',li.unit,
        'sell_amount',li.sell_amount
      ) order by li.sort_order,li.id)
      from public.change_order_line_items li
      where li.organization_id = v_token.organization_id
        and li.change_order_version_id = p_version_id
    ),'[]'::jsonb)
  ) into v_payload
  from public.change_order_versions v
  join public.change_orders c
    on c.organization_id = v.organization_id
   and c.id = v.change_order_id
  join public.organizations o on o.id = v.organization_id
  join public.projects p
    on p.organization_id = c.organization_id
   and p.id = c.project_id
  where v.organization_id = v_token.organization_id
    and v.id = p_version_id
    and v.change_order_id = v_token.change_order_id
    and v.status = 'customer_review'
    and v.frozen_at is not null
    and v.content_hash is not null;

  return v_payload;
end;
$$;

revoke all on function public.get_change_order_customer_decision_payload(uuid,text)
  from public;
grant execute on function public.get_change_order_customer_decision_payload(uuid,text)
  to anon, authenticated;

comment on column public.change_order_versions.document_template_key is
  'Bynex template catalogue key frozen with the ÄTA version.';
comment on column public.change_order_versions.template_snapshot is
  'Immutable-at-send snapshot of template metadata and selected legal sections.';
comment on column public.change_order_versions.consumer_price_notice is
  'Optional consumer-facing notice; never used as a substitute for legal review.';

select pg_notify('pgrst','reload schema');

commit;
