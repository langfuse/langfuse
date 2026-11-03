import { isGatewayConfigComplete } from "@/src/features/ai-gateway/components/GatewaySetupPage/fns/isGatewayConfigComplete";
import type { GatewayConfig } from "@/src/features/ai-gateway/components/GatewaySetupPage/types/gatewaySetup";
import { api } from "@/src/utils/api";

/** The open step follows saved state, so a half-finished setup resumes where it stopped. */
export function useGatewaySetupProgress({
  organizationId,
  config,
}: {
  organizationId: string;
  config: GatewayConfig | null;
}) {
  const connectionsQuery = api.aiGateway.listConnections.useQuery({
    orgId: organizationId,
    limit: 1,
  });
  const firstConnection = connectionsQuery.data?.data[0];

  let activeStep: 1 | 2 | 3 = 3;
  if (!isGatewayConfigComplete(config)) activeStep = 1;
  else if (firstConnection === undefined) activeStep = 2;

  return {
    activeStep,
    firstConnection,
    isPending: connectionsQuery.isPending,
  };
}
