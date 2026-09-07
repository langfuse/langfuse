import type { RouterOutputs } from "@/src/utils/api";

export type GatewayConnection =
  RouterOutputs["llmGateway"]["listConnections"]["data"][number];

export type GatewayProvider = "OPENAI" | "ANTHROPIC" | "OPENROUTER";
