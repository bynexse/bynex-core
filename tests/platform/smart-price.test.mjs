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

function input(overrides = {}) {
  return {
    plan,
    seatCount: 25,
    selectedModuleSlugs: plan.module_slugs,
    termMonths: 24,
    supportLevel: "standard",
    billingIntervalMonths: 1,
    customIntegrations: 0,
    onboardingHours: 0,
    ...overrides,
  };
}

test("Smart Price includes extra users and term discount", () => {
  const result = calculateSmartPrice(input());
  assert.equal(result.extraUsers, 20);
  assert.equal(result.termDiscountPercent, 10);
  assert.equal(result.listMonthlyPriceExVat, Math.round(899 + 20 * 99));
  assert.ok(result.volumeDiscountExVat > 0);
  assert.ok(result.options[1].monthlyPriceExVat < result.listMonthlyPriceExVat);
  assert.ok(result.options[1].contractValueExVat > 0);
});

test("Smart Price never lowers total price when a user is added", () => {
  let previous = 0;
  for (let seatCount = 1; seatCount <= 500; seatCount += 1) {
    const result = calculateSmartPrice(input({ seatCount }));
    const recommended = result.options.find((item) => item.key === "recommended");
    assert.ok(recommended);
    assert.ok(
      recommended.monthlyPriceExVat >= previous,
      `Totalpriset sjönk vid ${seatCount} användare`,
    );
    previous = recommended.monthlyPriceExVat;
  }
});

test("one and 120 users are shown as different total company prices", () => {
  const oneUser = calculateSmartPrice(input({ seatCount: 1 }));
  const largeAccount = calculateSmartPrice(input({ seatCount: 120 }));
  const oneRecommended = oneUser.options.find((item) => item.key === "recommended");
  const largeRecommended = largeAccount.options.find(
    (item) => item.key === "recommended",
  );
  assert.ok(oneRecommended && largeRecommended);
  assert.ok(largeRecommended.monthlyPriceExVat > oneRecommended.monthlyPriceExVat);
  assert.ok(
    largeRecommended.monthlyPricePerUserExVat <
      oneRecommended.monthlyPricePerUserExVat,
  );
});

test("all displayed money values are exact whole kronor", () => {
  const result = calculateSmartPrice(
    input({
      seatCount: 120,
      termMonths: 36,
      supportLevel: "priority",
      billingIntervalMonths: 3,
      customIntegrations: 2,
      onboardingHours: 24,
    }),
  );
  const values = [
    result.listMonthlyPriceExVat,
    result.estimatedMonthlyCost,
    result.volumeDiscountExVat,
    result.termDiscountExVat,
    result.integrationSurchargeExVat,
    result.onboardingMonthlyAllocationExVat,
    ...result.options.flatMap((option) => [
      option.monthlyPriceExVat,
      option.monthlyPricePerUserExVat,
      option.discountAmountExVat,
      option.contractValueExVat,
      option.estimatedMonthlyContributionExVat,
    ]),
  ];
  for (const value of values) assert.equal(Number.isInteger(value), true);
});

test("Smart Price never recommends below the cost floor", () => {
  const result = calculateSmartPrice(
    input({
      seatCount: 500,
      selectedModuleSlugs: [
        ...plan.module_slugs,
        "dedicated-enterprise-module",
      ],
      termMonths: 48,
      supportLevel: "dedicated",
      billingIntervalMonths: 12,
      customIntegrations: 10,
      onboardingHours: 200,
    }),
  );
  for (const option of result.options) {
    assert.ok(option.monthlyPriceExVat >= result.estimatedMonthlyCost * 1.25 - 1);
  }
  assert.deepEqual(result.unsupportedModuleSlugs, [
    "dedicated-enterprise-module",
  ]);
  assert.ok(result.warnings.length > 0);
});

test("Smart Price result is deterministic", () => {
  const value = input({
    seatCount: 120,
    termMonths: 36,
    supportLevel: "priority",
    billingIntervalMonths: 3,
    customIntegrations: 2,
    onboardingHours: 24,
  });
  assert.deepEqual(calculateSmartPrice(value), calculateSmartPrice(value));
});
