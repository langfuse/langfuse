import { useCallback, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";

import { getGatewayConnectionWriteScope } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/fns/getGatewayConnectionWriteScope";
import { useSaveGatewayModelAccess } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/hooks/useSaveGatewayModelAccess";
import type { GatewayModelAccessChange } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/types/gatewayModelAccessChange";
import { gatewayConnectionsPageSize } from "@/src/features/ai-gateway/constants/gatewayConnectionsPageSize";
import type { GatewayConnection } from "@/src/features/ai-gateway/types/gatewayProvider";
import { api, reportTrpcErrorWithoutToast } from "@/src/utils/api";

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
    scope: getGatewayConnectionWriteScope(connectionId),
    onSuccess: async (connection: GatewayConnection) => {
      utils.aiGateway.getConnection.setData(input, connection);
      utils.aiGateway.listConnections.invalidate({ orgId: organizationId });
      utils.aiGateway.refreshModels.invalidate({ orgId: organizationId });
      // Awaited: queued model access saves read the refreshed model list.
      await utils.aiGateway.getConnectionModels.refetch(input);
    },
    // Custom model edits show no toast; failures are still reported.
    onError: (error: unknown) =>
      reportTrpcErrorWithoutToast(error, "ai-gateway-custom-models"),
    onSettled: async (_connection: unknown, error: unknown) => {
      if (error) await utils.aiGateway.getConnection.refetch(input);
    },
  };
  // Custom model writes share the model access write queue and read the
  // connection's `updatedAt` only when their turn comes.
  const addCustomModelMutation = useMutation({
    ...customModelMutationOptions,
    mutationFn: async (model: string) => {
      const connection = await utils.aiGateway.getConnection.ensureData(input);
      return utils.client.aiGateway.addConnectionCustomModel.mutate({
        ...input,
        model,
        expectedUpdatedAt: connection.updatedAt,
      });
    },
  });
  const removeCustomModelMutation = useMutation({
    ...customModelMutationOptions,
    mutationFn: async (model: string) => {
      const connection = await utils.aiGateway.getConnection.ensureData(input);
      return utils.client.aiGateway.removeConnectionCustomModel.mutate({
        ...input,
        model,
        expectedUpdatedAt: connection.updatedAt,
      });
    },
  });
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

  // The callbacks below feed the memoized models table, so they stay stable.
  const { mutateAsync: addCustomModelMutateAsync } = addCustomModelMutation;
  const addCustomModel = useCallback(
    async (model: string): Promise<boolean> => {
      try {
        await addCustomModelMutateAsync(model);
        return true;
      } catch {
        return false;
      }
    },
    [addCustomModelMutateAsync],
  );
  const { mutate: removeCustomModel } = removeCustomModelMutation;
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
