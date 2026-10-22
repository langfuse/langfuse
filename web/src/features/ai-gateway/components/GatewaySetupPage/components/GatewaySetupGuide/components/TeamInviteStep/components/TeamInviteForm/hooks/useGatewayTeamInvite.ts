import { api, reportNonTrpcError } from "@/src/utils/api";

export function useGatewayTeamInvite(organizationId: string) {
  const utils = api.useUtils();
  const notifiableMembersQuery = api.aiGateway.getNotifiableMembers.useQuery({
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
    notifiableMembers: notifiableMembersQuery.data,
    inviteTeam,
    isInviting: mutation.isPending,
  };
}
