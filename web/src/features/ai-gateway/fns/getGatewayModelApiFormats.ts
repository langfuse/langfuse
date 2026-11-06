import type {
  GatewayApiFamily,
  GatewayProvider,
} from "@/src/features/ai-gateway/types/gatewayProvider";
import { getBedrockModelApiFormats } from "@/src/features/ai-gateway/fns/getBedrockModelApiFormats";
import type { GatewayApiFormat } from "@/src/features/ai-gateway/server/provider/registry";

const providerFormats = {
  OPENAI: ["OpenAI Responses", "OpenAI Chat Completions"],
  ANTHROPIC: ["Anthropic Messages"],
} as const satisfies Record<GatewayApiFamily, readonly string[]>;

const apiFormatLabels = {
  "openai.responses": "OpenAI Responses",
  "openai.chat-completions": "OpenAI Chat Completions",
  "anthropic.messages": "Anthropic Messages",
} as const satisfies Record<GatewayApiFormat, ApiFormat>;

export function getGatewayModelApiFormats(
  provider: GatewayProvider,
  modelId: string,
): ApiFormat[] {
  if (provider !== "BEDROCK") return [...providerFormats[provider]];
  return getBedrockModelApiFormats(modelId).map(
    (apiFormat) => apiFormatLabels[apiFormat],
  );
}

export type ApiFormat = (typeof providerFormats)[GatewayApiFamily][number];
