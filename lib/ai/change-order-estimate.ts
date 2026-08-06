export type EstimateCategory =
  | "wall"
  | "painting"
  | "flooring"
  | "concrete"
  | "roofing"
  | "demolition"
  | "electrical"
  | "plumbing"
  | "generic";

export type EstimateQuestion = {
  key: string;
  label: string;
  type: "number" | "text" | "select" | "boolean";
  required: boolean;
  unit?: string;
  reason: string;
  options?: Array<{ value: string; label: string }>;
  minimum?: number;
  maximum?: number;
  step?: number;
};

export type EstimateAnswers = Record<string, unknown>;

export type EstimateLearningSample = {
  category: EstimateCategory;
  measuredUnits: number;
  actualLaborHours: number;
  actualMaterialSellExVat: number;
  finalPriceExVat: number;
};

export type EstimateContext = {
  title: string;
  description: string;
  locationDetail?: string | null;
  projectName?: string | null;
  hourlyRateExVat: number;
  materialMarkupPercent: number;
  vatRate: number;
  answers: EstimateAnswers;
  history: EstimateLearningSample[];
  aiCategory?: EstimateCategory | null;
};

export type EstimateBreakdownLine = {
  category: "labor" | "material" | "equipment" | "subcontractor" | "other";
  label: string;
  quantity: number;
  unit: string;
  unitPriceExVat: number;
  amountExVat: number;
  source: "company_history" | "project_setting" | "manual_answer" | "bynex_baseline";
  explanation: string;
};

export type EstimateResult = {
  status: "needs_input" | "ready";
  category: EstimateCategory;
  questions: EstimateQuestion[];
  estimatedLaborHours: number | null;
  estimatedPriceLowExVat: number | null;
  estimatedPriceExVat: number | null;
  estimatedPriceHighExVat: number | null;
  vatRate: number;
  estimatedVatAmount: number | null;
  estimatedPriceIncVat: number | null;
  confidence: number;
  confidenceLabel: "Låg" | "Medel" | "Hög";
  explanation: string;
  assumptions: string[];
  missingInformation: string[];
  historySampleCount: number;
  measuredUnits: number | null;
  measuredUnitLabel: string;
  breakdown: EstimateBreakdownLine[];
  customerText: string | null;
};

const categoryTerms: Record<EstimateCategory, string[]> = {
  wall: ["vägg", "gips", "regelvägg", "innervägg", "skiljevägg"],
  painting: ["måla", "målning", "spackla", "tapet", "färg"],
  flooring: ["golv", "parkett", "laminat", "klinker", "matta"],
  concrete: ["betong", "gjuta", "platta", "fundament", "avjämning"],
  roofing: ["tak", "papp", "pannor", "läkt", "plåt"],
  demolition: ["riva", "rivning", "demontera", "bilning", "borttagning"],
  electrical: ["el", "uttag", "belysning", "kabel", "central"],
  plumbing: ["vvs", "rör", "avlopp", "vatten", "blandare"],
  generic: [],
};

const baselineHoursPerUnit: Partial<Record<EstimateCategory, number>> = {
  wall: 0.9,
  painting: 0.35,
  flooring: 0.55,
  concrete: 1.4,
  roofing: 0.95,
  demolition: 0.65,
  electrical: 1.5,
  plumbing: 1.75,
};

const categoryNames: Record<EstimateCategory, string> = {
  wall: "väggarbete",
  painting: "målningsarbete",
  flooring: "golvarbete",
  concrete: "betongarbete",
  roofing: "takarbete",
  demolition: "rivningsarbete",
  electrical: "elarbete",
  plumbing: "VVS-arbete",
  generic: "övrigt byggarbete",
};

function normalizeText(value: string) {
  return value.toLocaleLowerCase("sv-SE").replace(/\s+/g, " ").trim();
}

export function classifyEstimateCategory(text: string): EstimateCategory {
  const normalized = normalizeText(text);
  let best: EstimateCategory = "generic";
  let bestScore = 0;

  for (const [category, terms] of Object.entries(categoryTerms) as Array<
    [EstimateCategory, string[]]
  >) {
    const score = terms.reduce(
      (total, term) => total + (normalized.includes(term) ? term.length : 0),
      0,
    );
    if (score > bestScore) {
      best = category;
      bestScore = score;
    }
  }

  return best;
}

