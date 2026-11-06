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
    actions: {
      setAllowedModels: (nextAllowedModels) =>
        set({ allowedModels: toGatewayAllowedModelsSet(nextAllowedModels) }),
      setOptimisticEnabled: (model, enabled) =>
        set((state) => ({
          optimisticEnabled: { ...state.optimisticEnabled, [model]: enabled },
        })),
      settleOptimisticEnabled: (model, enabled) =>
        set((state) => {
          if (state.optimisticEnabled[model] !== enabled) return state;
          const { [model]: _settled, ...optimisticEnabled } =
            state.optimisticEnabled;
          return { optimisticEnabled };
        }),
    },
  }));
}
