import { buildAgentSetupInstructions } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GeneratedKeyContent/fns/agentSetupInstructions/buildAgentSetupInstructions";
import { api } from "@/src/utils/api";

export function useAgentSetupInstructions(organizationId: string) {
  const clientSetup = api.aiGateway.getClientSetup.useQuery({
    orgId: organizationId,
  });

  return {
    instructions: clientSetup.data
      ? buildAgentSetupInstructions({
          gatewayOrigin: new URL(clientSetup.data.gatewayBaseUrl).origin,
          providers: clientSetup.data.providers,
        })
      : undefined,
    isPending: clientSetup.isPending,
    isError: clientSetup.isError,
  };
}
