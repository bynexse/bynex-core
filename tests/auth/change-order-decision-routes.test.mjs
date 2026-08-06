import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const privateRoute = fs.readFileSync(new URL("../../app/api/private/change-orders/approval-link/route.ts",import.meta.url),"utf8");
const completePrivateRoute = fs.readFileSync(new URL("../../app/api/private/change-orders/approval-link-v2/route.ts",import.meta.url),"utf8");
const publicRoute = fs.readFileSync(new URL("../../app/api/public/change-orders/decision/route.ts",import.meta.url),"utf8");
const customerDecisionPage = fs.readFileSync(new URL("../../app/ata/[token]/BynexChangeOrderDecision.tsx",import.meta.url),"utf8");
const templates = fs.readFileSync(new URL("../../lib/change-orders/templates.ts",import.meta.url),"utf8");
const migration = fs.readFileSync(new URL("../../supabase/migrations/20260805075900_secure_change_order_customer_decision.sql",import.meta.url),"utf8");
const proxy = fs.readFileSync(new URL("../../proxy.ts",import.meta.url),"utf8");

test("ÄTA-priset kräver modul, företagsroll och mänsklig granskning",() => {
  assert.match(privateRoute,/requireSupabaseUser\("change_orders"\)/);
  assert.match(completePrivateRoute,/requireSupabaseUser\("change_orders"\)/);
  assert.match(privateRoute,/review_change_order_version/);
  assert.match(completePrivateRoute,/review_change_order_version/);
  assert.match(migration,/private\.has_organization_role/);
  assert.match(migration,/create_change_order_approval_link_internal/);
});

test("komplett ÄTA-underlag låser kalkyl, tid, förutsättningar och undantag",() => {
  assert.match(completePrivateRoute,/change_order_line_items/);
  assert.match(completePrivateRoute,/estimated_working_days/);
  assert.match(completePrivateRoute,/proposed_start_date/);
  assert.match(completePrivateRoute,/proposed_end_date/);
  assert.match(completePrivateRoute,/assumptions/);
  assert.match(completePrivateRoute,/exclusions/);
  assert.match(completePrivateRoute,/create_change_order_customer_link/);
  assert.match(customerDecisionPage,/Avtalsinformation, garanti och ansvar/);
  assert.match(customerDecisionPage,/Underlaget är låst med kontroll/);
});

test("fast pris sparas utan otillåten prisreservation",() => {
  assert.match(completePrivateRoute,/priceType === "fixed" \? null : priceDisclaimer/);
  assert.match(completePrivateRoute,/p_price_disclaimer: normalizedDisclaimer/);
  assert.match(completePrivateRoute,/\.is\("frozen_at", null\)/);
});

test("byggmallarna täcker vanliga ÄTA-situationer",() => {
  assert.match(templates,/Kundbeställd ändring/);
  assert.match(templates,/Oförutsett förhållande/);
  assert.match(templates,/Ändrat elarbete/);
  assert.match(templates,/Ändrat VVS-arbete/);
  assert.match(templates,/Ändrat takarbete/);
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
