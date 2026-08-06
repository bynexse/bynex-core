import assert from "node:assert/strict";
import test from "node:test";
import { analyzeQuoteOutcomes } from "../../lib/smart/quote-outcome-analysis-v2.ts";

function outcome(index, overrides = {}) {
  return {
    quoteId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    quoteNumber: `OFF-${index}`,
    title: "Badrumsrenovering Vasastan",
    description: "Komplett badrumsrenovering med kakel och tätskikt",
    status: index <= 6 ? "converted" : "declined",
    quotedPrice: 200_000,
    quotedCost: 150_000,
    projectId: index <= 6 ? `10000000-0000-4000-8000-${String(index).padStart(12, "0")}` : null,
    projectCompleted: index <= 6,
    approvedActualCost: index <= 6 ? 165_000 : null,
    invoicedRevenue: index <= 6 ? 210_000 : null,
    actualHours: index <= 6 ? 180 : null,
    actualMaterialCost: index <= 6 ? 72_000 : null,
    approvedChangeOrderRevenue: index <= 6 ? 10_000 : null,
    ...overrides,
  };
}

function input(outcomes) {
  return {
    targetQuoteId: "20000000-0000-4000-8000-000000000001",
    targetTitle: "Badrumsrenovering Södermalm",
    targetDescription: "Komplett badrumsrenovering med kakel och tätskikt",
    targetPrice: 205_000,
    targetEstimatedCost: 150_000,
    outcomes,
  };
}

test("uses the first comparable quote and labels the first eight as learning", () => {
  const analysis = analyzeQuoteOutcomes(input([outcome(1)]));

  assert.equal(analysis.status, "ready");
  assert.equal(analysis.confidence, "low");
  assert.equal(analysis.comparableQuoteCount, 1);
  assert.equal(analysis.completedOutcomeCount, 1);
  assert.equal(analysis.suggestedRiskReservePercent, 10);
  assert.equal(analysis.suggestedPriceExVat, 220_000);
  assert.equal(analysis.sourceReferences.length, 1);
  assert.ok(analysis.warnings.some((warning) => warning.includes("1 av 8")));
});

test("uses comparable quote outcomes even before a project outcome is complete", () => {
  const analysis = analyzeQuoteOutcomes(
    input([
      outcome(1, {
        status: "declined",
        projectId: null,
        projectCompleted: false,
        approvedActualCost: null,
        invoicedRevenue: null,
        actualHours: null,
        actualMaterialCost: null,
        approvedChangeOrderRevenue: null,
      }),
    ]),
  );

  assert.equal(analysis.status, "ready");
  assert.equal(analysis.historicalWinRatePercent, 0);
  assert.equal(analysis.suggestedRiskReservePercent, null);
  assert.equal(analysis.suggestedPriceExVat, null);
  assert.equal(analysis.sourceReferences.length, 1);
});

test("reaches established calibration at eight comparable offers", () => {
  const analysis = analyzeQuoteOutcomes(
    input(Array.from({ length: 8 }, (_, index) => outcome(index + 1))),
  );

  assert.equal(analysis.status, "ready");
  assert.equal(analysis.comparableQuoteCount, 8);
  assert.equal(analysis.completedOutcomeCount, 6);
  assert.equal(analysis.historicalWinRatePercent, 75);
  assert.equal(analysis.medianCostOverrunPercent, 10);
  assert.equal(analysis.suggestedRiskReservePercent, 10);
  assert.equal(analysis.suggestedPriceExVat, 220_000);
  assert.equal(analysis.sourceReferences.length, 8);
  assert.ok(
    analysis.warnings.some((warning) => warning.includes("kalibrerad mot 8")),
  );
});

test("does not mix semantically unrelated jobs", () => {
  const outcomes = Array.from({ length: 12 }, (_, index) => outcome(index + 1, {
    title: "Elservice industri",
    description: "Felsökning central och byte av kabel",
  }));
  const analysis = analyzeQuoteOutcomes(input(outcomes));

  assert.equal(analysis.status, "insufficient_data");
  assert.equal(analysis.comparableQuoteCount, 0);
  assert.equal(analysis.sourceReferences.length, 0);
});
