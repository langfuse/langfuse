import type { RouterOutputs } from "@/src/utils/api";

export type TeamInviteFailure =
  RouterOutputs["aiGateway"]["inviteTeam"]["failed"][number];
