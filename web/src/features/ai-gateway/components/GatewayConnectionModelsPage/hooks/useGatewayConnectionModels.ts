import { useCallback, useMemo } from "react";

import { useSaveGatewayModelAccess } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/hooks/useSaveGatewayModelAccess";
import type { GatewayModelAccessChange } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/types/gatewayModelAccessChange";
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
  const input = useMemo(
    () => ({ orgId: organizationId, id: connectionId }),
    [organizationId, connectionId],
  );
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
  const saveModelAccess = useSaveGatewayModelAccess({
    organizationId,
    connectionId,
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
  const { mutate: saveModelAccessMutate } = saveModelAccess;
  const setModelsEnabled = useCallback(
    ({
      onSuccess,
      ...change
    }: GatewayModelAccessChange & { onSuccess?: () => void }) =>
      saveModelAccessMutate(change, { onSuccess }),
    [saveModelAccessMutate],
  );

  // The callbacks below feed the memoized models table, so they read the
  // connection from the cache instead of closing over the query result.
  const { mutateAsync: addCustomModelMutateAsync } = addCustomModelMutation;
  const addCustomModel = useCallback(
    async (model: string): Promise<boolean> => {
      const connection = utils.aiGateway.getConnection.getData(input);
      if (!connection) return false;
      try {
        await addCustomModelMutateAsync({
          ...input,
          model,
          expectedUpdatedAt: connection.updatedAt,
        });
        return true;
      } catch {
        return false;
      }
    },
    [input, utils, addCustomModelMutateAsync],
  );
  const { mutate: removeCustomModelMutate } = removeCustomModelMutation;
  const removeCustomModel = useCallback(
    (model: string) => {
      const connection = utils.aiGateway.getConnection.getData(input);
      if (!connection) return;
      removeCustomModelMutate({
        ...input,
        model,
        expectedUpdatedAt: connection.updatedAt,
      });
    },
    [input, utils, removeCustomModelMutate],
  );
  const { mutateAsync: testModelMutateAsync } = testModelMutation;
  const testModel = useCallback(
    async (model: string) => {
      try {
        return await testModelMutateAsync({ ...input, model });
      } catch {
        return undefined;
      }
    },
    [input, testModelMutateAsync],
  );

  return {
    connectionQuery,
    modelsQuery,
    isRetrying: retryModels.isPending,
    isSaving:
      saveModelAccess.isPending ||
      addCustomModelMutation.isPending ||
      removeCustomModelMutation.isPending,
    isAddingCustomModel: addCustomModelMutation.isPending,
    isTestingModel: testModelMutation.isPending,
    addCustomModel,
    removeCustomModel,
    testModel,
    retryDiscovery,
    retryQueries,
    setModelsEnabled,
  };
}
