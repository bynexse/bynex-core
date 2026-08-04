import { NextResponse } from "next/server";

import {
  createLocalWorkdayResult,
  normalizeWorkdayResult,
  type WorkdayAiResult,
} from "@/lib/ai/workday";

export const runtime = "nodejs";

type WorkdayRequest = {
  note?: string;
  projectName?: string;
  projectId?: string;
  activity?: string;
  workedDuration?: string;
};

function parseJson(text: string) {
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/```$/, "").trim();
  return JSON.parse(cleaned) as Partial<WorkdayAiResult>;
}

export async function POST(request: Request) {
  let payload: WorkdayRequest;
  try {
    payload = (await request.json()) as WorkdayRequest;
  } catch {
    return NextResponse.json({ error: "Ogiltig förfrågan" }, { status: 400 });
  }

  if (typeof payload.note !== "string" || payload.note.trim().length < 3) {
    return NextResponse.json({ error: "En arbetsanteckning krävs" }, { status: 400 });
  }

  const input = {
    note: payload.note,
    projectName: payload.projectName,
    projectId: payload.projectId,
    activity: payload.activity,
    workedDuration: payload.workedDuration,
  };
  const fallback = createLocalWorkdayResult(input);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json(fallback);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5-mini",
        instructions:
          "Du är Bynex Smart. Skapa en saklig svensk arbetsdagbok utan att hitta på fakta. Identifiera material och möjlig ÄTA försiktigt. Svara endast med JSON-fälten diary, workType, materials, possibleChangeOrder {detected, reason} och followUp.",
        input: JSON.stringify(input),
      }),
    });

    if (!response.ok) throw new Error(`Analystjänsten svarade ${response.status}`);
    const data = (await response.json()) as { output_text?: string };
    if (!data.output_text) throw new Error("Tomt analyssvar");
    return NextResponse.json(normalizeWorkdayResult(parseJson(data.output_text), fallback));
  } catch (error) {
    console.error("Bynex Smart arbetsdag fallback:", error);
    return NextResponse.json(fallback);
  }
}
