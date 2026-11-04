import type { GatewayIngestionMode } from "@langfuse/shared";

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
