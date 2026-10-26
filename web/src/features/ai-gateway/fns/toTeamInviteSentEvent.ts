import type { AiGatewayEventMap } from "@/src/features/ai-gateway/types/aiGatewayAnalytics";
import type { RouterOutputs } from "@/src/utils/api";

export function toTeamInviteSentEvent({
  orgId,
  surface,
  emails,
  notifyMembers,
  result,
}: Pick<
  AiGatewayEventMap["ai_gateway:team_invite_sent"],
  "orgId" | "surface"
> & {
  emails: string[];
  notifyMembers: boolean;
  result: RouterOutputs["aiGateway"]["inviteTeam"];
}) {
  return {
    orgId,
    surface,
    emailCount: emails.length,
    invitedCount: result.invitedCount,
    existingMemberCount: result.existingMemberCount,
    notifiedMemberCount: result.notifiedCount,
    failedCount: result.failed.length,
    isNotifyMembersEnabled: notifyMembers,
  };
}
