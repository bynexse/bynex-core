export type AiCapability =
  | "time-daybook"
  | "time-anomaly"
  | "time-summary"
  | "general-assistant";

export type AiRequest = {
  capability: AiCapability;
  input: string;
  locale?: "sv" | "en";
  context?: Record<string, unknown>;
};

export type AiResponse = {
  text: string;
  provider: "openai" | "local";
  model?: string;
};
