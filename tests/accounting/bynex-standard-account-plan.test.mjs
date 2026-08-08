import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const catalogMigration = readFileSync(
  new URL(
    "supabase/migrations/20260808123000_bynex_standard_account_plan_catalog.sql",
    root,
  ),
  "utf8",
);
const classMigrations = Array.from({ length: 8 }, (_, index) =>
  readFileSync(
    new URL(
      `supabase/migrations/20260808123${index + 1}00_bynex_standard_account_plan_class_${index + 1}.sql`,
      root,
    ),
    "utf8",
  ),
);
const hardeningMigration = readFileSync(
  new URL(
    "supabase/migrations/20260808123850_bynex_standard_account_plan_accounting_hardening.sql",
    root,
  ),
  "utf8",
);
const activationMigration = readFileSync(
  new URL(
    "supabase/migrations/20260808123900_bynex_standard_account_plan_activate.sql",
    root,
  ),
  "utf8",
);
const accountPlanEngine = readFileSync(
  new URL(
    "supabase/migrations/20260807215500_versioned_searchable_account_plan.sql",
    root,
  ),
  "utf8",
);
const defaultModeMigration = readFileSync(
  new URL(
    "supabase/migrations/20260808124000_account_plan_default_mode_by_catalog.sql",
    root,
  ),
  "utf8",
);
const migration = [
  catalogMigration,
  ...classMigrations,
  hardeningMigration,
  activationMigration,
].join("\n");
const beforeApprovalFunction = activationMigration.split(
  "create or replace function public.approve_bynex_standard_account_plan",
)[0];
const approvalFunction = activationMigration.slice(beforeApprovalFunction.length);

const sqlString = String.raw`'(?:''|[^'])*'`;
const rowPattern = new RegExp(
  String.raw`\(\s*'(\d{4})'\s*,\s*(${sqlString})\s*,\s*'(asset|liability|equity|revenue|expense)'\s*,\s*'(debit|credit)'\s*,\s*(null|${sqlString})\s*,\s*(${sqlString})\s*,\s*(${sqlString})\s*\)`,
  "g",
);
const decodeSqlString = (value) =>
  value === "null" ? null : value.slice(1, -1).replaceAll("''", "'");

const accounts = classMigrations.flatMap((source) =>
  [...source.matchAll(rowPattern)].map((match) => ({
    accountNumber: match[1],
    name: decodeSqlString(match[2]),
    accountType: match[3],
    normalBalance: match[4],
    vatCode: decodeSqlString(match[5]),
    category: decodeSqlString(match[6]),
    synonyms: decodeSqlString(match[7])
      .split("|")
      .filter(Boolean),
  })),
);

test("Bynex standard plan is independent and never presented as official BAS", () => {
  assert.match(catalogMigration, /Bynex standardkontoplan 2026/);
  assert.match(approvalFunction, /'complete_account_plan',true/);
  assert.match(activationMigration, /'complete_bas_plan',false/);
  assert.match(activationMigration, /'official_bas',false/);
  assert.match(activationMigration, /'independent_catalog',true/);
  assert.match(activationMigration, /'future_official_bas_ready',true/);
  assert.match(migration, /accounting_review_required_before_public_launch/);
  assert.doesNotMatch(migration, /'complete_bas_plan',true/);
  assert.doesNotMatch(migration, /'official_bas',true/);
  assert.doesNotMatch(
    migration,
    /display_name[\s\S]{0,300}'BAS(?:\s|-)2026'/i,
  );
});

test("the authored catalog is broad, unique and covers all eight account classes", () => {
  assert.equal(accounts.length, 482);
  const numbers = accounts.map((account) => account.accountNumber);
  assert.equal(new Set(numbers).size, accounts.length);

  const classCounts = new Map();
  for (const account of accounts) {
    assert.match(account.accountNumber, /^[1-8]\d{3}$/);
    assert.ok(account.name);
    assert.ok(account.category);
    assert.ok(
      ["asset", "liability", "equity", "revenue", "expense"].includes(
        account.accountType,
      ),
    );
    assert.ok(["debit", "credit"].includes(account.normalBalance));
    classCounts.set(
      account.accountNumber[0],
      (classCounts.get(account.accountNumber[0]) ?? 0) + 1,
    );
  }

  for (const accountClass of ["1", "2", "3", "4", "5", "6", "7", "8"]) {
    assert.ok(
      (classCounts.get(accountClass) ?? 0) >= 10,
      `account class ${accountClass} is too small`,
    );
  }
});

test("construction, payroll, VAT and year-end workflows have searchable accounts", () => {
  const byNumber = new Map(
    accounts.map((account) => [account.accountNumber, account]),
  );
  for (const number of [
    "1510",
    "1513",
    "1930",
    "2440",
    "2611",
    "2641",
    "3110",
    "3160",
    "4010",
    "4210",
    "4330",
    "4540",
    "5430",
    "5610",
    "7010",
    "7510",
    "7710",
    "8810",
    "8910",
  ]) {
    assert.ok(byNumber.has(number), `missing required account ${number}`);
  }

  assert.match(byNumber.get("3160").name, /ÄTA/);
  assert.ok(byNumber.get("4210").synonyms.includes("underentreprenör"));
  assert.ok(byNumber.get("4330").synonyms.includes("omvänd byggmoms"));
  assert.ok(byNumber.get("7010").synonyms.includes("hantverkarlön"));
  assert.equal(byNumber.get("2611").vatCode, "25");
  assert.equal(byNumber.get("4330").vatCode, "RC25");
});

