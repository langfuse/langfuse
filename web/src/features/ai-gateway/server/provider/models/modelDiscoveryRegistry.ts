import type { GatewayProviderName } from "@/src/features/ai-gateway/server/provider/registry";
import { anthropicModelDiscoveryAdapter } from "./adapters/anthropic";
import { openAiModelDiscoveryAdapter } from "./adapters/openAi";
import type { ModelDiscoveryAdapter } from "./types";

export type { GatewayModelCatalogEntry, ModelDiscoveryError } from "./types";

const MODEL_DISCOVERY_ADAPTERS: Record<
  GatewayProviderName,
  ModelDiscoveryAdapter
> = {
  OPENAI: openAiModelDiscoveryAdapter,
  ANTHROPIC: anthropicModelDiscoveryAdapter,
};

export function getModelDiscoveryAdapter(provider: GatewayProviderName) {
  return MODEL_DISCOVERY_ADAPTERS[provider];
}
