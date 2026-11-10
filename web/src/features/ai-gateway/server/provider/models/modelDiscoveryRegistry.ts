import type { GatewayProviderName } from "@/src/features/ai-gateway/server/provider/registry";
import { anthropicModelDiscoveryAdapter } from "./adapters/anthropic";
import { bedrockModelDiscoveryAdapter } from "./adapters/bedrock";
import { openAiModelDiscoveryAdapter } from "./adapters/openAi";
import { openRouterModelDiscoveryAdapter } from "./adapters/openRouter";
import { vercelModelDiscoveryAdapter } from "./adapters/vercel";
import { xaiModelDiscoveryAdapter } from "./adapters/xai";
import type { ModelDiscoveryAdapter } from "./types";

export type { GatewayModelCatalogEntry, ModelDiscoveryError } from "./types";

const MODEL_DISCOVERY_ADAPTERS: Record<
  GatewayProviderName,
  ModelDiscoveryAdapter
> = {
  OPENAI: openAiModelDiscoveryAdapter,
  ANTHROPIC: anthropicModelDiscoveryAdapter,
  BEDROCK: bedrockModelDiscoveryAdapter,
  OPENROUTER: openRouterModelDiscoveryAdapter,
  XAI: xaiModelDiscoveryAdapter,
  VERCEL: vercelModelDiscoveryAdapter,
};

export function getModelDiscoveryAdapter(provider: GatewayProviderName) {
  return MODEL_DISCOVERY_ADAPTERS[provider];
}
