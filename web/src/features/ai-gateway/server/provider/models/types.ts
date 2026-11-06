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
  | {
      success: true;
      models: GatewayModelCatalogEntry[];
      /** Epoch ms of the earliest scheduled shutdown among `models`, by which the catalog must be rediscovered. */
      expiresAt?: number;
      /** The credential may call models but not list some or all of them. */
      modelListingDenied?: boolean;
    }
  | { success: false; error: ModelDiscoveryError };

export interface ModelDiscoveryAdapter {
  fetchCatalog(params: {
    credential: string;
    config: unknown;
    /** A custom base URL replacing the official one; Bedrock ignores it. */
    baseURL: string | null;
    extraHeaders: Record<string, string>;
    fetcher: typeof fetch;
  }): Promise<ModelDiscoveryResult>;
}
