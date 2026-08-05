export type EvidenceCategory =
  | "receipt"
  | "delivery"
  | "material"
  | "damage"
  | "work_progress"
  | "other";

export type EvidenceMaterial = {
  name: string;
  quantity: number | null;
  unit: string | null;
};

export type EvidenceAiInput = {
  imageDataUrl: string;
  fileName: string;
  note: string;
  projectId: string;
  projectName: string;
  activity: string;
};

export type EvidenceAiResult = {
  category: EvidenceCategory;
  title: string;
  summary: string;
  supplier: string | null;
  totalAmount: number | null;
  currency: string | null;
  materials: EvidenceMaterial[];
  possibleChangeOrder: {
    detected: boolean;
    reason: string | null;
  };
  suggestedAction: string;
  confidence: number;
  source: "openai" | "local";
};

const receiptWords = ["kvitto", "receipt", "faktura", "invoice", "beijer", "byggmax", "ahlsell"];
const deliveryWords = ["leverans", "delivery", "pall", "fraktsedel"];
const damageWords = ["skada", "spricka", "läckage", "fel", "damage"];
const changeOrderWords = ["extra", "ändring", "tillägg", "skada", "fel", "hinder", "kunden ville"];

function includesAny(value: string, words: string[]) {
  return words.some((word) => value.includes(word));
}

export function createLocalEvidenceAnalysis(input: EvidenceAiInput): EvidenceAiResult {
  const searchable = `${input.fileName} ${input.note}`.toLocaleLowerCase("sv-SE");
  const category: EvidenceCategory = includesAny(searchable, receiptWords)
    ? "receipt"
    : includesAny(searchable, deliveryWords)
      ? "delivery"
      : includesAny(searchable, damageWords)
        ? "damage"
        : input.note.trim()
          ? "work_progress"
          : "other";
  const possibleChangeOrder = includesAny(searchable, changeOrderWords);

  const categoryTitle: Record<EvidenceCategory, string> = {
    receipt: "Kvitto eller inköpsunderlag",
    delivery: "Leveransunderlag",
    material: "Material på arbetsplats",
    damage: "Avvikelse eller skada",
    work_progress: "Dokumentation av utfört arbete",
    other: "Projektbild",
  };

  return {
    category,
    title: categoryTitle[category],
    summary: input.note.trim()
      ? `${input.note.trim()} Analysen gäller ${input.projectName}.`
      : `Analysen gäller ${input.projectName}. Lägg till en kort anteckning för säkrare analys.`,
    supplier: null,
    totalAmount: null,
    currency: null,
    materials: [],
    possibleChangeOrder: {
      detected: possibleChangeOrder,
      reason: possibleChangeOrder
        ? "Anteckningen innehåller ord som kan tyda på tillägg, ändring, skada eller hinder."
        : null,
    },
    suggestedAction:
      category === "receipt"
        ? "Kontrollera belopp och koppla inköpet till projektets materialkostnad."
        : category === "damage"
          ? "Skapa en avvikelse och bedöm om arbetet påverkar tid, kostnad eller ÄTA."
          : "Spara bilden i projektets dagbok.",
    confidence: input.note.trim() ? 0.55 : 0.35,
    source: "local",
  };
}

function normalizeCategory(value: unknown): EvidenceCategory {
  const categories: EvidenceCategory[] = [
    "receipt",
    "delivery",
    "material",
    "damage",
    "work_progress",
    "other",
  ];
  return typeof value === "string" && categories.includes(value as EvidenceCategory)
    ? (value as EvidenceCategory)
    : "other";
}

export function normalizeEvidenceResult(
  value: Partial<EvidenceAiResult>,
  input: EvidenceAiInput,
): EvidenceAiResult {
  const fallback = createLocalEvidenceAnalysis(input);
  return {
    category: normalizeCategory(value.category),
    title: typeof value.title === "string" && value.title.trim() ? value.title.trim() : fallback.title,
    summary:
      typeof value.summary === "string" && value.summary.trim()
        ? value.summary.trim()
        : fallback.summary,
    supplier:
      typeof value.supplier === "string" && value.supplier.trim() ? value.supplier.trim() : null,
    totalAmount:
      typeof value.totalAmount === "number" && Number.isFinite(value.totalAmount)
        ? value.totalAmount
        : null,
    currency:
      typeof value.currency === "string" && value.currency.trim() ? value.currency.trim() : null,
    materials: Array.isArray(value.materials)
      ? value.materials
          .filter((item): item is EvidenceMaterial => Boolean(item) && typeof item === "object" && typeof item.name === "string")
          .map((item) => ({
            name: item.name.trim(),
            quantity: typeof item.quantity === "number" && Number.isFinite(item.quantity) ? item.quantity : null,
            unit: typeof item.unit === "string" && item.unit.trim() ? item.unit.trim() : null,
          }))
      : fallback.materials,
    possibleChangeOrder: {
      detected: Boolean(value.possibleChangeOrder?.detected),
      reason:
        typeof value.possibleChangeOrder?.reason === "string" && value.possibleChangeOrder.reason.trim()
          ? value.possibleChangeOrder.reason.trim()
          : null,
    },
    suggestedAction:
      typeof value.suggestedAction === "string" && value.suggestedAction.trim()
        ? value.suggestedAction.trim()
        : fallback.suggestedAction,
    confidence:
      typeof value.confidence === "number" && Number.isFinite(value.confidence)
        ? Math.min(1, Math.max(0, value.confidence))
        : fallback.confidence,
    source: value.source === "openai" ? "openai" : "local",
  };
}
