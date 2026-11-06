import type { RouterOutputs } from "@/src/utils/api";

export type GatewayConnection =
  RouterOutputs["aiGateway"]["listConnections"]["data"][number];

export type GatewayProvider = "OPENAI" | "ANTHROPIC" | "BEDROCK" | "CUSTOM";

/** The client-facing API an official provider speaks; Bedrock serves both and custom connections speak the formats they enable. */
export type GatewayApiFamily = Exclude<GatewayProvider, "BEDROCK" | "CUSTOM">;