test("the catalog is fail-closed until every class and hardening rule is loaded", () => {
  assert.match(catalogMigration, /status,\s*\n\s*license_scope/);
  assert.match(catalogMigration, /'draft',\s*\n\s*'internal'/);
  for (const classMigration of classMigrations) {
    assert.match(classMigration, /catalog\.status = 'draft'/);
    assert.match(classMigration, /on conflict \(catalog_id,account_number\)/);
  }
  assert.match(hardeningMigration, /requires exactly 482|kräver exakt 482/);
  assert.match(activationMigration, /v_expected_count constant integer := 482/);
  assert.match(activationMigration, /v_actual_count <> v_expected_count/);
  assert.match(beforeApprovalFunction, /status = 'draft'/);
  assert.match(beforeApprovalFunction, /'installation_state','review_ready'/);
  assert.doesNotMatch(beforeApprovalFunction, /status = 'active'/);
  assert.doesNotMatch(beforeApprovalFunction, /default_catalog_id/);
});

test("framework and legal-form filters use real lowercase organization values", () => {
  assert.match(
    hardeningMigration,
    /reporting_frameworks = array\['k1','k2','k3'\]::text\[\]/,
  );
  assert.match(
    hardeningMigration,
    /reporting_frameworks = array\['k3'\]::text\[/,
  );
  assert.match(hardeningMigration, /'sole_trader','trading_partnership','limited_partnership'/);
  assert.match(hardeningMigration, /'limited_company','economic_association'/);
  assert.match(hardeningMigration, /Företagsskattekonto får inte föreslås för enskild firma/);
  assert.doesNotMatch(
    hardeningMigration,
    /set\s+reporting_frameworks\s*=\s*array\['K1','K2','K3'\]/,
  );
  assert.match(accountPlanEngine, /v_business_form = any\(catalog_account\.business_forms\)/);
  assert.match(accountPlanEngine, /v_framework = any\(catalog_account\.reporting_frameworks\)/);
});

test("VAT suggestions are document-first and ordinary expense accounts carry no fixed rate", () => {
  assert.match(hardeningMigration, /'vat_hint_policy','document_first'/);
  assert.match(hardeningMigration, /vat_decision_source','document_and_counterparty'/);
  assert.match(
    hardeningMigration,
    /account\.account_number not in \('4310','4320','4330','4340','4350','4390'\)/,
  );
  assert.match(hardeningMigration, /Projektmaterial med avvikande momshantering/);
  assert.match(hardeningMigration, /osäker fast momskod/);
  assert.match(
    hardeningMigration,
    /account_number in \('4090','7540'\)[\s\S]*normal_balance <> 'credit'/,
  );
});

test("year-end, tax and valuation accounts require a human accounting decision", () => {
  assert.match(hardeningMigration, /requires_manual_review',true/);
  assert.match(hardeningMigration, /smart_auto_activation_allowed',false/);
  assert.match(hardeningMigration, /Year-end, tax, valuation, impairment, accrual/);
  for (const account of ["1470", "1518", "2110", "2510", "4430", "7790", "8810", "8910"]) {
    assert.match(hardeningMigration, new RegExp(`'${account}'|between '${account}'`));
  }
  assert.match(approvalFunction, /Ett högriskkonto tillåter fortfarande automatisk aktivering/);
});

test("activation requires a named platform reviewer and the exact canonical checksum", () => {
  assert.match(activationMigration, /extensions\.digest/);
  assert.match(activationMigration, /jsonb_agg\([\s\S]*order by account\.account_number/);
  assert.match(activationMigration, /approve_bynex_standard_account_plan/);
  assert.match(approvalFunction, /private\.is_platform_staff/);
  assert.match(approvalFunction, /p_expected_checksum/);
  assert.match(approvalFunction, /p_review_reference/);
  assert.match(approvalFunction, /innehåll har ändrats sedan granskningen/);
  assert.match(approvalFunction, /status = 'active'/);
  assert.match(approvalFunction, /default_catalog_id = excluded\.default_catalog_id/);
  assert.match(approvalFunction, /previous\.catalog_code = 'BYNEX-STARTER'/);
  assert.match(approvalFunction, /set status = 'retired'/);
  assert.match(approvalFunction, /update public\.ledger_accounts ledger/);
  assert.doesNotMatch(
    migration,
    /perform\s+public\.approve_bynex_standard_account_plan/i,
  );
});

test("reviewed activation never mass-activates all catalog accounts or rewrites vouchers", () => {
  assert.doesNotMatch(migration, /insert into public\.ledger_accounts/i);
  assert.match(approvalFunction, /catalog_account_id = replacement\.id/);
  assert.doesNotMatch(approvalFunction, /update public\.bookkeeping_vouchers/i);
  assert.doesNotMatch(approvalFunction, /delete from public\.bookkeeping_/i);
});

test("new companies derive plan mode from the selected platform catalog", () => {
  assert.match(
    defaultModeMigration,
    /when catalog\.source_kind = 'bas_machine_readable' then 'licensed_full'/,
  );
  assert.match(
    defaultModeMigration,
    /when catalog\.source_kind = 'bynex_starter' then 'starter'/,
  );
  assert.match(
    defaultModeMigration,
    /when catalog\.source_kind = 'customer_owned' then 'customer_owned'/,
  );
  assert.match(defaultModeMigration, /else 'custom'/);
  assert.match(defaultModeMigration, /catalog\.status = 'active'/);
  assert.match(migration, /future_official_bas_ready/);
  assert.match(catalogMigration, /predecessor_catalog_id/);
  assert.match(activationMigration, /source_checksum_sha256/);
});
