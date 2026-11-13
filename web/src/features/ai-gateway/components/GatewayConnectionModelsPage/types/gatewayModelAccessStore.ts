import type { StoreApi } from "zustand/vanilla";

export type GatewayModelAccessState = {
  /** Last allowed models confirmed by the server; `null` allows every model. */
  allowedModels: Set<string> | null;
  /** Latest toggle per model that the server has not confirmed yet. */
  optimisticEnabled: Record<string, boolean>;
  /** Unsettled saves per model; the optimistic value is kept until all settle. */
  pendingSaves: Record<string, number>;
  actions: {
    setAllowedModels: (allowedModels: string[] | null) => void;
    setOptimisticEnabled: (model: string, enabled: boolean) => void;
    settleOptimisticEnabled: (model: string) => void;
  };
};

export type GatewayModelAccessStore = StoreApi<GatewayModelAccessState>;
