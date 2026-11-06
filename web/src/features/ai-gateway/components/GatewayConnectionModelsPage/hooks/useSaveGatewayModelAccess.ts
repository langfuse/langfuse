import { useMutation } from "@tanstack/react-query";

import { getGatewayConnectionWriteScope } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/fns/getGatewayConnectionWriteScope";
import type { GatewayModelAccessChange } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/types/gatewayModelAccessChange";
import { isGatewayModelAllowed } from "@/src/features/ai-gateway/fns/isGatewayModelAllowed";
import { toGatewayAllowedModelsSet } from "@/src/features/ai-gateway/fns/toGatewayAllowedModelsSet";
import { updateGatewayAllowedModels } from "@/src/features/ai-gateway/fns/updateGatewayAllowedModels";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { api } from "@/src/utils/api";

/**
 * Saves model access changes in the connection's write queue. Each save reads
 * the cached connection when it starts, so queued changes build on the
 * previous write and its `updatedAt` instead of conflicting with it.
 */
export function useSaveGatewayModelAccess({
  organizationId,
  connectionId,
  onSettled,
}: {
  organizationId: string;
  connectionId: string;
  onSettled?: (change: GatewayModelAccessChange) => void;
}) {
  const utils = api.useUtils();
  const capture = usePostHogClientCapture();
  const input = { orgId: organizationId, id: connectionId };

  return useMutation({
    meta: { toastOperation: "gateway_model_access.save" },
    scope: getGatewayConnectionWriteScope(connectionId),
    mutationFn: async ({
      models,
      enabled,
      scope,
    }: GatewayModelAccessChange) => {
      const [connection, modelsResult] = await Promise.all([
        utils.aiGateway.getConnection.ensureData(input),
        utils.aiGateway.getConnectionModels.ensureData(input),
      ]);
      // Without the model list, a partial change could not keep the other
      // models' access, so it must not be saved.
      if (!modelsResult.success && scope !== "all") {
        throw new Error("Models could not be loaded. Refresh the provider.");
      }
      const availableModels = modelsResult.success ? modelsResult.models : [];
      let allowedModels: string[] | null = enabled ? null : [];
      if (scope !== "all") {
        allowedModels = updateGatewayAllowedModels({
          allowedModels: connection.allowedModels,
          availableModels,
          targetModels: models,
          enabled,
        });
      }
      const updatedConnection =
        await utils.client.aiGateway.updateConnectionModels.mutate({
          ...input,
          allowedModels,
          expectedUpdatedAt: connection.updatedAt,
        });
      return {
        connection: updatedConnection,
        availableModels,
        changedModelCount: models.filter(
          (model) =>
            isGatewayModelAllowed(connection.allowedModels, model) !== enabled,
        ).length,
      };
    },
    onSuccess: (
      { connection, availableModels, changedModelCount },
      { models, enabled, scope },
    ) => {
      utils.aiGateway.getConnection.setData(input, connection);
      const allowedModelsSet = toGatewayAllowedModelsSet(
        connection.allowedModels,
      );
      capture("ai_gateway:model_access_changed", {
        orgId: organizationId,
        provider: connection.provider,
        action: enabled ? "enable" : "disable",
        scope,
        modelCount: models.length,
        changedModelCount,
        enabledModelCount: availableModels.filter((model) =>
          isGatewayModelAllowed(allowedModelsSet, model),
        ).length,
        totalModelCount: availableModels.length,
      });
      // Not awaited: queued saves in this scope wait for onSuccess to finish.
      utils.aiGateway.listConnections.invalidate({
        orgId: organizationId,
      });
      utils.aiGateway.refreshModels.invalidate({ orgId: organizationId });
    },
    onSettled: async (_result, error, change) => {
      onSettled?.(change);
      if (error) await utils.aiGateway.getConnection.refetch(input);
    },
  });
}
