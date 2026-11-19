import type { GatewayIngestionMode } from "@langfuse/shared";

import type { GatewaySpendLimit } from "@/src/features/ai-gateway/types/gatewaySpendLimit";
import type { RouterOutputs } from "@/src/utils/api";

export type GatewayConfig = NonNullable<
  RouterOutputs["aiGateway"]["getConfig"]["config"]
>;

export type GatewayProject = { id: string; name: string };

export type GatewayTeamInviteResult = RouterOutputs["aiGateway"]["inviteTeam"];

export type GatewayIngestionSettings = {
  ingestionMode: GatewayIngestionMode;
  projectTarget: "new" | "existing";
  newProjectName: string;
  existingProjectId: string | undefined;
};

/** The organization budget and the default user budget; null where there is none. */
export type GatewaySetupBudgets = {
  organization: GatewaySpendLimit | null;
  user: GatewaySpendLimit | null;
};
