import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../components/platform-admin/customer-center/", import.meta.url);
const source = [
  "PlatformCustomerOperationsCenter.tsx",
  "CustomerCenterDashboard.tsx",
  "CustomerCenterActions.tsx",
].map((file) => readFileSync(new URL(file, root), "utf8")).join("\n");

test("HQ Kundcenter uses the stable organization customer number", () => {
  assert.match(source, /organization\.customer_number/);
  assert.match(source, /customerNumber/);
});

test("HQ Kundcenter consolidates the requested customer operations", () => {
  for (const phrase of [
    "Kontakt och identitet",
    "Kommersiellt läge",
    "Fakturor och betalningsläge",
    "Rabatter och avtal",
    "Support, fel och klagomål",
    "Personal och appåtkomst",
    "Fakturaunderlag",
    "Kundrabatt",
  ]) {
    assert.ok(source.includes(phrase), `missing customer-center section: ${phrase}`);
  }
});

test("HQ Kundcenter keeps customer payroll and labor pricing out of HQ", () => {
  assert.doesNotMatch(source, /hourly_rate|labor_cost|salary_amount|update_labor_pricing/);
  assert.match(source, /inte kundens löner/);
});
