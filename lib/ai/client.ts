import type { AiRequest, AiResponse } from "./types";

export async function askBynexAi(request: AiRequest): Promise<AiResponse> {
  const response = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error("Bynex AI kunde inte svara just nu.");
  }

  return response.json() as Promise<AiResponse>;
}
