import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routes = new Map([
  ["projects", [
    "app/api/private/projects/route.ts",
    "app/api/private/projects/from-quote/route.ts",
    "app/api/private/connect/route.ts",
    "app/api/private/operations/foreman/route.ts",
    "app/api/private/operations/site-manager/route.ts",
    "app/api/private/operations/staffing-match/route.ts",
    "app/api/private/smart/project-artifacts/route.ts",
  ]],
  ["time_payroll", [
    "app/api/private/people/route.ts",
    "app/api/private/people/employment/route.ts",
    "app/api/private/people/qualifications/route.ts",
    "app/api/private/time/route.ts",
    "app/api/private/payroll/route.ts",
    "app/api/private/absence/route.ts",
  ]],
  ["materials", ["app/api/private/materials/route.ts"]],
  ["assets", [
    "app/api/private/assets/route.ts",
    "app/api/private/assets/maintenance/route.ts",
    "app/api/private/assets/security/route.ts",
  ]],
  ["quotes", [
    "app/api/private/quotes/route.ts",
    "app/api/private/smart/quote-outcomes/route.ts",
  ]],
  ["change_orders", ["app/api/private/change-orders/route.ts"]],
  ["invoicing", [
    "app/api/private/invoices/route.ts",
    "app/api/private/invoices/from-project/route.ts",
  ]],
  ["bookkeeping", [
    "app/api/private/accounting-integrations/route.ts",
    "app/api/private/accounting/sie/route.ts",
    "app/api/private/year-end/route.ts",
    "app/api/private/sole-trader/route.ts",
  ]],
  ["customer_portal", [
    "app/api/private/property-portal/route.ts",
    "app/api/private/customer-portal/invites/route.ts",
    "app/api/private/digital-binder-subscription/route.ts",
  ]],
]);

test("alla köpta modulflöden kräver serververifierad entitlement", async () => {
  for (const [moduleSlug, files] of routes) {
    for (const file of files) {
      const source = await readFile(file, "utf8");
      assert.match(
        source,
        new RegExp(`requireSupabaseUser\\(["']${moduleSlug}["']\\)`),
        `${file} saknar entitlement för ${moduleSlug}`,
      );
    }
  }
});

test("entitlementkontrollen är fail-closed och kontrollerar aktivt medlemskap", async () => {
  const source = await readFile("lib/supabase/require-user.ts", "utf8");
  assert.match(source, /active_organization_module_entitlements/);
  assert.match(source, /organization_members/);
  assert.match(source, /MODULE_NOT_ENTITLED/);
  assert.match(source, /ENTITLEMENT_CHECK_FAILED/);
  assert.doesNotMatch(source, /service[_-]?role/i);
});

