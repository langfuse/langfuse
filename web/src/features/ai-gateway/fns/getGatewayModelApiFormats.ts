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
} as const satisfies Record<LabeledApiFormat, ApiFormat>;

export function getGatewayModelApiFormats(
  provider: GatewayProvider,
  modelId: string,
): ApiFormat[] {
  if (provider === "OPENROUTER" || provider === "VERCEL") {
    return Object.values(apiFormatLabels);
  }
  if (provider === "XAI") return [...providerFormats.OPENAI];
  if (provider !== "BEDROCK") return [...providerFormats[provider]];
  return getBedrockModelApiFormats(modelId)
    .filter(isLabeledApiFormat)
    .map((apiFormat) => apiFormatLabels[apiFormat]);
}

function isLabeledApiFormat(
  apiFormat: GatewayApiFormat,
): apiFormat is LabeledApiFormat {
  return apiFormat in apiFormatLabels;
}

type LabeledApiFormat = Exclude<
  GatewayApiFormat,
  "openai.decisions" | "openai.embeddings"
>;

export type ApiFormat = (typeof providerFormats)[GatewayApiFamily][number];
