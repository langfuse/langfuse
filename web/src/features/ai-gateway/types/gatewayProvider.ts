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
  | "AZURE";

/**
 * The client-facing API a provider speaks; Bedrock, OpenRouter, Vercel and Azure
 * serve both, and xAI serves the OpenAI formats from its own hosted API.
 */
export type GatewayApiFamily = Exclude<
  GatewayProvider,
  "BEDROCK" | "OPENROUTER" | "XAI" | "VERCEL" | "AZURE"
>;
