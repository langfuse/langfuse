import type { RouterOutputs } from "@/src/utils/api";

export type GatewayConnection =
  RouterOutputs["aiGateway"]["listConnections"]["data"][number];

export type GatewayProvider =
  | "OPENAI"
  | "ANTHROPIC"
  | "BEDROCK"
  | "OPENROUTER"
  | "XAI"
  | "VERCEL";

/**
 * The client-facing API a provider speaks; Bedrock, OpenRouter and Vercel serve
 * both, and xAI serves the OpenAI formats from its own hosted API.
 */
export type GatewayApiFamily = Exclude<
  GatewayProvider,
  "BEDROCK" | "OPENROUTER" | "XAI" | "VERCEL"
>;
