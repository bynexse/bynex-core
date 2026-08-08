import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// The licensed catalog is installed only through the reviewed, versioned import path.
const root = new URL("../../", import.meta.url);
const migration = readFileSync(
  new URL(
    "supabase/migrations/20260807215500_versioned_searchable_account_plan.sql",
    root,
  ),
  "utf8",
);
const api = readFileSync(
  new URL("app/api/private/bookkeeping/account-plan/route.ts", root),
  "utf8",
);
const panel = readFileSync(
  new URL("components/modules/bookkeeping/AccountPlanCenter.tsx", root),
  "utf8",
);
const workspace = readFileSync(
  new URL(
    "components/modules/bookkeeping/BynexBookkeepingWorkspace.tsx",
    root,
  ),
  "utf8",
);
const packageJson = readFileSync(new URL("package.json", root), "utf8");
const qualityWorkflow = readFileSync(
  new URL(".github/workflows/bynex-quality.yml", root),
  "utf8",
);

test("the complete catalog remains separate from company ledger accounts", () => {
  assert.match(migration, /create table if not exists public\.account_plan_catalogs/);
  assert.match(
    migration,
    /create table if not exists public\.account_plan_catalog_accounts/,
  );
  assert.match(
    migration,
    /create table if not exists public\.organization_account_plan_settings/,
  );
  assert.match(migration, /alter table public\.ledger_accounts/);
  assert.match(migration, /catalog_account_id/);
  assert.match(migration, /origin in \('system','catalog','custom','sie','import'\)/);
  assert.match(migration, /selected_catalog_id/);
  assert.match(migration, /upgrade_policy in \('review','manual'\)/);
});

test("the internal starter set is honest and never claims to be full BAS", () => {
  assert.match(migration, /BYNEX-STARTER/);
  assert.match(migration, /Bynex startkontoplan 2026/);
  assert.match(migration, /'complete_bas_plan',false/);
  assert.match(migration, /Safe minimum accounts before a licensed full plan is installed/);
  assert.doesNotMatch(migration, /'complete_bas_plan',true[\s\S]{0,300}BYNEX-STARTER/);
  for (const account of [
    "1510",
    "1513",
    "1930",
    "2013",
    "2018",
    "2440",
    "2611",
    "2641",
    "3041",
    "4010",
  ]) {
    assert.match(migration, new RegExp(`'${account}'`));
  }
});

test("licensed machine-readable BAS installation is versioned, hashed and fail closed", () => {
  assert.match(migration, /install_account_plan_catalog/);
  assert.match(migration, /source_checksum_sha256/);
  assert.match(migration, /commercial_sublicense/);
  assert.match(migration, /Licensreferens för den maskinläsbara BAS-kontoplanen krävs/);
  assert.match(migration, /Katalogversionen finns redan med ett annat innehåll/);
  assert.match(migration, /jsonb_array_length\(p_accounts\) > 10000/);
  assert.match(migration, /account_plan_catalog_events/);
  assert.match(migration, /predecessor_catalog_id/);
  assert.match(api, /createHash\("sha256"\)/);
  assert.match(api, /12 \* 1024 \* 1024/);
  assert.match(api, /canInstallCatalog/);
  assert.match(api, /platform_staff/);
});

test("the full selected catalog is searchable without activating every account", () => {
  assert.match(migration, /search_account_plan/);
  assert.match(migration, /to_tsvector\('simple'::regconfig,search_text\)/);
  assert.match(migration, /plainto_tsquery\('simple',v_query\)/);
  assert.match(migration, /Sökbart i vald kontoplanskatalog – aktiveras först efter ditt val/);
  assert.match(migration, /activate_account_plan_account/);
  assert.match(migration, /on conflict \(organization_id,account_number\) do update/);
  assert.doesNotMatch(
    migration,
    /insert into public\.ledger_accounts[\s\S]{0,500}select[\s\S]{0,500}account_plan_catalog_accounts/,
  );
  assert.doesNotMatch(api, /activateAll|bulkActivate|Promise\.all\([^)]*activate_account/i);
});

test("Smart account suggestions learn but never post or activate silently", () => {
  assert.match(migration, /suggest_account_plan_accounts/);
  assert.match(migration, /bynex_document_analyses/);
  assert.match(migration, /bookkeeping_voucher_lines/);
  assert.match(migration, /prior_analysis_hits/);
  assert.match(migration, /prior_voucher_hits/);
  assert.match(migration, /måste aktiveras före bokföring/);
  assert.doesNotMatch(migration, /post_bookkeeping_voucher/);
  assert.doesNotMatch(migration, /perform public\.activate_account_plan_account/);
  assert.match(panel, /Du väljer alltid själv innan något används/);
  assert.match(
    panel,
    /Smart föreslår men bokför aldrig eller aktiverar konto utan ditt beslut/,
  );
});

test("account plan writes are role controlled and catalog tables are read only to customers", () => {
  assert.match(migration, /array\['owner','admin'\]::text\[\]/);
  assert.match(migration, /private\.is_platform_staff\(null\)/);
  assert.match(migration, /revoke all on public\.account_plan_catalogs/);
  assert.match(migration, /grant select on public\.account_plan_catalogs to authenticated/);
  assert.match(migration, /revoke all on function public\.install_account_plan_catalog/);
  assert.match(migration, /to authenticated/);
  assert.match(migration, /organization_account_plan_settings_finance_read/);
  assert.match(migration, /private\.write_audit_log/);
});

test("the premium workspace explains catalog status and keeps the flow simple", () => {
  for (const phrase of [
    "Hela kontoplanen utan att överväldiga hantverkaren",
    "Sök först – aktivera bara det du använder",
    "full licensierad katalog är inte installerad",
    "Beskriv vad som hände – inte bokföringskontot",
    "Aktivera konto",
    "Katalog & version",
    "Versionerad kontoplan",
  ]) {
    assert.ok(
      panel.toLocaleLowerCase("sv-SE").includes(
        phrase.toLocaleLowerCase("sv-SE"),
      ),
      `missing account-plan interface phrase: ${phrase}`,
    );
  }
  assert.match(panel, /action: "activate_account"/);
  assert.match(panel, /action: "select_catalog"/);
  assert.match(panel, /action: "install_catalog"/);
  assert.match(panel, /action: "set_platform_default"/);
  assert.match(panel, /mode", "suggest"/);
});

test("Bynex Bookkeeping exposes a dedicated account plan workspace", () => {
  assert.match(workspace, /\| "account-plan"/);
  assert.match(workspace, /label: "Kontoplan"/);
  assert.match(workspace, /AccountPlanCenter/);
  assert.match(workspace, /active === "account-plan"/);
});

test("the account plan regression suite is a required quality gate", () => {
  assert.match(packageJson, /"test:account-plan"/);
  assert.match(qualityWorkflow, /Verify versioned account plan/);
  assert.match(qualityWorkflow, /npm run test:account-plan/);
});

test("account activation callbacks support the async server decision", () => {
  assert.match(
    panel,
    /onActivate: \(\) => void \| Promise<void> \| undefined/,
  );
});

test("search indexes use only immutable index expressions", () => {
  assert.match(migration, /to_tsvector\('simple'::regconfig,search_text\)/);
  assert.match(migration, /ledger_accounts_search_aliases_idx/);
  assert.doesNotMatch(
    migration,
    /ledger_accounts_search_idx[\s\S]{0,500}array_to_string\(search_aliases/,
  );
});
