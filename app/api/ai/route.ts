import { NextResponse } from "next/server";
import { getSystemPrompt } from "@/lib/ai/prompts";
import type { AiRequest, AiResponse } from "@/lib/ai/types";

export const runtime = "nodejs";

function localFallback(request: AiRequest): AiResponse {
  const cleaned = request.input.trim().replace(/\s+/g, " ");
  const text = request.locale === "en"
    ? `Work log: ${cleaned || "No note was provided."}`
    : `Arbetsdagbok: ${cleaned || "Ingen anteckning angavs."}`;
  return { text, provider: "local" };
}

export async function POST(request: Request) {
  let payload: AiRequest;
  try {
    payload = (await request.json()) as AiRequest;
  } catch {
    return NextResponse.json({ error: "Ogiltig förfrågan" }, { status: 400 });
  }

  if (!payload?.capability || typeof payload.input !== "string") {
    return NextResponse.json({ error: "capability och input krävs" }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json(localFallback(payload));

  try {
    const model = process.env.OPENAI_MODEL || "gpt-5-mini";
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        instructions: getSystemPrompt(payload.capability),
        input: JSON.stringify({
          user_input: payload.input,
          locale: payload.locale || "sv",
          context: payload.context || {},
        }),
      }),
    });

    if (!response.ok) throw new Error(`OpenAI ${response.status}`);
    const data = (await response.json()) as { output_text?: string };
    const result: AiResponse = {
      text: data.output_text?.trim() || localFallback(payload).text,
      provider: "openai",
      model,
    };
    return NextResponse.json(result);
  } catch (error) {
    console.error("Bynex Smart fallback:", error);
    return NextResponse.json(localFallback(payload));
  }
}
