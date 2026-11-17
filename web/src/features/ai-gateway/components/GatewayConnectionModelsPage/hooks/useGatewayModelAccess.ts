import { useCallback, useEffect, useState } from "react";
import { hashKey, useQueryClient } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";

import { useSaveGatewayModelAccess } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/hooks/useSaveGatewayModelAccess";
import { createGatewayModelAccessStore } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/stores/createGatewayModelAccessStore";
import { api } from "@/src/utils/api";

/**
 * Owns per-model toggle state so a toggle re-renders only its own row: the
 * switch flips optimistically and the table never sees the pending save.
 */
export function useGatewayModelAccess({
  organizationId,
  connectionId,
  allowedModels,
}: {
  organizationId: string;
  connectionId: string;
  allowedModels: string[] | null;
}) {
  const utils = api.useUtils();
  const queryClient = useQueryClient();
  const [store] = useState(() => createGatewayModelAccessStore(allowedModels));
  const { mutate } = useSaveGatewayModelAccess({
    organizationId,
    connectionId,
    onSettled: ({ models }) => {
      for (const model of models) {
        store.getState().actions.settleOptimisticEnabled(model);
      }
    },
  });

  // Every write of the cached connection (saves, refetches, custom models)
  // reaches the store synchronously, before a save settles its optimistic value.
  useEffect(() => {
    const input = { orgId: organizationId, id: connectionId };
    const queryHash = hashKey(
      getQueryKey(api.aiGateway.getConnection, input, "query"),
    );
    const syncAllowedModels = () => {
      const connection = utils.aiGateway.getConnection.getData(input);
      if (connection) {
        store.getState().actions.setAllowedModels(connection.allowedModels);
      }
    };
    syncAllowedModels();
    return queryClient.getQueryCache().subscribe((event) => {
      if (event.type === "updated" && event.query.queryHash === queryHash) {
        syncAllowedModels();
      }
    });
  }, [organizationId, connectionId, queryClient, store, utils]);

  const toggleModel = useCallback(
    (model: string, enabled: boolean) => {
      store.getState().actions.setOptimisticEnabled(model, enabled);
      mutate({ models: [model], enabled, scope: "single" });
    },
    [store, mutate],
  );

  return { store, toggleModel };
}
