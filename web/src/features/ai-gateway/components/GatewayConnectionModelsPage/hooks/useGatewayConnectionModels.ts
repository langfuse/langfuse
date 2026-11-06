import { gatewayConnectionsPageSize } from "@/src/features/ai-gateway/constants/gatewayConnectionsPageSize";
import type { GatewayConnection } from "@/src/features/ai-gateway/types/gatewayProvider";
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
  const customModelMutationOptions = {
    onSuccess: async (connection: GatewayConnection) => {
      utils.aiGateway.getConnection.setData(input, connection);
      await Promise.all([
        modelsQuery.refetch(),
        utils.aiGateway.listConnections.invalidate({ orgId: organizationId }),
        utils.aiGateway.refreshModels.invalidate({ orgId: organizationId }),
      ]);
    },
    onSettled: async (_connection: unknown, error: unknown) => {
      if (error) await connectionQuery.refetch();
    },
  };
  const addCustomModelMutation =
    api.aiGateway.addConnectionCustomModel.useMutation(
      customModelMutationOptions,
    );
  const removeCustomModelMutation =
    api.aiGateway.removeConnectionCustomModel.useMutation(
      customModelMutationOptions,
    );
  const testModelMutation = api.aiGateway.testConnectionModel.useMutation();
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

  const addCustomModel = async (model: string): Promise<boolean> => {
    if (!connectionQuery.data) return false;
    try {
      await addCustomModelMutation.mutateAsync({
        ...input,
        model,
        expectedUpdatedAt: connectionQuery.data.updatedAt,
      });
      return true;
    } catch {
      return false;
    }
  };
  const removeCustomModel = (model: string) => {
    if (!connectionQuery.data) return;
    removeCustomModelMutation.mutate({
      ...input,
      model,
      expectedUpdatedAt: connectionQuery.data.updatedAt,
    });
  };
  const testModel = async (model: string) => {
    try {
      return await testModelMutation.mutateAsync({ ...input, model });
    } catch {
      return undefined;
    }
  };

  return {
    connectionQuery,
    modelsQuery,
    isRetrying: retryModels.isPending,
    isSaving:
      updateModels.isPending ||
      addCustomModelMutation.isPending ||
      removeCustomModelMutation.isPending,
    isAddingCustomModel: addCustomModelMutation.isPending,
    isTestingModel: testModelMutation.isPending,
    addCustomModel,
    removeCustomModel,
    testModel,
    retryDiscovery,
    retryQueries,
    saveAllowedModels,
  };
}
