import type { RouterOutputs } from "@/src/utils/api";

export type GatewayConnection =
  RouterOutputs["aiGateway"]["listConnections"]["data"][number];

export type GatewayProvider = "OPENAI" | "ANTHROPIC" | "BEDROCK";

/** The client-facing API a provider speaks; Bedrock serves both. */
export type GatewayApiFamily = Exclude<GatewayProvider, "BEDROCK">;
