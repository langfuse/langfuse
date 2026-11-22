import { toTeamInviteSentEvent } from "@/src/features/ai-gateway/fns/toTeamInviteSentEvent";
import { useTeamRecipients } from "@/src/features/ai-gateway/hooks/useTeamRecipients";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { api, reportNonTrpcError } from "@/src/utils/api";

export function useGatewayTeamInvite(organizationId: string) {
  const utils = api.useUtils();
  const capture = usePostHogClientCapture();
  const recipients = useTeamRecipients(organizationId);
  const mutation = api.aiGateway.inviteTeam.useMutation();

  async function inviteTeam(params: {
    emails: string[];
    notifyMembers: boolean;
  }) {
    try {
      const result = await mutation.mutateAsync({
        orgId: organizationId,
        ...params,
      });
      capture(
        "ai_gateway:team_invite_sent",
        toTeamInviteSentEvent({
          orgId: organizationId,
          surface: "setup_guide",
          ...params,
          result,
        }),
      );
      await utils.aiGateway.getNotifiableMembers.invalidate({
        orgId: organizationId,
      });
      return result;
    } catch (error) {
      reportNonTrpcError(error, "ai-gateway-team-invite");
      return null;
    }
  }

  return {
    recipients,
    inviteTeam,
    isInviting: mutation.isPending,
  };
}
