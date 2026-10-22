import { describeTeamInviteResult } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/components/TeamInviteStep/fns/describeTeamInviteResult";
import { showSuccessToast } from "@/src/features/notifications";
import { api, reportNonTrpcError } from "@/src/utils/api";

export function useGatewayTeamInvite(organizationId: string) {
  const utils = api.useUtils();
  const summaryQuery = api.aiGateway.getTeamInviteSummary.useQuery({
    orgId: organizationId,
  });
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
      await utils.aiGateway.getTeamInviteSummary.invalidate({
        orgId: organizationId,
      });
      if (result.invitedCount > 0 || result.notifiedCount > 0) {
        showSuccessToast({
          operation: "aiGateway.inviteTeam",
          title: "Team invited",
          description: describeTeamInviteResult(result),
        });
      }
      return result;
    } catch (error) {
      reportNonTrpcError(error, "ai-gateway-team-invite");
      return null;
    }
  }

  return {
    summary: summaryQuery.data,
    inviteTeam,
    isInviting: mutation.isPending,
  };
}
