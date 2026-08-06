import assert from "node:assert/strict";
import test from "node:test";

import {
  buildChangeOrderEstimate,
  classifyEstimateCategory,
} from "../../lib/ai/change-order-estimate-v2.ts";

function base(overrides = {}) {
  return {
    title: "Ny gipsvägg i hall",
    description: "Bygg en extra innervägg enligt kundens önskemål.",
    locationDetail: "Hall plan 1",
    projectName: "Ladan",
    hourlyRateExVat: 695,
    materialMarkupPercent: 15,
    vatRate: 25,
    answers: {},
    history: [],
    ...overrides,
  };
}

function wallAnswers(overrides = {}) {
  return {
    lengthM: 5,
    heightM: 2.4,
    wallBuild: "insulated",
    openings: 1,
    difficulty: "normal",
    demolitionRequired: false,
    materialIncluded: true,
    materialAllowanceExVat: 8_000,
    equipmentAllowanceExVat: 0,
    otherAllowanceExVat: 1_000,
    ...overrides,
  };
}

function learningSample() {
  return {
    category: "wall",
    measuredUnits: 12,
    actualLaborHours: 6,
    actualMaterialSellExVat: 0,
    finalPriceExVat: 12_000,
  };
}

test("classifies common Swedish construction work", () => {
  assert.equal(classifyEstimateCategory("extra gipsvägg i hall"), "wall");
  assert.equal(classifyEstimateCategory("måla och spackla 60 m2"), "painting");
  assert.equal(classifyEstimateCategory("gjuta nytt fundament"), "concrete");
  assert.equal(classifyEstimateCategory("flytta två eluttag"), "electrical");
});

test("asks relevant questions before showing a customer price", () => {
  const result = buildChangeOrderEstimate(base());
  assert.equal(result.status, "needs_input");
  const keys = result.questions.map((question) => question.key);
  assert.ok(keys.includes("lengthM"));
  assert.ok(keys.includes("heightM"));
  assert.ok(keys.includes("wallBuild"));
  assert.equal(result.estimatedPriceExVat, null);
  assert.equal(result.customerText, null);
});

test("asks for material amount when material should be included", () => {
  const result = buildChangeOrderEstimate(
    base({
      answers: {
        lengthM: 5,
        heightM: 2.4,
        wallBuild: "single",
        openings: 0,
        difficulty: "normal",
        demolitionRequired: false,
        materialIncluded: true,
      },
    }),
  );
  assert.equal(result.status, "needs_input");
  assert.ok(
    result.questions.some(
      (question) => question.key === "materialAllowanceExVat",
    ),
  );
});

test("creates an explainable estimated price after required answers", () => {
  const result = buildChangeOrderEstimate(
    base({
      answers: wallAnswers(),
    }),
  );

  assert.equal(result.status, "ready");
  assert.ok(result.estimatedLaborHours > 0);
  assert.ok(result.estimatedPriceExVat > 0);
  assert.ok(result.estimatedPriceLowExVat <= result.estimatedPriceExVat);
  assert.ok(result.estimatedPriceHighExVat >= result.estimatedPriceExVat);
  assert.equal(
    result.estimatedPriceIncVat,
    result.estimatedPriceExVat + result.estimatedVatAmount,
  );
  assert.ok(result.customerText.includes("Uppskattat pris"));
  assert.ok(result.breakdown.some((line) => line.category === "labor"));
  assert.ok(result.breakdown.some((line) => line.category === "material"));
});

test("uses company history from the first verified ÄTA outcome", () => {
  const answers = wallAnswers({
    wallBuild: "single",
    openings: 0,
    materialIncluded: false,
    materialAllowanceExVat: undefined,
    otherAllowanceExVat: 0,
  });
  const withoutHistory = buildChangeOrderEstimate(base({ answers }));
  const withFirstOutcome = buildChangeOrderEstimate(
    base({ answers, history: [learningSample()] }),
  );

  assert.equal(withFirstOutcome.historySampleCount, 1);
  assert.notEqual(
    withFirstOutcome.estimatedPriceExVat,
    withoutHistory.estimatedPriceExVat,
  );
  assert.ok(withFirstOutcome.explanation.includes("1 av 8"));
  assert.ok(
    withFirstOutcome.breakdown.some((line) => line.source === "company_history"),
  );
});

test("raises company-history influence throughout the first eight outcomes", () => {
  const answers = wallAnswers({
    wallBuild: "single",
    openings: 0,
    materialIncluded: false,
    materialAllowanceExVat: undefined,
    otherAllowanceExVat: 0,
  });
  const withoutHistory = buildChangeOrderEstimate(base({ answers }));
  const withOne = buildChangeOrderEstimate(
    base({ answers, history: [learningSample()] }),
  );
  const withEight = buildChangeOrderEstimate(
    base({
      answers,
      history: Array.from({ length: 8 }, () => learningSample()),
    }),
  );

  assert.equal(withEight.historySampleCount, 8);
  assert.ok(withEight.confidence > withOne.confidence);
  assert.ok(withOne.confidence > withoutHistory.confidence);
  assert.ok(withEight.explanation.includes("fullt kalibrerad"));
  assert.ok(
    Math.abs(withEight.estimatedPriceExVat - withoutHistory.estimatedPriceExVat) >
      Math.abs(withOne.estimatedPriceExVat - withoutHistory.estimatedPriceExVat),
  );
});

test("does not invent a missing project hourly rate", () => {
  const result = buildChangeOrderEstimate(
    base({
      hourlyRateExVat: 0,
      answers: wallAnswers({
        materialIncluded: false,
        materialAllowanceExVat: undefined,
      }),
    }),
  );

  assert.equal(result.status, "needs_input");
  assert.ok(
    result.questions.some((question) => question.key === "hourlyRateExVat"),
  );
  assert.equal(result.estimatedPriceExVat, null);
});

test("uses an explicitly supplied hourly rate when the project lacks one", () => {
  const result = buildChangeOrderEstimate(
    base({
      hourlyRateExVat: 0,
      answers: wallAnswers({ hourlyRateExVat: 750 }),
    }),
  );

  assert.equal(result.status, "ready");
  const labor = result.breakdown.find((line) => line.category === "labor");
  assert.equal(labor?.unitPriceExVat, 750);
});

test("produces deterministic estimates for the same verified input", () => {
  const input = base({ answers: wallAnswers() });
  assert.deepEqual(
    buildChangeOrderEstimate(input),
    buildChangeOrderEstimate(input),
  );
});
