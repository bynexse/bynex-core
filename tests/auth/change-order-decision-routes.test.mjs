import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const privateRoute = fs.readFileSync(new URL("../../app/api/private/change-orders/approval-link/route.ts",import.meta.url),"utf8");
const publicRoute = fs.readFileSync(new URL("../../app/api/public/change-orders/decision/route.ts",import.meta.url),"utf8");
const migration = fs.readFileSync(new URL("../../supabase/migrations/20260805075900_secure_change_order_customer_decision.sql",import.meta.url),"utf8");
const proxy = fs.readFileSync(new URL("../../proxy.ts",import.meta.url),"utf8");

test("ÄTA-priset kräver modul, företagsroll och mänsklig granskning",() => {
  assert.match(privateRoute,/requireSupabaseUser\("change_orders"\)/);
  assert.match(privateRoute,/review_change_order_version/);
  assert.match(migration,/private\.has_organization_role/);
  assert.match(migration,/create_change_order_approval_link_internal/);
});

test("kundbeslut använder hashad engångstoken och anonym klient",() => {
  assert.match(migration,/digest\(p_secret,'sha256'\)/);
  assert.match(publicRoute,/createAnonymousSupabaseClient/);
  assert.match(publicRoute,/body\?\.consent !== true/);
  assert.match(publicRoute,/origin !== new URL\(request\.url\)\.origin/);
  assert.doesNotMatch(publicRoute,/service[_ -]?role/i);
});

test("kundvägen är publik genom pilotgrinden men tokenkrävd",() => {
  assert.match(proxy,/path\.startsWith\("\/ata\/"\)/);
  assert.match(proxy,/\/api\/public\/change-orders\/decision/);
  assert.match(publicRoute,/\^\[0-9a-f\]\{64\}\$/);
});
