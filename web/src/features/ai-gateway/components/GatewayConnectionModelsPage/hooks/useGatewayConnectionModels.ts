import { gatewayConnectionsPageSize } from "@/src/features/ai-gateway/constants/gatewayConnectionsPageSize";
import { api } from "@/src/utils/api";

export function useGatewayConnectionModels({
  organizationId,
  connectionId,
}: {
  organizationId: string;
  connectionId: string;
}) {
  const utils = api.useUtils();
  const input = { orgId: organizationId, id: connectionId };
  const connectionQuery = api.aiGateway.getConnection.useQuery(input, {
    placeholderData: () =>
      utils.aiGateway.listConnections
        .getInfiniteData({
          orgId: organizationId,
          limit: gatewayConnectionsPageSize,
        })
        ?.pages.flatMap((page) => page.data)
        .find((connection) => connection.id === connectionId),
  });
  const modelsQuery = api.aiGateway.getConnectionModels.useQuery(input);
  const updateModels = api.aiGateway.updateConnectionModels.useMutation({
    onSuccess: async (connection) => {
      utils.aiGateway.getConnection.setData(input, connection);
      await Promise.all([
        utils.aiGateway.listConnections.invalidate({ orgId: organizationId }),
        utils.aiGateway.refreshModels.invalidate({ orgId: organizationId }),
      ]);
    },
    onSettled: async (_connection, error) => {
      if (error) await connectionQuery.refetch();
    },
  });
  const retryModels = api.aiGateway.retryConnection.useMutation({
    onSuccess: async () => {
      await Promise.all([
        connectionQuery.refetch(),
        modelsQuery.refetch(),
        utils.aiGateway.listConnections.invalidate({ orgId: organizationId }),
        utils.aiGateway.refreshModels.invalidate({ orgId: organizationId }),
      ]);
    },
  });

  const retryQueries = () =>
    Promise.all([connectionQuery.refetch(), modelsQuery.refetch()]);
  const retryDiscovery = () => retryModels.mutate(input);
  const saveAllowedModels = (
    allowedModels: string[] | null,
    onSuccess?: () => void,
  ) => {
    if (!connectionQuery.data) return;
    updateModels.mutate(
      {
        ...input,
        allowedModels,
        expectedUpdatedAt: connectionQuery.data.updatedAt,
      },
      { onSuccess },
    );
  };

  return {
    connectionQuery,
    modelsQuery,
    isRetrying: retryModels.isPending,
    isSaving: updateModels.isPending,
    retryDiscovery,
    retryQueries,
    saveAllowedModels,
  };
}
