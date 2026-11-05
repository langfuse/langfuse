import type { GatewayProviderName } from "@/src/features/ai-gateway/server/provider/registry";

export type GatewayModelCatalogEntry = {
  id: string;
  provider: GatewayProviderName;
  canonicalSlug: string;
  displayName: string;
  createdAt: string;
};

export type ModelDiscoveryError =
  | "unauthorized"
  // The credential authenticated but may not list models.
  | "forbidden"
  | "rate_limited"
  | "provider_error"
  | "timeout";

type ModelDiscoveryResult =
  | {
      success: true;
      models: GatewayModelCatalogEntry[];
      /** Epoch ms of the earliest scheduled shutdown among `models`, by which the catalog must be rediscovered. */
      expiresAt?: number;
    }
  | { success: false; error: ModelDiscoveryError };

export interface ModelDiscoveryAdapter {
  fetchCatalog(params: {
    credential: string;
    config: unknown;
    fetcher: typeof fetch;
  }): Promise<ModelDiscoveryResult>;
}
