import type {
  GatewayApiFamily,
  GatewayProvider,
} from "@/src/features/ai-gateway/types/gatewayProvider";
import { getBedrockModelApiFormats } from "@/src/features/ai-gateway/fns/getBedrockModelApiFormats";
import { isGeminiEmbeddingModel } from "@/src/features/ai-gateway/fns/isGeminiEmbeddingModel";
import type { GatewayApiFormat } from "@/src/features/ai-gateway/server/provider/registry";

const providerFormats = {
  OPENAI: ["OpenAI Responses", "OpenAI Chat Completions"],
  ANTHROPIC: ["Anthropic Messages"],
} as const satisfies Record<GatewayApiFamily, readonly string[]>;

const apiFormatLabels = {
  "openai.responses": "OpenAI Responses",
  "openai.chat-completions": "OpenAI Chat Completions",
  "openai.decisions": "OpenAI Decisions",
  "openai.embeddings": "OpenAI Embeddings",
  "anthropic.messages": "Anthropic Messages",
} as const satisfies Record<GatewayApiFormat, string>;

/** `reportedFormats` are the formats the provider's catalog lists the model for. */
export function getGatewayModelApiFormats(
  provider: GatewayProvider,
  modelId: string,
  reportedFormats?: readonly GatewayApiFormat[],
): ApiFormat[] {
  if (reportedFormats) {
    return reportedFormats.map((apiFormat) => apiFormatLabels[apiFormat]);
  }
  if (provider === "OPENROUTER" || provider === "VERCEL") {
    return [
      apiFormatLabels["openai.responses"],
      apiFormatLabels["openai.chat-completions"],
      apiFormatLabels["anthropic.messages"],
    ];
  }
  if (provider === "XAI") return [...providerFormats.OPENAI];
  // A deployment's name does not say which model it serves.
  if (provider === "AZURE") {
    return [
      apiFormatLabels["openai.responses"],
      apiFormatLabels["openai.chat-completions"],
      apiFormatLabels["openai.embeddings"],
      apiFormatLabels["anthropic.messages"],
    ];
  }
  if (provider === "GOOGLE_AI_STUDIO") {
    return [
      apiFormatLabels[
        isGeminiEmbeddingModel(modelId)
          ? "openai.embeddings"
          : "openai.chat-completions"
      ],
    ];
  }
  if (provider === "VERTEX")
    return [apiFormatLabels["openai.chat-completions"]];
  if (provider !== "BEDROCK") return [...providerFormats[provider]];
  return getBedrockModelApiFormats(modelId).map(
    (apiFormat) => apiFormatLabels[apiFormat],
  );
}

export type ApiFormat = (typeof apiFormatLabels)[GatewayApiFormat];

/** Every API format label, in display order. */
export const gatewayApiFormatLabels: readonly ApiFormat[] =
  Object.values(apiFormatLabels);
