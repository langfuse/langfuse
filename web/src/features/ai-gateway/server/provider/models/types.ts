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
  | "rate_limited"
  | "provider_error"
  | "timeout";

type ModelDiscoveryResult =
  | { success: true; models: GatewayModelCatalogEntry[] }
  | { success: false; error: ModelDiscoveryError };

export interface ModelDiscoveryAdapter {
  fetchCatalog(params: {
    credential: string;
    fetcher: typeof fetch;
  }): Promise<ModelDiscoveryResult>;
}
