import type { RouterOutputs } from "@/src/utils/api";

export type GatewayConnection =
  RouterOutputs["aiGateway"]["listConnections"]["data"][number];

export type GatewayProvider =
  | "OPENAI"
  | "ANTHROPIC"
  | "BEDROCK"
  | "OPENROUTER"
  | "XAI"
  | "VERCEL"
  | "AZURE"
  | "GOOGLE_AI_STUDIO"
  | "VERTEX";

/**
 * The client-facing API a provider speaks; Bedrock, OpenRouter, Vercel and Azure
 * serve both, xAI and Google AI Studio serve OpenAI formats from their own
 * hosted API, and Vertex AI serves OpenAI Chat Completions.
 */
export type GatewayApiFamily = Exclude<
  GatewayProvider,
  | "BEDROCK"
  | "OPENROUTER"
  | "XAI"
  | "VERCEL"
  | "AZURE"
  | "GOOGLE_AI_STUDIO"
  | "VERTEX"
>;
