import {
  listGatewayDecisionModelConnections,
  type GatewayDecisionModelConnection,
} from "@/src/features/ai-gateway/fns/listGatewayDecisionModelConnections";
import { useGatewayModelCatalog } from "@/src/features/ai-gateway/hooks/useGatewayModelCatalog";
import { api } from "@/src/utils/api";

export type GatewayDecisionModelConnectionsState = {
  connections: GatewayDecisionModelConnection[] | undefined;
  isLoading: boolean;
};

/** Enabled gateway connections and models available for decision-model guardrails. */
export function useGatewayDecisionModelConnections(
  organizationId: string,
  { enabled }: { enabled: boolean },
): GatewayDecisionModelConnectionsState {
  const connections = api.aiGateway.listModelConnections.useQuery(
    { orgId: organizationId },
    { enabled },
  );
  const catalog = useGatewayModelCatalog(organizationId, {
    enabled: enabled && connections.isSuccess,
  });

  const items =
    connections.data && catalog.results
      ? listGatewayDecisionModelConnections(connections.data, catalog.results)
      : undefined;

  return {
    connections: items,
    isLoading:
      enabled &&
      (connections.isLoading || (connections.isSuccess && catalog.isPending)),
  };
}
