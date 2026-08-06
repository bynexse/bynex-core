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

const baselineHoursPerUnit: Record<EstimateCategory, number> = {
  wall: 0.9,
  painting: 0.35,
  flooring: 0.55,
  concrete: 1.4,
  roofing: 0.95,
  demolition: 0.65,
  electrical: 1.5,
  plumbing: 1.75,
  generic: 1,
};

function normalizeText(value: string) {
  return value.toLocaleLowerCase("sv-SE").replace(/\s+/g, " ").trim();
}

export function classifyEstimateCategory(value: string): EstimateCategory {
  const normalized = normalizeText(value);
  let selected: EstimateCategory = "generic";
  let bestScore = 0;

  for (const [category, terms] of Object.entries(categoryTerms) as Array<
    [EstimateCategory, string[]]
  >) {
    const score = terms.reduce(
      (total, term) => total + (normalized.includes(term) ? term.length : 0),
      0,
    );
    if (score > bestScore) {
      selected = category;
      bestScore = score;
    }
  }

  return selected;
}

function numberAnswer(answers: EstimateAnswers, key: string) {
  const value = answers[key];
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function stringAnswer(answers: EstimateAnswers, key: string) {
  const value = answers[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function booleanAnswer(answers: EstimateAnswers, key: string) {
  const value = answers[key];
  if (typeof value === "boolean") return value;
  if (["true", "yes", "ja", "1"].includes(String(value).toLowerCase())) return true;
  if (["false", "no", "nej", "0"].includes(String(value).toLowerCase())) return false;
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

function selectQuestion(
  key: string,
  label: string,
  reason: string,
  options: Array<{ value: string; label: string }>,
): EstimateQuestion {
  return { key, label, reason, options, type: "select", required: true };
}

function numberQuestion(
  key: string,
  label: string,
  unit: string,
  reason: string,
  minimum = 0,
  maximum = 1_000_000,
  step = 0.1,
): EstimateQuestion {
  return {
    key,
    label,
    unit,
    reason,
    type: "number",
    required: true,
    minimum,
    maximum,
    step,
  };
}

function commonQuestions(hourlyRateMissing: boolean): EstimateQuestion[] {
  return [
    selectQuestion(
      "difficulty",
      "Hur svår är åtkomsten och arbetsmiljön?",
      "Trång åtkomst, skydd och pågående verksamhet påverkar arbetstiden.",
      [
        { value: "easy", label: "Enkel och fri åtkomst" },
        { value: "normal", label: "Normal åtkomst" },
        { value: "difficult", label: "Trångt eller komplicerat" },
        { value: "occupied", label: "Pågående verksamhet eller bebodd miljö" },
      ],
    ),
    {
      key: "demolitionRequired",
      label: "Ingår rivning eller demontering?",
      type: "boolean",
      required: true,
      reason: "Rivning, sortering och bortforsling påverkar tid och kostnad.",
    },
    {
      key: "materialIncluded",
      label: "Ska material ingå i uppskattningen?",
      type: "boolean",
      required: true,
      reason: "Bynex behöver veta om företaget eller kunden står för materialet.",
    },
    ...(hourlyRateMissing
      ? [
          numberQuestion(
            "hourlyRateExVat",
            "Vilket kundpris per arbetstimme ska användas?",
            "kr/tim exkl. moms",
            "Projektet saknar ett sparat timpris. Bynex gissar inte kundens pris.",
            1,
            10_000,
            1,
          ),
        ]
      : []),
  ];
}

function categoryQuestions(category: EstimateCategory): EstimateQuestion[] {
  switch (category) {
    case "wall":
      return [
        numberQuestion("lengthM", "Hur lång är väggen?", "meter", "Längd och höjd ger väggytan.", 0.1, 10_000),
        numberQuestion("heightM", "Hur hög är väggen?", "meter", "Längd och höjd ger väggytan.", 0.1, 100),
        selectQuestion(
          "wallBuild",
          "Vilken vägguppbyggnad gäller?",
          "Skivlager, isolering och brand- eller ljudkrav påverkar tid och material.",
          [
            { value: "single", label: "Enkelt skivlager" },
            { value: "double", label: "Dubbla skivlager" },
            { value: "insulated", label: "Isolerad vägg" },
            { value: "fire_sound", label: "Brand- eller ljudklassad vägg" },
          ],
        ),
        numberQuestion("openings", "Hur många öppningar ingår?", "st", "Öppningar kräver inpassning och förstärkning.", 0, 1_000, 1),
      ];
    case "painting":
      return [
        numberQuestion("areaM2", "Hur stor yta ska behandlas?", "m²", "Ytan styr huvuddelen av målning och spackling.", 0.1),
        selectQuestion(
          "surfacePreparation",
          "Vilket underarbete krävs?",
          "Tvätt, slipning, lagning och bredspackling påverkar tiden.",
          [
            { value: "none", label: "Nästan inget underarbete" },
            { value: "normal", label: "Normal lagning och slipning" },
            { value: "extensive", label: "Omfattande spackling eller skador" },
          ],
        ),
        numberQuestion("coats", "Hur många strykningar behövs?", "st", "Antal lager styr tid och material.", 1, 10, 1),
      ];
    case "flooring":
      return [
        numberQuestion("areaM2", "Hur stor golvyta gäller?", "m²", "Golvytan styr tid och material.", 0.1),
        selectQuestion(
          "floorType",
          "Vilken golvtyp ska läggas?",
          "Olika golvtyper kräver olika kapning, infästning och efterarbete.",
          [
            { value: "laminate", label: "Laminat eller klickgolv" },
            { value: "parquet", label: "Parkett" },
            { value: "tile", label: "Klinker" },
            { value: "sheet", label: "Matta eller skivmaterial" },
            { value: "other", label: "Annat" },
          ],
        ),
        selectQuestion(
          "subfloorCondition",
          "Hur är underlaget?",
          "Ojämnt eller skadat underlag kan kräva avjämning och reparation.",
          [
            { value: "ready", label: "Färdigt för läggning" },
            { value: "minor", label: "Mindre justeringar" },
            { value: "major", label: "Avjämning eller större reparation" },
          ],
        ),
      ];
    case "concrete":
      return [
        numberQuestion("lengthM", "Längd", "meter", "Måtten används för att beräkna volymen.", 0.1, 10_000),
        numberQuestion("widthM", "Bredd", "meter", "Måtten används för att beräkna volymen.", 0.1, 10_000),
        numberQuestion("thicknessMm", "Tjocklek", "mm", "Tjockleken behövs för betongvolymen.", 1, 10_000, 1),
        {
          key: "reinforcement",
          label: "Ingår armering?",
          type: "boolean",
          required: true,
          reason: "Armering påverkar både material och arbetstid.",
        },
      ];
    case "roofing":
      return [
        numberQuestion("areaM2", "Hur stor takyta gäller?", "m²", "Takytan styr huvuddelen av arbetet.", 0.1),
        selectQuestion(
          "roofType",
          "Vilken taktäckning gäller?",
          "Material och detaljarbete skiljer sig mellan olika taktyper.",
          [
            { value: "felt", label: "Papp" },
            { value: "tile", label: "Takpannor" },
            { value: "sheet_metal", label: "Plåt" },
            { value: "other", label: "Annat" },
          ],
        ),
        {
          key: "heightRisk",
          label: "Krävs extra fallskydd eller ställning?",
          type: "boolean",
          required: true,
          reason: "Fallskydd och ställning påverkar etablering och produktionstid.",
        },
      ];
    case "demolition":
      return [
        numberQuestion("areaM2", "Hur stor yta ska rivas?", "m²", "Ytan används för att uppskatta rivning och avfall.", 0.1),
        selectQuestion(
          "demolitionMaterial",
          "Vilket material ska rivas?",
          "Materialets vikt och infästning påverkar tid, maskiner och avfall.",
          [
            { value: "light", label: "Lätt vägg eller ytskikt" },
            { value: "wood", label: "Trä" },
            { value: "masonry", label: "Tegel eller murverk" },
            { value: "concrete", label: "Betong" },
          ],
        ),
        {
          key: "hazardousMaterial",
          label: "Finns misstanke om farligt material?",
          type: "boolean",
          required: true,
          reason: "Misstänkt asbest eller annat farligt material kräver separat inventering.",
        },
      ];
    case "electrical":
      return [
        numberQuestion("points", "Hur många elpunkter berörs?", "st", "Antal uttag, brytare och anslutningar styr arbetet.", 1, 10_000, 1),
        numberQuestion("cableLengthM", "Ungefärlig kabellängd", "meter", "Kabellängd påverkar material och dragningstid.", 0, 100_000),
        {
          key: "liveEnvironment",
          label: "Sker arbetet i pågående verksamhet?",
          type: "boolean",
          required: true,
          reason: "Samordning och säkra frånkopplingar kan öka tidsåtgången.",
        },
      ];
    case "plumbing":
      return [
        numberQuestion("points", "Hur många VVS-punkter berörs?", "st", "Antal anslutningar styr arbetstiden.", 1, 10_000, 1),
        numberQuestion("pipeLengthM", "Ungefärlig rörlängd", "meter", "Rörlängd påverkar material och installationstid.", 0, 100_000),
        {
          key: "shutdownRequired",
          label: "Krävs avstängning eller tillfällig försörjning?",
          type: "boolean",
          required: true,
          reason: "Avstängning och provisorier påverkar planering och tid.",
        },
      ];
    case "generic":
      return [
        numberQuestion("laborHours", "Uppskattad arbetstid", "timmar", "För övrigt arbete behövs en första bedömning av arbetstiden.", 0.5, 100_000, 0.5),
        numberQuestion("scopeUnits", "Antal eller omfattning", "enheter", "Omfattningen används för att jämföra framtida utfall.", 1, 1_000_000, 1),
      ];
  }
}

function answerIsValid(question: EstimateQuestion, answers: EstimateAnswers) {
  if (question.type === "boolean") return booleanAnswer(answers, question.key) !== null;
  if (question.type === "number") {
    const value = numberAnswer(answers, question.key);
    return value !== null && value >= (question.minimum ?? 0);
  }
  return stringAnswer(answers, question.key) !== null;
}

function measurement(category: EstimateCategory, answers: EstimateAnswers) {
  switch (category) {
    case "wall":
      return { value: (numberAnswer(answers, "lengthM") ?? 0) * (numberAnswer(answers, "heightM") ?? 0), label: "m² väggyta" };
    case "painting":
    case "flooring":
    case "roofing":
    case "demolition":
      return { value: numberAnswer(answers, "areaM2") ?? 0, label: "m²" };
    case "concrete":
      return {
        value:
          (numberAnswer(answers, "lengthM") ?? 0) *
          (numberAnswer(answers, "widthM") ?? 0) *
          ((numberAnswer(answers, "thicknessMm") ?? 0) / 1000),
        label: "m³",
      };
    case "electrical":
      return { value: numberAnswer(answers, "points") ?? 0, label: "elpunkter" };
    case "plumbing":
      return { value: numberAnswer(answers, "points") ?? 0, label: "VVS-punkter" };
    case "generic":
      return { value: numberAnswer(answers, "scopeUnits") ?? 1, label: "enheter" };
  }
}

function laborModifier(category: EstimateCategory, answers: EstimateAnswers) {
  let modifier = 1;
  const difficulty = stringAnswer(answers, "difficulty");
  modifier *= difficulty === "easy" ? 0.9 : difficulty === "difficult" ? 1.25 : difficulty === "occupied" ? 1.4 : 1;
  if (booleanAnswer(answers, "demolitionRequired")) modifier *= 1.15;

  if (category === "wall") {
    const build = stringAnswer(answers, "wallBuild");
    modifier *= build === "double" ? 1.25 : build === "insulated" ? 1.2 : build === "fire_sound" ? 1.5 : 1;
  }
  if (category === "painting") {
    const preparation = stringAnswer(answers, "surfacePreparation");
    modifier *= preparation === "extensive" ? 1.7 : preparation === "normal" ? 1.2 : 0.9;
    modifier *= Math.max(1, numberAnswer(answers, "coats") ?? 1) / 2;
  }
  if (category === "flooring") {
    const floorType = stringAnswer(answers, "floorType");
    const subfloor = stringAnswer(answers, "subfloorCondition");
    modifier *= floorType === "tile" ? 1.6 : floorType === "parquet" ? 1.2 : 1;
    modifier *= subfloor === "major" ? 1.6 : subfloor === "minor" ? 1.15 : 1;
  }
  if (category === "concrete" && booleanAnswer(answers, "reinforcement")) modifier *= 1.35;
  if (category === "roofing" && booleanAnswer(answers, "heightRisk")) modifier *= 1.3;
  if (category === "demolition") {
    const material = stringAnswer(answers, "demolitionMaterial");
    modifier *= material === "concrete" ? 1.8 : material === "masonry" ? 1.45 : material === "wood" ? 1.15 : 1;
  }
  if (category === "electrical") modifier += (numberAnswer(answers, "cableLengthM") ?? 0) / 500;
  if (category === "plumbing") modifier += (numberAnswer(answers, "pipeLengthM") ?? 0) / 300;
  return modifier;
}

export function buildChangeOrderEstimate(context: EstimateContext): EstimateResult {
  const category = context.aiCategory ?? classifyEstimateCategory(`${context.title} ${context.description} ${context.locationDetail ?? ""}`);
  const hourlyRateMissing = !(context.hourlyRateExVat > 0);
  const questions = [...categoryQuestions(category), ...commonQuestions(hourlyRateMissing)];
  if (booleanAnswer(context.answers, "materialIncluded") === true) {
    questions.push(
      numberQuestion(
        "materialAllowanceExVat",
        "Uppskattad materialkostnad",
        "kr exkl. moms före påslag",
        "Använd företagets prislista, artikelregister eller ett granskat belopp.",
        0,
        100_000_000,
        1,
      ),
    );
  }

  const missingQuestions = questions.filter((question) => !answerIsValid(question, context.answers));
  const history = context.history.filter(
    (item) =>
      item.category === category &&
      item.measuredUnits > 0 &&
      item.actualLaborHours >= 0 &&
      item.finalPriceExVat > 0,
  );
  const vatRate = Math.min(100, Math.max(0, Number.isFinite(context.vatRate) ? context.vatRate : 25));

  if (missingQuestions.length > 0) {
    return {
      status: "needs_input",
      category,
      questions: missingQuestions,
      estimatedLaborHours: null,
      estimatedPriceLowExVat: null,
      estimatedPriceExVat: null,
      estimatedPriceHighExVat: null,
      vatRate,
      estimatedVatAmount: null,
      estimatedPriceIncVat: null,
      confidence: Math.min(0.45, 0.25 + history.length * 0.02),
      confidenceLabel: "Låg",
      explanation: "Bynex Smart behöver de viktigaste måtten och förutsättningarna innan ett kundpris kan visas.",
      assumptions: [],
      missingInformation: missingQuestions.map((question) => question.label),
      historySampleCount: history.length,
      measuredUnits: null,
      measuredUnitLabel: measurement(category, context.answers).label,
      breakdown: [],
      customerText: null,
    };
  }

  const measurementValue = measurement(category, context.answers);
  const units = Math.max(0.01, measurementValue.value);
  const explicitHourlyRate = numberAnswer(context.answers, "hourlyRateExVat") ?? 0;
  const hourlyRate = context.hourlyRateExVat > 0 ? context.hourlyRateExVat : explicitHourlyRate;

  const historyHoursPerUnit = median(
    history.map((item) => item.actualLaborHours / item.measuredUnits),
  );
  const baselineHours = category === "generic"
    ? numberAnswer(context.answers, "laborHours") ?? 0
    : units * baselineHoursPerUnit[category] * laborModifier(category, context.answers);
  const laborHours = roundHours(
    historyHoursPerUnit !== null && history.length >= 3
      ? baselineHours * 0.6 + units * historyHoursPerUnit * 0.4
      : baselineHours,
  );

  const materialCost = booleanAnswer(context.answers, "materialIncluded")
    ? numberAnswer(context.answers, "materialAllowanceExVat") ?? 0
    : 0;
  const materialSell = roundMoney(materialCost * (1 + Math.max(0, context.materialMarkupPercent) / 100));
  const equipment = roundMoney(numberAnswer(context.answers, "equipmentAllowanceExVat") ?? 0);
  const specialist = roundMoney(numberAnswer(context.answers, "subcontractorAllowanceExVat") ?? 0);
  const other = roundMoney(numberAnswer(context.answers, "otherAllowanceExVat") ?? 0);
  const nonLabor = materialSell + equipment + specialist + other;

  const baselineLaborSell = roundMoney(laborHours * hourlyRate);
  const historyPricePerUnit = median(
    history.map((item) => item.finalPriceExVat / item.measuredUnits),
  );
  const laborSell = historyPricePerUnit !== null && history.length >= 3
    ? roundMoney(
        baselineLaborSell * 0.65 +
          Math.max(0, historyPricePerUnit * units - nonLabor) * 0.35,
      )
    : baselineLaborSell;

  const breakdown: EstimateBreakdownLine[] = [
    {
      category: "labor",
      label: "Arbete",
      quantity: laborHours,
      unit: "timmar",
      unitPriceExVat: hourlyRate,
      amountExVat: laborSell,
      source: history.length >= 3 ? "company_history" : "project_setting",
      explanation:
        history.length >= 3
          ? `Arbetstiden och prisnivån har kalibrerats mot ${history.length} verifierade företagsutfall.`
          : "Beräknat från angivna mått, projektets kundpris och Bynex byggschablon.",
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
      explanation: `Angiven materialkostnad med ${Math.max(0, context.materialMarkupPercent)} % påslag.`,
    });
  }
  if (equipment > 0) {
    breakdown.push({ category: "equipment", label: "Maskiner och utrustning", quantity: 1, unit: "summa", unitPriceExVat: equipment, amountExVat: equipment, source: "manual_answer", explanation: "Beloppet angavs i kalkylen." });
  }
  if (specialist > 0) {
    breakdown.push({ category: "subcontractor", label: "Specialist eller UE", quantity: 1, unit: "summa", unitPriceExVat: specialist, amountExVat: specialist, source: "manual_answer", explanation: "Beloppet angavs i kalkylen." });
  }
  if (other > 0) {
    breakdown.push({ category: "other", label: "Transport, avfall och övrigt", quantity: 1, unit: "summa", unitPriceExVat: other, amountExVat: other, source: "manual_answer", explanation: "Beloppet angavs i kalkylen." });
  }

  const estimate = roundMoney(breakdown.reduce((sum, line) => sum + line.amountExVat, 0));
  const confidence = Math.min(0.95, 0.58 + Math.min(history.length, 12) * 0.025);
  const confidenceLabel: "Låg" | "Medel" | "Hög" = confidence >= 0.8 ? "Hög" : confidence >= 0.6 ? "Medel" : "Låg";
  const uncertaintyPercent = history.length >= 8 ? 10 : history.length >= 3 ? 15 : 22;
  const low = roundMoney(estimate * (1 - uncertaintyPercent / 100));
  const high = roundMoney(estimate * (1 + uncertaintyPercent / 100));
  const vatAmount = roundMoney(estimate * vatRate / 100);
  const priceIncVat = estimate + vatAmount;

  const assumptions = [
    `Omfattning klassificerad som ${categoryNames[category]}.`,
    `Kundpris arbete: ${roundMoney(hourlyRate)} kr per timme exkl. moms.`,
    `Osäkerhetsintervall: ±${uncertaintyPercent} %.`,
    ...(history.length > 0
      ? [`Kalkylen använder ${history.length} verifierade företagsutfall för samma arbetskategori.`]
      : ["Företaget saknar ännu verifierade utfall för denna arbetskategori."]),
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
    explanation:
      history.length > 0
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
