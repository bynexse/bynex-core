import type {
  QuoteOutcomeRecommendation,
  QuoteOutcomeSource,
} from "./quote-outcome-analysis";

export type {
  QuoteOutcomeRecommendation,
  QuoteOutcomeSource,
} from "./quote-outcome-analysis";

const stopWords = new Set([
  "och", "att", "det", "den", "ett", "en", "med", "för", "från", "till",
  "hos", "som", "ska", "kan", "projekt", "arbete", "offert", "inkl", "exkl",
]);

function tokens(value: string) {
  return new Set(
    value
      .toLocaleLowerCase("sv-SE")
      .normalize("NFKD")
      .replace(/[^a-z0-9åäö\s-]/gi, " ")
      .split(/[\s-]+/)
      .map((word) => word.trim())
      .filter((word) => word.length >= 4 && !stopWords.has(word)),
  );
}

function hasComparableScope(target: Set<string>, source: QuoteOutcomeSource) {
  if (target.size === 0) return false;
  const candidate = tokens(`${source.title} ${source.description ?? ""}`);
  let overlap = 0;
  for (const word of Array.from(target)) {
    if (candidate.has(word)) overlap += 1;
  }
  return overlap >= Math.min(2, target.size);
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function percent(value: number) {
  return Math.round(value * 10) / 10;
}

/**
 * Uses the tenant's own quote and project outcomes from the first comparable
 * record. The first eight comparable offers are an explicit learning period;
 * confidence rises as verified outcomes accumulate, but history is never
 * blocked behind a minimum-count gate.
 */
export function analyzeQuoteOutcomes(input: {
  targetQuoteId: string;
  targetTitle: string;
  targetDescription: string | null;
  targetPrice: number;
  targetEstimatedCost: number;
  outcomes: QuoteOutcomeSource[];
  minimumComparableQuotes?: number;
  minimumCompletedOutcomes?: number;
}): QuoteOutcomeRecommendation {
  const calibrationTarget = input.minimumComparableQuotes ?? 8;
  const completedCalibrationTarget = input.minimumCompletedOutcomes ?? 5;
  const targetTokens = tokens(`${input.targetTitle} ${input.targetDescription ?? ""}`);
  const comparable = input.outcomes.filter(
    (outcome) =>
      outcome.quoteId !== input.targetQuoteId &&
      hasComparableScope(targetTokens, outcome),
  );
  const won = comparable.filter((outcome) =>
    ["signed", "converted"].includes(outcome.status),
  );
  const lost = comparable.filter((outcome) =>
    ["declined", "expired"].includes(outcome.status),
  );
  const completed = won.filter(
    (outcome) =>
      outcome.projectCompleted &&
      outcome.approvedActualCost !== null &&
      outcome.invoicedRevenue !== null &&
      outcome.invoicedRevenue > 0,
  );

  const warnings: string[] = [];
  if (targetTokens.size === 0) {
    warnings.push(
      "Offerten behöver en tydligare rubrik eller omfattning för att kunna jämföras sakligt.",
    );
  }

  if (comparable.length === 0) {
    warnings.push(
      "Företaget har ännu inget jämförbart offertutfall. Bynex Smart använder offertens egen kalkyl tills ett verifierat utfall finns.",
    );
  } else if (comparable.length < calibrationTarget) {
    warnings.push(
      `Inlärningsperiod: ${comparable.length} av ${calibrationTarget} jämförbara offertutfall. Företagets egen data används redan nu med låg eller medelhög säkerhet.`,
    );
  } else {
    warnings.push(
      `Företagets offertmodell är kalibrerad mot ${comparable.length} jämförbara utfall.`,
    );
  }

  if (completed.length === 0) {
    warnings.push(
      "Det saknas ännu ett slutfört projekt med godkänd kostnad och fakturerad intäkt. Prisrisk och marginal visas när första verifierade projektutfallet finns.",
    );
  } else if (completed.length < completedCalibrationTarget) {
    warnings.push(
      `Kostnadsinlärning: ${completed.length} av ${completedCalibrationTarget} verifierade projektutfall. Resultatet används redan nu men ska granskas extra noggrant.`,
    );
  }

  const hasCompanySignal = comparable.length > 0;
  const winRate = hasCompanySignal
    ? percent((won.length / comparable.length) * 100)
    : null;
  const margins = completed.map(
    (outcome) =>
      ((outcome.invoicedRevenue! - outcome.approvedActualCost!) /
        outcome.invoicedRevenue!) *
      100,
  );
  const overruns = completed
    .filter((outcome) => outcome.quotedCost > 0)
    .map(
      (outcome) =>
        ((outcome.approvedActualCost! - outcome.quotedCost) /
          outcome.quotedCost) *
        100,
    );
  const medianMargin = median(margins);
  const medianOverrun = median(overruns);
  const reserve =
    medianOverrun !== null
      ? Math.min(30, Math.max(0, percent(medianOverrun)))
      : null;
  const suggestedPrice =
    reserve !== null &&
    input.targetEstimatedCost > 0 &&
    input.targetPrice > 0
      ? Math.round(
          input.targetPrice + input.targetEstimatedCost * (reserve / 100),
        )
      : null;
  const targetMargin =
    input.targetPrice > 0
      ? percent(
          ((input.targetPrice - input.targetEstimatedCost) /
            input.targetPrice) *
            100,
        )
      : null;

  if (
    medianMargin !== null &&
    targetMargin !== null &&
    targetMargin < medianMargin
  ) {
    warnings.push(
      "Offertens beräknade marginal ligger under medianen för jämförbara, slutförda jobb i företaget.",
    );
  }
  warnings.push(
    "Bynex Smart lämnar ett beslutsunderlag. Behörig person måste granska omfattning, risk och pris innan offerten skickas.",
  );

  const sourceReferences = comparable.map((outcome) => ({
    quoteId: outcome.quoteId,
    quoteNumber: outcome.quoteNumber,
    projectId: outcome.projectId,
    metrics: [
      "offertstatus",
      ...(outcome.projectCompleted ? ["projektstatus"] : []),
      ...(outcome.approvedActualCost !== null
        ? ["godkänd faktisk kostnad"]
        : []),
      ...(outcome.invoicedRevenue !== null ? ["utställd fakturering"] : []),
      ...(outcome.actualHours !== null ? ["registrerad tid"] : []),
      ...(outcome.actualMaterialCost !== null
        ? ["registrerat material"]
        : []),
      ...(outcome.approvedChangeOrderRevenue !== null
        ? ["godkänd ÄTA"]
        : []),
    ],
  }));

  const confidence: QuoteOutcomeRecommendation["confidence"] =
    comparable.length >= calibrationTarget &&
    completed.length >= completedCalibrationTarget
      ? completed.length >= 12
        ? "high"
        : "medium"
      : comparable.length >= 4 && completed.length >= 2
        ? "medium"
        : "low";

  return {
    status: hasCompanySignal ? "ready" : "insufficient_data",
    confidence,
    comparableQuoteCount: comparable.length,
    completedOutcomeCount: completed.length,
    wonCount: won.length,
    lostCount: lost.length,
    historicalWinRatePercent: winRate,
    medianGrossMarginPercent:
      medianMargin !== null ? percent(medianMargin) : null,
    medianCostOverrunPercent:
      medianOverrun !== null ? percent(medianOverrun) : null,
    suggestedRiskReservePercent: reserve,
    suggestedPriceExVat: suggestedPrice,
    targetEstimatedMarginPercent: targetMargin,
    warnings,
    sourceReferences,
  };
}
