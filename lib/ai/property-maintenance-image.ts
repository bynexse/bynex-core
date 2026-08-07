import type { MaintenanceSuggestion } from "@/lib/ai/property-maintenance-plan";

const categories = new Set<MaintenanceSuggestion["category"]>([
  "roof",
  "facade",
  "windows",
  "foundation",
  "drainage",
  "ground",
  "heating",
  "ventilation",
  "electrical",
  "plumbing",
  "bathroom",
  "kitchen",
  "interior",
  "fire_safety",
  "appliance",
  "association",
  "documentation",
  "other",
]);
const priorities = new Set<MaintenanceSuggestion["priority"]>([
  "low",
  "normal",
  "high",
  "critical",
]);

type ImageAnalysisInput = {
  propertyType: string;
  constructionYear: number | null;
  livingAreaSqm: number | null;
  plotAreaSqm: number | null;
  propertyNotes: string;
  measurements: string;
  imageUrls: string[];
};

type UnknownRecord = Record<string, unknown>;

function object(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function text(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function numeric(value: unknown, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : null;
}

function parseSuggestions(value: unknown): MaintenanceSuggestion[] {
  const root = object(value);
  const rows = Array.isArray(root.suggestions) ? root.suggestions : [];
  return rows.slice(0, 8).flatMap((row) => {
    const item = object(row);
    const title = text(item.title, 240);
    const category = text(item.category, 40) as MaintenanceSuggestion["category"];
    const description = text(item.description, 3000);
    const priority = text(item.priority, 20) as MaintenanceSuggestion["priority"];
    const dueInMonths = numeric(item.dueInMonths, 0, 120);
    const recurrenceMonths =
      item.recurrenceMonths === null || item.recurrenceMonths === undefined
        ? null
        : numeric(item.recurrenceMonths, 1, 1200);
    const smartReason = text(item.smartReason, 2000);

    if (
      title.length < 2 ||
      description.length < 10 ||
      smartReason.length < 10 ||
      !categories.has(category) ||
      !priorities.has(priority) ||
      dueInMonths === null ||
      (item.recurrenceMonths !== null &&
        item.recurrenceMonths !== undefined &&
        recurrenceMonths === null)
    ) {
      return [];
    }

    return [
      {
        title,
        category,
        description,
        priority,
        dueInMonths: Math.round(dueInMonths),
        recurrenceMonths:
          recurrenceMonths === null ? null : Math.round(recurrenceMonths),
        smartReason,
      },
    ];
  });
}

export async function analyzePropertyMaintenanceImages(
  input: ImageAnalysisInput,
): Promise<MaintenanceSuggestion[]> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || input.imageUrls.length === 0) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5-mini",
        instructions: [
          "Du är Bynex Smart för svensk fastighetsdokumentation.",
          "Analysera endast sådant som faktiskt är synligt i valda bilder och information som användaren själv har lämnat.",
          "Ställ aldrig medicinsk, elektrisk, konstruktiv, fuktteknisk eller juridisk diagnos.",
          "Påstå aldrig att en dold skada finns. Formulera osäkerhet som behov av kontroll av behörig fackperson.",
          "Föreslå endast säkra observationer, dokumentation, rengöring eller professionell kontroll.",
          "Svara endast med JSON i formen {\"suggestions\":[{\"title\":string,\"category\":string,\"description\":string,\"priority\":\"low|normal|high|critical\",\"dueInMonths\":number,\"recurrenceMonths\":number|null,\"smartReason\":string}]}",
          `Tillåtna kategorier: ${Array.from(categories).join(", ")}.`,
          "Maximalt åtta förslag. Alla förslag kommer att kräva mänsklig granskning innan de aktiveras.",
        ].join(" "),
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: JSON.stringify({
                  propertyType: input.propertyType,
                  constructionYear: input.constructionYear,
                  livingAreaSqm: input.livingAreaSqm,
                  plotAreaSqm: input.plotAreaSqm,
                  propertyNotes: input.propertyNotes,
                  measurements: input.measurements,
                }),
              },
              ...input.imageUrls.slice(0, 3).map((imageUrl) => ({
                type: "input_image",
                image_url: imageUrl,
                detail: "high",
              })),
            ],
          },
        ],
      }),
    });

    if (!response.ok) return [];
    const payload = (await response.json()) as { output_text?: string };
    if (!payload.output_text) return [];
    const cleaned = payload.output_text
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/```$/i, "")
      .trim();
    return parseSuggestions(JSON.parse(cleaned));
  } catch (cause) {
    console.error("Bynex Smart fastighetsbildanalys fallback:", cause);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
