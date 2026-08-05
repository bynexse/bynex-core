import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(new URL("../../app/api/private/accounting/sie/route.ts", import.meta.url), "utf8");

test("SIE-routen kräver verifierad användare, ekonomroll och aktiv bokföringsrättighet", () => {
  assert.match(route, /requireSupabaseUser\(\)/);
  assert.match(route, /organization_members/);
  assert.match(route, /financeRoles\.has\(membership\.role\)/);
  assert.match(route, /active_organization_module_entitlements/);
  assert.match(route, /module_slug", "bookkeeping"/);
});

test("alla bokföringsfrågor är organisationsfiltrerade och service role används inte", () => {
  assert.match(route, /\.eq\("organization_id", context\.organizationId\)/);
  assert.doesNotMatch(route, /service[_-]?role|SUPABASE_SECRET_KEY/i);
});

test("SIE-uppladdning är storleks- och filtypsbegränsad och bokför aldrig direkt", () => {
  assert.match(route, /MAX_SIE_FILE_BYTES/);
  assert.match(route, /multipart\/form-data/);
  assert.match(route, /canBook: false/);
  assert.doesNotMatch(route, /\.from\("bookkeeping_vouchers"\)\s*\.insert/);
});
