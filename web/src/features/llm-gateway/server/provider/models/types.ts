type BaseModelCatalogEntry = {
  id: string;
  created?: number;
  ownedBy?: string;
  displayName?: string;
  createdAt?: string;
};

type AnthropicModelProjection = {
  capabilities: Record<string, unknown> | null;
  maxInputTokens: number | null;
  maxTokens: number | null;
};

export type GatewayModelCatalogEntry =
  | (BaseModelCatalogEntry & {
      provider: "OPENAI";
      shutdownDate?: string | null;
    })
  | (BaseModelCatalogEntry &
      AnthropicModelProjection & {
        provider: "OPENROUTER";
        shutdownDate?: string | null;
        nativeModel: Record<string, unknown>;
      })
  | (BaseModelCatalogEntry &
      AnthropicModelProjection & {
        provider: "ANTHROPIC";
      });

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
