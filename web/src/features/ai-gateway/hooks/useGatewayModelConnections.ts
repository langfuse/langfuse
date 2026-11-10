import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";
import { api } from "@/src/utils/api";

/** Provider credentials as every gateway reader sees them: no secrets, with their allowed models. */
export function useGatewayModelConnections(organizationId: string) {
  const query = api.aiGateway.listModelConnections.useQuery({
    orgId: organizationId,
  });

  return {
    /** Undefined while loading or after an error. */
    connections: query.data,
    connectedProviders: new Set<GatewayProvider>(
      (query.data ?? []).map(({ provider }) => provider),
    ),
    isError: query.isError,
    refetch: () => query.refetch(),
  };
}
