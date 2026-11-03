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
  | {
      success: false;
      error: ModelDiscoveryError;
      /** The host answered successfully but its `/models` body is not a
       * catalog: not JSON, or not the expected shape. */
      invalidBody?: true;
    };

export interface ModelDiscoveryAdapter {
  fetchCatalog(params: {
    credential: string;
    /** Registry origin for fixed providers; the connection origin for CUSTOM. */
    baseUrl?: string;
    fetcher: typeof fetch;
  }): Promise<ModelDiscoveryResult>;
}
