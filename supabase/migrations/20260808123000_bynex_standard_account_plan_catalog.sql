begin;

-- Bynex standardkontoplan is authored independently by Bynex.
-- It is not the official BAS catalog and must never be presented as BAS.
-- The catalog remains draft until every class has been loaded and the final
-- activation migration has validated all 482 accounts.

alter table public.account_plan_catalogs
  drop constraint if exists account_plan_catalogs_source_kind_check;
alter table public.account_plan_catalogs
  add constraint account_plan_catalogs_source_kind_check
  check (
    source_kind in (
      'bynex_starter',
      'bynex_standard',
      'bas_machine_readable',
      'sie',
      'customer_owned',
      'custom'
    )
  );

insert into public.account_plan_catalogs (
  id,
  catalog_code,
  version_label,
  version_year,
  display_name,
  source_kind,
  status,
  license_scope,
  source_url,
  license_reference,
  source_checksum_sha256,
  predecessor_catalog_id,
  published_on,
  account_count,
  imported_at,
  imported_by_user_id,
  metadata
) values (
  'b1e00000-2026-4000-8000-000000000002'::uuid,
  'BYNEX-STANDARD',
  '2026.1',
  2026,
  'Bynex standardkontoplan 2026',
  'bynex_standard',
  'draft',
  'internal',
  'https://bynex.se',
  'Bynex-authored internal catalog 2026.1',
  '707a41aa6e17fb63377cabf3bf2a479ae5ff69687412709dbd2752d23b358352',
  'b1e00000-2026-4000-8000-000000000001'::uuid,
  date '2026-08-08',
  0,
  now(),
  null,
  jsonb_build_object(
    'complete_account_plan',false,
    'complete_bas_plan',false,
    'official_bas',false,
    'independent_catalog',true,
    'authored_by','Bynex',
    'installation_state','loading',
    'expected_account_count',482,
    'accounting_review_required_before_public_launch',true,
    'future_official_bas_ready',true,
    'supersedes_catalog_code','BYNEX-STARTER'
  )
)
on conflict (catalog_code,version_label) do update
set display_name = excluded.display_name,
    source_kind = excluded.source_kind,
    status = 'draft',
    license_scope = excluded.license_scope,
    source_url = excluded.source_url,
    license_reference = excluded.license_reference,
    source_checksum_sha256 = excluded.source_checksum_sha256,
    predecessor_catalog_id = excluded.predecessor_catalog_id,
    published_on = excluded.published_on,
    metadata = excluded.metadata,
    updated_at = now();

commit;
