import { listGatewayEnabledModels } from "@/src/features/ai-gateway/fns/listGatewayEnabledModels";
import { useGatewayModelCatalog } from "@/src/features/ai-gateway/hooks/useGatewayModelCatalog";
import { api } from "@/src/utils/api";

/** The organization's admin-enabled models; undefined while loading, after an error, or when disabled. */
export function useGatewayEnabledModels(
  organizationId: string,
  { enabled }: { enabled: boolean },
) {
  const connections = api.aiGateway.listModelConnections.useQuery(
    { orgId: organizationId },
    { enabled },
  );
  const catalog = useGatewayModelCatalog(organizationId, {
    enabled: enabled && connections.isSuccess,
  });

  return connections.data && catalog.results
    ? listGatewayEnabledModels(connections.data, catalog.results)
    : undefined;
}
