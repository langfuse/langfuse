import { createStore } from "zustand/vanilla";

import { toGatewayAllowedModelsSet } from "@/src/features/ai-gateway/fns/toGatewayAllowedModelsSet";
import type {
  GatewayModelAccessState,
  GatewayModelAccessStore,
} from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/types/gatewayModelAccessStore";

export function createGatewayModelAccessStore(
  allowedModels: string[] | null,
): GatewayModelAccessStore {
  return createStore<GatewayModelAccessState>((set) => ({
    allowedModels: toGatewayAllowedModelsSet(allowedModels),
    optimisticEnabled: {},
    pendingSaves: {},
    actions: {
      setAllowedModels: (nextAllowedModels) =>
        set({ allowedModels: toGatewayAllowedModelsSet(nextAllowedModels) }),
      setOptimisticEnabled: (model, enabled) =>
        set((state) => ({
          optimisticEnabled: { ...state.optimisticEnabled, [model]: enabled },
          pendingSaves: {
            ...state.pendingSaves,
            [model]: (state.pendingSaves[model] ?? 0) + 1,
          },
        })),
      settleOptimisticEnabled: (model) =>
        set((state) => {
          const remainingSaves = (state.pendingSaves[model] ?? 0) - 1;
          if (remainingSaves > 0) {
            return {
              pendingSaves: { ...state.pendingSaves, [model]: remainingSaves },
            };
          }
          const { [model]: _settledValue, ...optimisticEnabled } =
            state.optimisticEnabled;
          const { [model]: _settledCount, ...pendingSaves } =
            state.pendingSaves;
          return { optimisticEnabled, pendingSaves };
        }),
    },
  }));
}
