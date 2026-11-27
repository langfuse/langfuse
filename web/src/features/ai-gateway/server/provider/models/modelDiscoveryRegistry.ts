import type { GatewayProviderName } from "@/src/features/ai-gateway/server/provider/registry";
import { anthropicModelDiscoveryAdapter } from "./adapters/anthropic";
import { azureModelDiscoveryAdapter } from "./adapters/azure";
import { bedrockModelDiscoveryAdapter } from "./adapters/bedrock";
import { googleAiStudioModelDiscoveryAdapter } from "./adapters/googleAiStudio";
import { openAiModelDiscoveryAdapter } from "./adapters/openAi";
import { openRouterModelDiscoveryAdapter } from "./adapters/openRouter";
import { vercelModelDiscoveryAdapter } from "./adapters/vercel";
import { vertexModelDiscoveryAdapter } from "./adapters/vertex";
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
  AZURE: azureModelDiscoveryAdapter,
  GOOGLE_AI_STUDIO: googleAiStudioModelDiscoveryAdapter,
  VERTEX: vertexModelDiscoveryAdapter,
};

export function getModelDiscoveryAdapter(provider: GatewayProviderName) {
  return MODEL_DISCOVERY_ADAPTERS[provider];
}
