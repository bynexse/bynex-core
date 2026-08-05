import { NextResponse } from "next/server";
import { requireSmartContext } from "@/lib/ai/authorization";
import {
  normalizeProjectPlan,
  type SmartPlanInput,
} from "@/lib/smart/project-plan";

export const runtime = "nodejs";
const MAX_IMAGE_DATA_URL = 7_500_000;

function isInput(value: unknown): value is SmartPlanInput {
  if (!value || typeof value !== "object") return false;
  const input = value as Record<string, unknown>;
  return (
    typeof input.projectName === "string" && input.projectName.trim().length > 0 && input.projectName.length <= 240 &&
    typeof input.description === "string" && input.description.length <= 4000 &&
    (input.fileName === undefined || (typeof input.fileName === "string" && input.fileName.length <= 240)) &&
    (input.imageDataUrl === undefined || (
      typeof input.imageDataUrl === "string" &&
      input.imageDataUrl.startsWith("data:image/") &&
      input.imageDataUrl.length <= MAX_IMAGE_DATA_URL
    ))
  );
}

function outputText(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const response = payload as { output_text?: unknown };
  return typeof response.output_text === "string" ? response.output_text : "";
}

export async function POST(request: Request) {
  const context = await requireSmartContext(undefined, "projects");
  if (!context.ok) return context.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ogiltig JSON." }, { status: 400 });
  }
  if (!isInput(body)) {
    return NextResponse.json({ error: "Projekt eller giltigt underlag saknas." }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL;
  if (!apiKey || !model) {
    return NextResponse.json(
      { error: "Bynex Smart planering är inte aktiverad ännu. Inga uppskattningar skapades." },
      { status: 503 },
    );
  }

  try {
    const content: Array<Record<string, unknown>> = [
      { type: "input_text", text: JSON.stringify({ projectName: body.projectName, description: body.description, fileName: body.fileName }) },
    ];
    if (body.imageDataUrl) content.push({ type: "input_image", image_url: body.imageDataUrl, detail: "high" });

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        instructions:
          "Du är Bynex Smart för svensk byggproduktion. Analysera användarens beskrivning och eventuell bild. Skapa ett praktiskt utkast, men gissa aldrig exakta mått, mängder, bärighet eller myndighetskrav. Svara bara med JSON: title, summary, tasks, materials, supervisorTips, possibleChangeOrder. tasks innehåller id, title, durationHours, dependsOn och role. materials innehåller name, quantity (nummer eller null), unit och neededByStep. Markera möjlig ÄTA när underlaget tyder på ändring, tillägg, hinder, skada eller avvikelse. Alla resultat ska granskas av behörig person före utförande.",
        input: [{ role: "user", content }],
        max_output_tokens: 2200,
      }),
      signal: AbortSignal.timeout(45000),
    });
    if (!response.ok) throw new Error(`Smart service ${response.status}`);
    const payload: unknown = await response.json();
    const cleaned = outputText(payload).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    return NextResponse.json(normalizeProjectPlan(JSON.parse(cleaned), body));
  } catch {
    return NextResponse.json(
      { error: "Bynex Smart kunde inte skapa ett verifierbart underlag. Försök igen senare." },
      { status: 502 },
    );
  }
}
