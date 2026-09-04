import type { RouterOutputs } from "@/src/utils/api";

export type GatewayConnection =
  RouterOutputs["llmGateway"]["listConnections"]["data"][number];
