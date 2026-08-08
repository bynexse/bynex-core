import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const compatibilityMigration = readFileSync(
  new URL(
    "supabase/migrations/20260808165000_bynex_standard_account_plan_system_account_compatibility.sql",
    root,
  ),
  "utf8",
);

test("the full Bynex catalog preserves every canonical starter system account", () => {
  assert.match(compatibilityMigration, /account\.account_number = '3021'/);
  assert.match(compatibilityMigration, /'3041'/);
  assert.match(
    compatibilityMigration,
    /Försäljning tjänster 25 % moms/,
  );
  assert.match(
    compatibilityMigration,
    /starter\.catalog_id = v_starter_id[\s\S]*replacement\.account_number = starter\.account_number/,
  );
  assert.match(
    compatibilityMigration,
    /Alla befintliga Bynex-systemkonton måste finnas i standardkontoplanen/,
  );
});

test("the compatibility replacement is fail-closed and keeps the reviewed catalog stable", () => {
  assert.match(
    compatibilityMigration,
    /catalog\.metadata->>'installation_state' = 'review_ready'/,
  );
  assert.match(compatibilityMigration, /v_count <> 482/);
  assert.match(
    compatibilityMigration,
    /account\.account_number = '3041'[\s\S]*account\.vat_code = '25'/,
  );
  assert.match(
    compatibilityMigration,
    /account\.account_number = '3021'[\s\S]*raise exception 'Intäktskontot 3041/,
  );
  assert.match(compatibilityMigration, /extensions\.digest/);
  assert.match(
    compatibilityMigration,
    /'system_account_compatibility','3041'/,
  );
  assert.match(compatibilityMigration, /'activation_performed',false/);
  assert.doesNotMatch(
    compatibilityMigration,
    /update public\.bookkeeping_vouchers|delete from public\.bookkeeping_/i,
  );
});
