import {
  buildChangeOrderEstimate as buildBaseEstimate,
  type EstimateContext,
  type EstimateLearningSample,
  type EstimateResult,
} from "./change-order-estimate";

export {
  classifyEstimateCategory,
  type EstimateAnswers,
  type EstimateBreakdownLine,
  type EstimateCategory,
  type EstimateContext,
  type EstimateLearningSample,
  type EstimateQuestion,
  type EstimateResult,
} from "./change-order-estimate";

const FULL_COMPANY_CALIBRATION_SAMPLES = 8;

function roundMoney(value: number) {
  return Math.max(0, Math.round(value));
}

function roundHours(value: number) {
  return Math.max(0, Math.round(value * 2) / 2);
}

function interpolate(start: number, end: number, factor: number) {
  return start + (end - start) * Math.min(1, Math.max(0, factor));
}

function eligibleHistory(
  history: EstimateLearningSample[],
  category: EstimateResult["category"],
) {
  return history.filter(
    (sample) =>
      sample.category === category &&
      sample.measuredUnits > 0 &&
      sample.actualLaborHours >= 0 &&
      sample.finalPriceExVat > 0,
  );
}

function padForLegacyCalibration(history: EstimateLearningSample[]) {
  if (history.length === 0 || history.length >= 3) return history;
  return [
    ...history,
    ...Array.from(
      { length: 3 - history.length },
      (_, index) => history[index % history.length],
    ),
  ];
}

function learningDescription(sampleCount: number) {
  if (sampleCount >= FULL_COMPANY_CALIBRATION_SAMPLES) {
    return `Företagets egen historik är fullt kalibrerad med ${sampleCount} verifierade utfall för arbetskategorin.`;
  }
  return `Bynex Smart använder företagets egen data från första utfallet. Inlärningsperiod: ${sampleCount} av ${FULL_COMPANY_CALIBRATION_SAMPLES} verifierade utfall.`;
}

/**
 * Uses tenant-isolated company history from the first verified result.
 * During outcomes 1–8 the influence rises gradually; after outcome 8 the
 * established company calibration is used. Human review remains mandatory.
 */
export function buildChangeOrderEstimate(
  context: EstimateContext,
): EstimateResult {
  const firstPass = buildBaseEstimate(context);
  if (firstPass.status !== "ready") return firstPass;

  const history = eligibleHistory(context.history, firstPass.category);
  if (history.length === 0) return firstPass;

  const baseline = buildBaseEstimate({ ...context, history: [] });
  const calibrated = buildBaseEstimate({
    ...context,
    history: padForLegacyCalibration(history),
  });
  if (baseline.status !== "ready" || calibrated.status !== "ready") {
    return firstPass;
  }

  const progress = Math.min(
    1,
    history.length / FULL_COMPANY_CALIBRATION_SAMPLES,
  );

  // The established calculator uses 40 % company history for hours and 35 %
  // for price. These factors ramp that influence from the first outcome to the
  // full established weighting at outcome eight.
  const laborHistoryWeight = 0.1 + 0.3 * progress;
  const priceHistoryWeight = 0.1 + 0.25 * progress;
  const laborBlendFactor = laborHistoryWeight / 0.4;
  const priceBlendFactor = priceHistoryWeight / 0.35;

  const laborHours = roundHours(
    interpolate(
      baseline.estimatedLaborHours ?? 0,
      calibrated.estimatedLaborHours ?? 0,
      laborBlendFactor,
    ),
  );
  const rawEstimatedPriceExVat = roundMoney(
    interpolate(
      baseline.estimatedPriceExVat ?? 0,
      calibrated.estimatedPriceExVat ?? 0,
      priceBlendFactor,
    ),
  );

  const nonLaborAmount = calibrated.breakdown
    .filter((line) => line.category !== "labor")
    .reduce((sum, line) => sum + line.amountExVat, 0);
  const estimatedPriceExVat = Math.max(nonLaborAmount, rawEstimatedPriceExVat);
  const historyWeightPercent = Math.round(priceHistoryWeight * 100);
  const breakdown = calibrated.breakdown.map((line) =>
    line.category === "labor"
      ? {
          ...line,
          quantity: laborHours,
          amountExVat: Math.max(0, estimatedPriceExVat - nonLaborAmount),
          source: "company_history" as const,
          explanation: `${learningDescription(history.length)} Företagsutfallen väger ${historyWeightPercent} % i denna prisuppskattning.`,
        }
      : line,
  );

  const uncertaintyPercent = Math.max(10, Math.round(22 - progress * 12));
  const estimatedPriceLowExVat = roundMoney(
    estimatedPriceExVat * (1 - uncertaintyPercent / 100),
  );
  const estimatedPriceHighExVat = roundMoney(
    estimatedPriceExVat * (1 + uncertaintyPercent / 100),
  );
  const estimatedVatAmount = roundMoney(
    estimatedPriceExVat * calibrated.vatRate / 100,
  );
  const estimatedPriceIncVat = estimatedPriceExVat + estimatedVatAmount;
  const confidence = Math.min(
    0.95,
    0.56 + Math.min(history.length, 8) * 0.04 + Math.max(0, history.length - 8) * 0.008,
  );
  const confidenceLabel: EstimateResult["confidenceLabel"] =
    confidence >= 0.8 ? "Hög" : confidence >= 0.6 ? "Medel" : "Låg";

  const assumptions = [
    ...baseline.assumptions.filter(
      (assumption) =>
        !assumption.startsWith("Osäkerhetsintervall:") &&
        !assumption.startsWith("Kalkylen använder") &&
        !assumption.startsWith("Företaget saknar"),
    ),
    learningDescription(history.length),
    `Företagets verifierade utfall väger ${historyWeightPercent} % och Bynex grundmodell väger ${100 - historyWeightPercent} %.`,
    `Osäkerhetsintervall: ±${uncertaintyPercent} %.`,
  ];

  const customerText = `Uppskattat pris ${estimatedPriceExVat.toLocaleString("sv-SE")} kr exkl. moms (${estimatedPriceIncVat.toLocaleString("sv-SE")} kr inkl. moms). Uppskattningen bygger på angiven omfattning, mått, nu kända förutsättningar och företagets egna verifierade utfall. Priset kan ändras om omfattningen eller förutsättningarna förändras. Väsentliga avvikelser meddelas för nytt godkännande innan ytterligare arbete utförs.`;

  return {
    ...calibrated,
    estimatedLaborHours: laborHours,
    estimatedPriceLowExVat,
    estimatedPriceExVat,
    estimatedPriceHighExVat,
    estimatedVatAmount,
    estimatedPriceIncVat,
    confidence,
    confidenceLabel,
    explanation: `${learningDescription(history.length)} Bynex Smart kombinerar utfallet med projektets priser och angivna mått; behörig person granskar alltid förslaget.`,
    assumptions,
    historySampleCount: history.length,
    breakdown,
    customerText,
  };
}