function numberAnswer(answers: EstimateAnswers, key: string) {
  const value = answers[key];
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function stringAnswer(answers: EstimateAnswers, key: string) {
  const value = answers[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function booleanAnswer(answers: EstimateAnswers, key: string) {
  const value = answers[key];
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "yes" || value === "ja" || value === "1") return true;
  if (value === "false" || value === "no" || value === "nej" || value === "0") return false;
  return null;
}

function roundMoney(value: number) {
  return Math.max(0, Math.round(value));
}

function roundHours(value: number) {
  return Math.max(0, Math.round(value * 2) / 2);
}

function median(values: number[]) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function commonQuestions(hourlyRateMissing: boolean): EstimateQuestion[] {
  return [
    {
      key: "difficulty",
      label: "Hur svår är åtkomsten och arbetsmiljön?",
      type: "select",
      required: true,
      reason: "Trång åtkomst, skydd och pågående verksamhet påverkar arbetstiden.",
      options: [
        { value: "easy", label: "Enkel och fri åtkomst" },
        { value: "normal", label: "Normal åtkomst" },
        { value: "difficult", label: "Trångt eller komplicerat" },
        { value: "occupied", label: "Arbete i pågående verksamhet eller bebodd miljö" },
      ],
    },
    {
      key: "demolitionRequired",
      label: "Ingår rivning eller demontering?",
      type: "boolean",
      required: true,
      reason: "Rivning, sortering och bortforsling kan vara en stor del av ÄTA-kostnaden.",
    },
    {
      key: "materialIncluded",
      label: "Ska material ingå i uppskattningen?",
      type: "boolean",
      required: true,
      reason: "Bynex behöver veta om kunden eller företaget står för materialet.",
    },
    ...(hourlyRateMissing
      ? [
          {
            key: "hourlyRateExVat",
            label: "Vilket kundpris per arbetstimme ska användas?",
            type: "number" as const,
            required: true,
            unit: "kr/tim exkl. moms",
            reason: "Projektet saknar ett sparat timpris. Bynex gissar inte kundens timpris.",
            minimum: 1,
            maximum: 10_000,
            step: 1,
          },
        ]
      : []),
  ];
}

function categoryQuestions(category: EstimateCategory): EstimateQuestion[] {
  switch (category) {
    case "wall":
      return [
        {
          key: "lengthM",
          label: "Hur lång är väggen?",
          type: "number",
          required: true,
          unit: "meter",
          reason: "Längd och höjd används för att beräkna väggytan.",
          minimum: 0.1,
          maximum: 10_000,
          step: 0.1,
        },
        {
          key: "heightM",
          label: "Hur hög är väggen?",
          type: "number",
          required: true,
          unit: "meter",
          reason: "Längd och höjd används för att beräkna väggytan.",
          minimum: 0.1,
          maximum: 100,
          step: 0.1,
        },
        {
          key: "wallBuild",
          label: "Vilken vägguppbyggnad gäller?",
          type: "select",
          required: true,
          reason: "Antal skivlager, isolering och brand- eller ljudkrav påverkar både tid och material.",
          options: [
            { value: "single", label: "Enkelt skivlager" },
            { value: "double", label: "Dubbla skivlager" },
            { value: "insulated", label: "Isolerad vägg" },
            { value: "fire_sound", label: "Brand- eller ljudklassad vägg" },
          ],
        },
        {
          key: "openings",
          label: "Hur många dörr- eller fönsteröppningar ingår?",
          type: "number",
          required: true,
          unit: "st",
          reason: "Öppningar kräver extra inpassning och förstärkning.",
          minimum: 0,
          maximum: 1_000,
          step: 1,
        },
      ];
    case "painting":
      return [
        {
          key: "areaM2",
          label: "Hur stor yta ska behandlas?",
          type: "number",
          required: true,
          unit: "m²",
          reason: "Ytan är den viktigaste mängden för målning och spackling.",
          minimum: 0.1,
          maximum: 1_000_000,
          step: 0.1,
        },
        {
          key: "surfacePreparation",
          label: "Vilket underarbete krävs?",
          type: "select",
          required: true,
          reason: "Tvätt, slipning, lagning och bredspackling påverkar tiden kraftigt.",
          options: [
            { value: "none", label: "Nästan inget underarbete" },
            { value: "normal", label: "Normal lagning och slipning" },
            { value: "extensive", label: "Omfattande spackling eller skador" },
          ],
        },
        {
          key: "coats",
          label: "Hur många strykningar behövs?",
          type: "number",
          required: true,
          unit: "st",
          reason: "Antal lager styr både materialåtgång och arbetstid.",
          minimum: 1,
          maximum: 10,
          step: 1,
        },
      ];
    case "flooring":
      return [
        {
          key: "areaM2",
          label: "Hur stor golvyta gäller?",
          type: "number",
          required: true,
          unit: "m²",
          reason: "Golvytan styr huvuddelen av tid och material.",
          minimum: 0.1,
          maximum: 1_000_000,
          step: 0.1,
        },
        {
          key: "floorType",
          label: "Vilken golvtyp ska läggas?",
          type: "select",
          required: true,
          reason: "Olika golvtyper har olika kapning, infästning och efterarbete.",
          options: [
            { value: "laminate", label: "Laminat eller klickgolv" },
            { value: "parquet", label: "Parkett" },
            { value: "tile", label: "Klinker" },
            { value: "sheet", label: "Matta eller skivmaterial" },
            { value: "other", label: "Annat" },
          ],
        },
        {
          key: "subfloorCondition",
          label: "Hur är underlaget?",
          type: "select",
          required: true,
          reason: "Ojämnt eller skadat underlag kan kräva avjämning och reparation.",
          options: [
            { value: "ready", label: "Färdigt för läggning" },
            { value: "minor", label: "Mindre justeringar" },
            { value: "major", label: "Avjämning eller större reparation" },
          ],
        },
      ];
    case "concrete":
      return [
        {
          key: "lengthM",
          label: "Längd",
          type: "number",
          required: true,
          unit: "meter",
          reason: "Måtten används för att beräkna volymen.",
          minimum: 0.1,
          maximum: 10_000,
          step: 0.1,
        },
        {
          key: "widthM",
          label: "Bredd",
          type: "number",
          required: true,
          unit: "meter",
          reason: "Måtten används för att beräkna volymen.",
          minimum: 0.1,
          maximum: 10_000,
          step: 0.1,
        },
        {
          key: "thicknessMm",
          label: "Tjocklek",
          type: "number",
          required: true,
          unit: "mm",
          reason: "Tjockleken behövs för betongvolym och hantering.",
          minimum: 1,
          maximum: 10_000,
          step: 1,
        },
        {
          key: "reinforcement",
          label: "Ingår armering?",
          type: "boolean",
          required: true,
          reason: "Armering påverkar material, kapning och arbetstid.",
        },
      ];
    case "roofing":
      return [
        {
          key: "areaM2",
          label: "Hur stor takyta gäller?",
          type: "number",
          required: true,
          unit: "m²",
          reason: "Takytan styr huvuddelen av arbetstid och material.",
          minimum: 0.1,
          maximum: 1_000_000,
          step: 0.1,
        },
        {
          key: "roofPitch",
          label: "Hur brant är taket?",
          type: "select",
          required: true,
          reason: "Taklutning påverkar åtkomst, fallskydd och produktionstakt.",
          options: [
            { value: "low", label: "Låg lutning" },
            { value: "normal", label: "Normal lutning" },
            { value: "steep", label: "Brant tak" },
          ],
        },
        {
          key: "roofMaterial",
          label: "Vilket takmaterial gäller?",
          type: "select",
          required: true,
          reason: "Papp, pannor och plåt har olika arbetsmoment.",
          options: [
            { value: "felt", label: "Takpapp" },
            { value: "tiles", label: "Takpannor" },
            { value: "sheet_metal", label: "Plåt" },
            { value: "other", label: "Annat" },
          ],
        },
      ];
    case "demolition":
      return [
        {
          key: "areaM2",
          label: "Hur stor yta eller omfattning ska rivas?",
          type: "number",
          required: true,
          unit: "m²",
          reason: "Omfattningen styr tid, sortering och transporter.",
          minimum: 0.1,
          maximum: 1_000_000,
          step: 0.1,
        },
        {
          key: "hazardousMaterial",
          label: "Finns risk för asbest eller annat farligt material?",
          type: "boolean",
          required: true,
          reason: "Misstänkt farligt material måste hanteras separat och får inte prisas som vanlig rivning.",
        },
        {
          key: "wasteRemovalExVat",
          label: "Uppskattad kostnad för container, sortering och bortforsling",
          type: "number",
          required: true,
          unit: "kr exkl. moms",
          reason: "Avfallskostnaden är ofta en väsentlig del av rivningsarbetet.",
          minimum: 0,
          maximum: 100_000_000,
          step: 1,
        },
      ];
    case "electrical":
    case "plumbing":
      return [
        {
          key: "quantity",
          label: category === "electrical" ? "Hur många elpunkter eller anslutningar gäller?" : "Hur många anslutningar eller enheter gäller?",
          type: "number",
          required: true,
          unit: "st",
          reason: "Antalet punkter används som mängd för arbetstiden.",
          minimum: 1,
          maximum: 100_000,
          step: 1,
        },
        {
          key: "runLengthM",
          label: category === "electrical" ? "Ungefärlig kabelsträcka" : "Ungefärlig rörsträcka",
          type: "number",
          required: true,
          unit: "meter",
          reason: "Sträckan påverkar håltagning, infästning och material.",
          minimum: 0,
          maximum: 100_000,
          step: 0.1,
        },
        {
          key: "specialistAllowanceExVat",
          label: "Uppskattat specialist- eller UE-belopp",
          type: "number",
          required: false,
          unit: "kr exkl. moms",
          reason: "Behörighetskrävande arbete kan behöva utföras av specialist eller UE.",
          minimum: 0,
          maximum: 100_000_000,
          step: 1,
        },
      ];
    default:
      return [
        {
          key: "laborHours",
          label: "Hur många arbetstimmar bedömer ni att arbetet tar?",
          type: "number",
          required: true,
          unit: "timmar",
          reason: "När arbetstypen är ovanlig behöver Bynex en första tidsbedömning.",
          minimum: 0.5,
          maximum: 100_000,
          step: 0.5,
        },
        {
          key: "quantity",
          label: "Vilken mängd eller antal gäller?",
          type: "number",
          required: false,
          unit: "st",
          reason: "Mängden förbättrar förklaringen och framtida jämförelser.",
          minimum: 0,
          maximum: 1_000_000,
          step: 0.1,
        },
      ];
  }
}

function answered(question: EstimateQuestion, answers: EstimateAnswers) {
  if (question.type === "number") {
    const value = numberAnswer(answers, question.key);
    return value !== null && (!question.minimum || value >= question.minimum);
  }
  if (question.type === "boolean") return booleanAnswer(answers, question.key) !== null;
  return Boolean(stringAnswer(answers, question.key));
}

function measurement(category: EstimateCategory, answers: EstimateAnswers) {
  if (category === "wall") {
    const length = numberAnswer(answers, "lengthM");
    const height = numberAnswer(answers, "heightM");
    return length !== null && height !== null
      ? { units: length * height, label: "m² väggyta" }
      : { units: null, label: "m² väggyta" };
  }
  if (["painting", "flooring", "roofing", "demolition"].includes(category)) {
    return { units: numberAnswer(answers, "areaM2"), label: "m²" };
  }
  if (category === "concrete") {
    const length = numberAnswer(answers, "lengthM");
    const width = numberAnswer(answers, "widthM");
    const thickness = numberAnswer(answers, "thicknessMm");
    return length !== null && width !== null && thickness !== null
      ? { units: length * width * (thickness / 1_000), label: "m³" }
      : { units: null, label: "m³" };
  }
  if (["electrical", "plumbing"].includes(category)) {
    return { units: numberAnswer(answers, "quantity"), label: "punkter" };
  }
  return {
    units: numberAnswer(answers, "quantity") ?? numberAnswer(answers, "laborHours"),
    label: numberAnswer(answers, "quantity") !== null ? "st" : "timmar",
  };
}

function difficultyFactor(answers: EstimateAnswers) {
  const difficulty = stringAnswer(answers, "difficulty") ?? "normal";
  if (difficulty === "easy") return 0.9;
  if (difficulty === "difficult") return 1.25;
  if (difficulty === "occupied") return 1.35;
  return 1;
}

function categoryFactor(category: EstimateCategory, answers: EstimateAnswers) {
  let factor = 1;
  if (category === "wall") {
    const wallBuild = stringAnswer(answers, "wallBuild");
    if (wallBuild === "double") factor *= 1.35;
    if (wallBuild === "insulated") factor *= 1.25;
    if (wallBuild === "fire_sound") factor *= 1.65;
    factor *= 1 + (numberAnswer(answers, "openings") ?? 0) * 0.08;
  }
  if (category === "painting") {
    const preparation = stringAnswer(answers, "surfacePreparation");
    if (preparation === "normal") factor *= 1.25;
    if (preparation === "extensive") factor *= 1.75;
    factor *= Math.max(1, (numberAnswer(answers, "coats") ?? 2) / 2);
  }
  if (category === "flooring") {
    const floorType = stringAnswer(answers, "floorType");
    if (floorType === "parquet") factor *= 1.2;
    if (floorType === "tile") factor *= 1.8;
    const subfloor = stringAnswer(answers, "subfloorCondition");
    if (subfloor === "minor") factor *= 1.2;
    if (subfloor === "major") factor *= 1.65;
  }
  if (category === "concrete" && booleanAnswer(answers, "reinforcement")) factor *= 1.25;
  if (category === "roofing") {
    const pitch = stringAnswer(answers, "roofPitch");
    if (pitch === "steep") factor *= 1.35;
    const material = stringAnswer(answers, "roofMaterial");
    if (material === "tiles") factor *= 1.2;
    if (material === "sheet_metal") factor *= 1.3;
  }
  if (booleanAnswer(answers, "demolitionRequired")) factor *= 1.2;
  return factor * difficultyFactor(answers);
}

function historyForCategory(
  history: EstimateLearningSample[],
  category: EstimateCategory,
) {
  return history.filter(
    (sample) =>
      sample.category === category &&
      sample.measuredUnits > 0 &&
      sample.actualLaborHours >= 0 &&
      sample.finalPriceExVat > 0,
  );
}

export function buildChangeOrderEstimate(context: EstimateContext): EstimateResult {
  const category = context.aiCategory ?? classifyEstimateCategory(
    `${context.title} ${context.description} ${context.locationDetail ?? ""}`,
  );
  const rateFromAnswer = numberAnswer(context.answers, "hourlyRateExVat");
  const hourlyRate = context.hourlyRateExVat > 0 ? context.hourlyRateExVat : rateFromAnswer ?? 0;
  const questions = [
    ...categoryQuestions(category),
    ...commonQuestions(hourlyRate <= 0),
  ];

  const materialIncluded = booleanAnswer(context.answers, "materialIncluded");
  const categoryNeedsMaterial = !["demolition"].includes(category);
  if (materialIncluded === true && categoryNeedsMaterial) {
    questions.push({
      key: "materialAllowanceExVat",
      label: "Uppskattat materialbelopp före företagets materialpåslag",
      type: "number",
      required: true,
      unit: "kr exkl. moms",
      reason: "Till dess att livepriser har valts i Material söker Bynex inte påhittade materialpriser.",
      minimum: 0,
      maximum: 100_000_000,
      step: 1,
    });
  }

  questions.push(
    {
      key: "equipmentAllowanceExVat",
      label: "Maskiner, lift, hyra eller särskild utrustning",
      type: "number",
      required: false,
      unit: "kr exkl. moms",
      reason: "Utrustning som inte ingår i timpriset behöver läggas till separat.",
      minimum: 0,
      maximum: 100_000_000,
      step: 1,
    },
    {
      key: "otherAllowanceExVat",
      label: "Övrigt, transport eller avgifter",
      type: "number",
      required: false,
      unit: "kr exkl. moms",
      reason: "Transporter, parkering, etablering och avgifter kan påverka priset.",
      minimum: 0,
      maximum: 100_000_000,
      step: 1,
    },
  );

  const unanswered = questions.filter((question) => question.required && !answered(question, context.answers));
  const measurementValue = measurement(category, context.answers);
  const history = historyForCategory(context.history, category);

  if (unanswered.length > 0) {
    return {
      status: "needs_input",
      category,
      questions: unanswered.slice(0, 6),
      estimatedLaborHours: null,
      estimatedPriceLowExVat: null,
      estimatedPriceExVat: null,
      estimatedPriceHighExVat: null,
      vatRate: context.vatRate,
      estimatedVatAmount: null,
      estimatedPriceIncVat: null,
      confidence: 0,
      confidenceLabel: "Låg",
      explanation: `Bynex Smart har identifierat ${categoryNames[category]}, men behöver fler verifierbara uppgifter innan ett kundpris kan räknas fram.`,
      assumptions: [],
      missingInformation: unanswered.map((question) => question.label),
      historySampleCount: history.length,
      measuredUnits: measurementValue.units,
      measuredUnitLabel: measurementValue.label,
      breakdown: [],
      customerText: null,
    };
  }

  const units = measurementValue.units ?? 1;
  const explicitLaborHours = numberAnswer(context.answers, "laborHours");
  const historicalHoursPerUnit = median(
    history.map((sample) => sample.actualLaborHours / sample.measuredUnits),
  );
  const baseline = baselineHoursPerUnit[category] ?? 1;
  const factor = categoryFactor(category, context.answers);
  const laborHours = roundHours(
    explicitLaborHours ??
      units * (historicalHoursPerUnit ?? baseline) * factor,
  );

  const materialBase = materialIncluded
    ? numberAnswer(context.answers, "materialAllowanceExVat") ?? 0
    : 0;
  const materialSell = roundMoney(
    materialBase * (1 + Math.max(0, context.materialMarkupPercent) / 100),
  );
  const equipment = roundMoney(numberAnswer(context.answers, "equipmentAllowanceExVat") ?? 0);
  const specialist = roundMoney(numberAnswer(context.answers, "specialistAllowanceExVat") ?? 0);
  const wasteRemoval = roundMoney(numberAnswer(context.answers, "wasteRemovalExVat") ?? 0);
  const other = roundMoney(
    (numberAnswer(context.answers, "otherAllowanceExVat") ?? 0) + wasteRemoval,
  );
  const laborSell = roundMoney(laborHours * hourlyRate);

  const historicalFinalPerUnit = median(
    history.map((sample) => sample.finalPriceExVat / sample.measuredUnits),
  );
  const calculatedSubtotal = laborSell + materialSell + equipment + specialist + other;
  const historicalReference = historicalFinalPerUnit
    ? roundMoney(historicalFinalPerUnit * units)
    : null;
  const historyWeight = history.length >= 8 ? 0.45 : history.length >= 3 ? 0.25 : 0;
  const blendedSubtotal = historicalReference
    ? calculatedSubtotal * (1 - historyWeight) + historicalReference * historyWeight
    : calculatedSubtotal;

  const difficulty = stringAnswer(context.answers, "difficulty") ?? "normal";
  const uncertaintyPercent =
    history.length >= 8
      ? 8
      : history.length >= 3
        ? 12
        : difficulty === "difficult" || difficulty === "occupied"
          ? 22
          : 18;
  const estimate = roundMoney(blendedSubtotal);
  const low = roundMoney(estimate * (1 - uncertaintyPercent / 100));
  const high = roundMoney(estimate * (1 + uncertaintyPercent / 100));
  const vatRate = Math.min(100, Math.max(0, context.vatRate));
  const vatAmount = roundMoney(estimate * (vatRate / 100));
  const priceIncVat = estimate + vatAmount;

  const confidence = Math.min(
    0.95,
    0.5 +
      Math.min(0.25, history.length * 0.03) +
      (explicitLaborHours !== null ? 0.08 : 0) +
      (materialIncluded === false || materialBase > 0 ? 0.07 : 0) +
      (difficulty !== "difficult" && difficulty !== "occupied" ? 0.05 : 0),
  );
  const confidenceLabel = confidence >= 0.8 ? "Hög" : confidence >= 0.65 ? "Medel" : "Låg";

  const breakdown: EstimateBreakdownLine[] = [
    {
      category: "labor",
      label: "Arbete",
      quantity: laborHours,
      unit: "tim",
      unitPriceExVat: hourlyRate,
      amountExVat: laborSell,
      source:
        explicitLaborHours !== null
          ? "manual_answer"
          : historicalHoursPerUnit !== null
            ? "company_history"
            : "bynex_baseline",
      explanation:
        explicitLaborHours !== null
          ? "Arbetstiden angavs i kalkylen."
          : historicalHoursPerUnit !== null
            ? `Arbetstiden kalibrerades mot ${history.length} verifierade utfall i företaget.`
            : "Arbetstiden bygger på ett försiktigt Bynex-startantagande och måste granskas.",
    },
  ];
  if (materialSell > 0) {
    breakdown.push({
      category: "material",
      label: "Material",
      quantity: 1,
      unit: "summa",
      unitPriceExVat: materialSell,
      amountExVat: materialSell,
      source: "manual_answer",
      explanation: `Materialbelopp med ${Math.max(0, context.materialMarkupPercent)} % materialpåslag.`,
    });
  }
  if (equipment > 0) {
    breakdown.push({
      category: "equipment",
      label: "Maskiner och utrustning",
      quantity: 1,
      unit: "summa",
      unitPriceExVat: equipment,
      amountExVat: equipment,
      source: "manual_answer",
      explanation: "Beloppet angavs i kalkylen.",
    });
  }
  if (specialist > 0) {
    breakdown.push({
      category: "subcontractor",
      label: "Specialist eller UE",
      quantity: 1,
      unit: "summa",
      unitPriceExVat: specialist,
      amountExVat: specialist,
      source: "manual_answer",
      explanation: "Beloppet angavs i kalkylen.",
    });
  }
  if (other > 0) {
    breakdown.push({
      category: "other",
      label: "Transport, avfall och övrigt",
      quantity: 1,
      unit: "summa",
      unitPriceExVat: other,
      amountExVat: other,
      source: "manual_answer",
      explanation: "Beloppet angavs i kalkylen.",
    });
  }

  const assumptions = [
    `Omfattning klassificerad som ${categoryNames[category]}.`,
    `Kundpris arbete: ${roundMoney(hourlyRate)} kr per timme exkl. moms.`,
    `Osäkerhetsintervall: ±${uncertaintyPercent} %.`,
    ...(history.length > 0
      ? [`Kalkylen använder ${history.length} verifierade företagsutfall för samma arbetskategori.`]
      : ["Företaget saknar ännu verifierade utfall för denna arbetskategori."],
    ...(booleanAnswer(context.answers, "hazardousMaterial")
      ? ["Misstänkt farligt material ingår inte i priset och kräver separat inventering."]
      : []),
  ];

  const customerText = `Uppskattat pris ${estimate.toLocaleString("sv-SE")} kr exkl. moms (${priceIncVat.toLocaleString("sv-SE")} kr inkl. moms). Uppskattningen bygger på angiven omfattning, mått och nu kända förutsättningar. Priset kan ändras om omfattningen eller förutsättningarna förändras. Väsentliga avvikelser meddelas för nytt godkännande innan ytterligare arbete utförs.`;

  return {
    status: "ready",
    category,
    questions: [],
    estimatedLaborHours: laborHours,
    estimatedPriceLowExVat: low,
    estimatedPriceExVat: estimate,
    estimatedPriceHighExVat: high,
    vatRate,
    estimatedVatAmount: vatAmount,
    estimatedPriceIncVat: priceIncVat,
    confidence,
    confidenceLabel,
    explanation: historicalReference
      ? "Bynex Smart har kombinerat projektets priser och angivna mått med verifierade utfall från företagets tidigare arbeten."
      : "Bynex Smart har räknat på projektets priser och angivna mått. Kalkylen får högre precision när företaget samlar verifierade utfall.",
    assumptions,
    missingInformation: [],
    historySampleCount: history.length,
    measuredUnits: units,
    measuredUnitLabel: measurementValue.label,
    breakdown,
    customerText,
  };
}
