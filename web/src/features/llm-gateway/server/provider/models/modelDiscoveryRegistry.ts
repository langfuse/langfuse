import type { GatewayProviderName } from "@/src/features/llm-gateway/server/provider/registry";
import { anthropicModelDiscoveryAdapter } from "./adapters/anthropic";
import { openAiModelDiscoveryAdapter } from "./adapters/openAi";
import { openRouterModelDiscoveryAdapter } from "./adapters/openRouter";
import type { ModelDiscoveryAdapter } from "./types";

export type { GatewayModelCatalogEntry, ModelDiscoveryError } from "./types";

const MODEL_DISCOVERY_ADAPTERS: Record<
  GatewayProviderName,
  ModelDiscoveryAdapter
> = {
  OPENAI: openAiModelDiscoveryAdapter,
  OPENROUTER: openRouterModelDiscoveryAdapter,
  ANTHROPIC: anthropicModelDiscoveryAdapter,
};

export function getModelDiscoveryAdapter(provider: GatewayProviderName) {
  return MODEL_DISCOVERY_ADAPTERS[provider];
}
