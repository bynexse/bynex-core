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
const activationMigration = readFileSync(
  new URL(
    "supabase/migrations/20260808123900_bynex_standard_account_plan_activate.sql",
    root,
  ),
  "utf8",
);
const migration = [
  catalogMigration,
  ...classMigrations,
  activationMigration,
].join("\n");

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
  assert.match(activationMigration, /'complete_account_plan',true/);
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

test("the catalog is fail-closed until every class is loaded", () => {
  assert.match(catalogMigration, /status,\s*\n\s*license_scope/);
  assert.match(catalogMigration, /'draft',\s*\n\s*'internal'/);
  for (const classMigration of classMigrations) {
    assert.match(classMigration, /catalog\.status = 'draft'/);
    assert.match(classMigration, /on conflict \(catalog_id,account_number\)/);
  }
  assert.match(activationMigration, /v_expected_count constant integer := 482/);
  assert.match(activationMigration, /v_actual_count <> v_expected_count/);
  assert.match(activationMigration, /status = 'active'/);
});

test("activation replaces the starter without mass-activating accounts", () => {
  assert.match(
    activationMigration,
    /default_catalog_id = excluded\.default_catalog_id/,
  );
  assert.match(
    activationMigration,
    /previous\.catalog_code = 'BYNEX-STARTER'/,
  );
  assert.match(activationMigration, /set status = 'retired'/);
  assert.match(activationMigration, /update public\.ledger_accounts ledger/);
  assert.doesNotMatch(migration, /insert into public\.ledger_accounts/i);
  assert.match(activationMigration, /catalog_account_id = replacement\.id/);
  assert.match(activationMigration, /plan_mode = 'custom'/);
});

test("new companies remain ready for a later licensed BAS catalog", () => {
  assert.match(
    activationMigration,
    /when catalog\.source_kind = 'bas_machine_readable' then 'licensed_full'/,
  );
  assert.match(
    activationMigration,
    /when catalog\.source_kind = 'bynex_starter' then 'starter'/,
  );
  assert.match(activationMigration, /else 'custom'/);
  assert.match(migration, /future_official_bas_ready/);
  assert.match(catalogMigration, /predecessor_catalog_id/);
  assert.match(catalogMigration, /source_checksum_sha256/);
});
