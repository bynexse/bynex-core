export type WorkdayAiResult = {
  source: "openai" | "local";
  diary: string;
  workType: string;
  materials: string[];
  possibleChangeOrder: {
    detected: boolean;
    reason: string;
  };
  followUp: string[];
};

type WorkdayInput = {
  note: string;
  projectName?: string;
  projectId?: string;
  activity?: string;
  workedDuration?: string;
};

const materialTerms = [
  "gips",
  "regel",
  "skruv",
  "isolering",
  "virke",
  "dörr",
  "fönster",
  "betong",
  "kabel",
  "rör",
  "färg",
];

const changeTerms = [
  "extra",
  "ändring",
  "tillägg",
  "kunden ville",
  "hinder",
  "skada",
  "väntade",
  "saknades",
  "avvikelse",
];

export function createLocalWorkdayResult(input: WorkdayInput): WorkdayAiResult {
  const note = input.note.trim().replace(/\s+/g, " ");
  const searchable = note.toLocaleLowerCase("sv-SE");
  const materials = materialTerms.filter((term) => searchable.includes(term));
  const matchedChange = changeTerms.find((term) => searchable.includes(term));
  const project = input.projectName ? ` på ${input.projectName}` : "";
  const duration = input.workedDuration && input.workedDuration !== "00:00:00"
    ? ` Registrerad arbetstid: ${input.workedDuration}.`
    : "";

  return {
    source: "local",
    diary: `${input.activity || "Arbete"}${project}: ${note}.${duration}`.replace("..", "."),
    workType: input.activity || "Ej klassificerat",
    materials,
    possibleChangeOrder: {
      detected: Boolean(matchedChange),
      reason: matchedChange
        ? `Anteckningen innehåller “${matchedChange}”. Kontrollera omfattning och kundgodkännande innan fakturering.`
        : "",
    },
    followUp: [
      ...(materials.length > 0 ? ["Kontrollera mängder och koppla materialet till rätt underlag."] : []),
      ...(matchedChange ? ["Skapa eller koppla ett ÄTA-underlag och dokumentera kundens startbesked."] : []),
    ],
  };
}

export function normalizeWorkdayResult(
  value: Partial<WorkdayAiResult>,
  fallback: WorkdayAiResult,
): WorkdayAiResult {
  return {
    source: "openai",
    diary: typeof value.diary === "string" && value.diary.trim() ? value.diary.trim() : fallback.diary,
    workType: typeof value.workType === "string" && value.workType.trim() ? value.workType.trim() : fallback.workType,
    materials: Array.isArray(value.materials)
      ? value.materials.filter((item): item is string => typeof item === "string").slice(0, 20)
      : fallback.materials,
    possibleChangeOrder: {
      detected: Boolean(value.possibleChangeOrder?.detected),
      reason:
        typeof value.possibleChangeOrder?.reason === "string"
          ? value.possibleChangeOrder.reason.trim()
          : fallback.possibleChangeOrder.reason,
    },
    followUp: Array.isArray(value.followUp)
      ? value.followUp.filter((item): item is string => typeof item === "string").slice(0, 10)
      : fallback.followUp,
  };
}
