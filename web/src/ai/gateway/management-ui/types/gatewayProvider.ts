import type { RouterOutputs } from "@/src/app/utils/api";

export type GatewayConnection =
  RouterOutputs["aiGateway"]["listConnections"]["data"][number];

export type GatewayProvider = "OPENAI" | "ANTHROPIC";
