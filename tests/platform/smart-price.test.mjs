import assert from "node:assert/strict";
import test from "node:test";
import { calculateSmartPrice } from "../../lib/platform/smart-price.ts";

const plan = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Bynex Bygg",
  monthly_price_ex_vat: 899,
  included_users: 5,
  extra_user_price_ex_vat: 99,
  module_slugs: ["time", "projects", "quotes", "invoices"],
};

test("Smart Price includes extra users and term discount", () => {
  const result = calculateSmartPrice({
    plan,
    seatCount: 25,
    selectedModuleSlugs: plan.module_slugs,
    termMonths: 24,
    supportLevel: "standard",
    billingIntervalMonths: 1,
    customIntegrations: 0,
    onboardingHours: 0,
  });
  assert.equal(result.extraUsers, 20);
  assert.equal(result.termDiscountPercent, 10);
  assert.ok(result.listMonthlyPriceExVat >= 899 + 20 * 99);
  assert.ok(result.options[1].monthlyPriceExVat < result.listMonthlyPriceExVat);
  assert.ok(result.options[1].contractValueExVat > 0);
});

test("Smart Price never recommends below the cost floor", () => {
  const result = calculateSmartPrice({
    plan,
    seatCount: 500,
    selectedModuleSlugs: [...plan.module_slugs, "dedicated-enterprise-module"],
    termMonths: 48,
    supportLevel: "dedicated",
    billingIntervalMonths: 12,
    customIntegrations: 10,
    onboardingHours: 200,
  });
  for (const option of result.options) {
    assert.ok(option.monthlyPriceExVat >= result.estimatedMonthlyCost * 1.18 - 0.01);
  }
  assert.deepEqual(result.unsupportedModuleSlugs, ["dedicated-enterprise-module"]);
  assert.ok(result.warnings.length > 0);
});

test("Smart Price result is deterministic", () => {
  const input = {
    plan,
    seatCount: 120,
    selectedModuleSlugs: plan.module_slugs,
    termMonths: 36,
    supportLevel: "priority",
    billingIntervalMonths: 3,
    customIntegrations: 2,
    onboardingHours: 24,
  };
  assert.deepEqual(calculateSmartPrice(input), calculateSmartPrice(input));
});
