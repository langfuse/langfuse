import type { StoreApi } from "zustand/vanilla";

export type GatewayModelAccessState = {
  /** Last allowed models confirmed by the server; `null` allows every model. */
  allowedModels: Set<string> | null;
  /** Per-model toggles that the server has not confirmed yet. */
  optimisticEnabled: Record<string, boolean>;
  actions: {
    setAllowedModels: (allowedModels: string[] | null) => void;
    setOptimisticEnabled: (model: string, enabled: boolean) => void;
    /** Drops the optimistic value unless the model was toggled again since. */
    settleOptimisticEnabled: (model: string, enabled: boolean) => void;
  };
};

export type GatewayModelAccessStore = StoreApi<GatewayModelAccessState>;
