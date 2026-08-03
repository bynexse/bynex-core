import { NextResponse } from "next/server";

import {
  createLocalEvidenceAnalysis,
  normalizeEvidenceResult,
  type EvidenceAiInput,
  type EvidenceAiResult,
} from "@/lib/ai/evidence";

export const runtime = "nodejs";

const MAX_DATA_URL_LENGTH = 7_500_000;

function isEvidenceInput(value: unknown): value is EvidenceAiInput {
  if (!value || typeof value !== "object") return false;
  const input = value as Record<string, unknown>;
  return (
    typeof input.imageDataUrl === "string" &&
    input.imageDataUrl.startsWith("data:image/") &&
    input.imageDataUrl.length <= MAX_DATA_URL_LENGTH &&
    typeof input.fileName === "string" &&
    typeof input.note === "string" &&
    typeof input.projectId === "string" &&
    typeof input.projectName === "string" &&
    typeof input.activity === "string"
  );
}

function extractOutputText(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const response = payload as {
    output_text?: unknown;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  if (typeof response.output_text === "string") return response.output_text;
  return (response.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("\n");
}

function parseJsonResult(text: string) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(cleaned) as Partial<EvidenceAiResult>;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ogiltig JSON." }, { status: 400 });
  }

  if (!isEvidenceInput(body)) {
    return NextResponse.json(
      { error: "Bild eller projektinformation saknas, eller bilden är för stor." },
      { status: 400 },
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL;
  if (!apiKey || !model) {
    return NextResponse.json(createLocalEvidenceAnalysis(body));
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        instructions:
          "Du är Bynex AI och analyserar bilder från arbetsplatser. Identifiera om bilden visar kvitto, leverans, material, skada/avvikelse, utfört arbete eller annat. Läs endast tydligt synlig information. Gissa inte belopp, leverantör eller mängder. Markera möjlig ÄTA endast när bild eller anteckning tydligt visar tillägg, ändring, skada eller hinder. Svara endast med giltig JSON utan markdown med fälten category, title, summary, supplier, totalAmount, currency, materials, possibleChangeOrder, suggestedAction och confidence. category måste vara receipt, delivery, material, damage, work_progress eller other. materials är en lista med name, quantity och unit. confidence är 0 till 1.",
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: JSON.stringify({
                  fileName: body.fileName,
                  note: body.note,
                  projectId: body.projectId,
                  projectName: body.projectName,
                  activity: body.activity,
                }),
              },
              { type: "input_image", image_url: body.imageDataUrl, detail: "auto" },
            ],
          },
        ],
        max_output_tokens: 900,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const fallback = createLocalEvidenceAnalysis(body);
      return NextResponse.json({
        ...fallback,
        warning: `OpenAI svarade med status ${response.status}. Lokal analys användes.`,
      });
    }

    const payload = (await response.json()) as unknown;
    const parsed = parseJsonResult(extractOutputText(payload));
    return NextResponse.json(normalizeEvidenceResult({ ...parsed, source: "openai" }, body));
  } catch {
    const fallback = createLocalEvidenceAnalysis(body);
    return NextResponse.json({
      ...fallback,
      warning: "Bildanalysen kunde inte nå AI-tjänsten. Lokal analys användes.",
    });
  }
}
