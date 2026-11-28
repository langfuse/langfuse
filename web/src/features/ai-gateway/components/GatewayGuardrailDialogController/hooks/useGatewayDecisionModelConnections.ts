import {
  listGatewayDecisionModelConnections,
  type GatewayDecisionModelConnection,
} from "@/src/features/ai-gateway/fns/listGatewayDecisionModelConnections";
import { useGatewayModelCatalog } from "@/src/features/ai-gateway/hooks/useGatewayModelCatalog";
import { GATEWAY_DECISION_MODEL_PROVIDERS } from "@/src/features/ai-gateway/types/gatewayGuardrail";
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
  const hasEligibleConnections = Boolean(
    connections.data?.some((connection) =>
      (GATEWAY_DECISION_MODEL_PROVIDERS as readonly string[]).includes(
        connection.provider,
      ),
    ),
  );
  const catalog = useGatewayModelCatalog(organizationId, {
    enabled: enabled && connections.isSuccess && hasEligibleConnections,
  });

  const isCatalogLoading =
    connections.isSuccess && hasEligibleConnections && catalog.isPending;

  const items =
    connections.data && !isCatalogLoading
      ? listGatewayDecisionModelConnections(
          connections.data,
          catalog.results ?? [],
        )
      : undefined;

  return {
    connections: items,
    isLoading: enabled && (connections.isLoading || isCatalogLoading),
  };
}
