import type { LanguageModel } from "ai";

import type { LLMConnectionConfig } from "../../../../interfaces/customLLMProviderConfigSchemas";
import { LLMAdapter } from "../../types";
import type { AiSdkModelConfig } from "../resolveAiSdkModelConfig";
import { buildAnthropicModel } from "./anthropic";
import { buildAzureModel } from "./azure";
import { buildBedrockModel } from "./bedrock";
import { buildGoogleAIStudioModel } from "./google";
import { buildOpenAIModel } from "./openai";
import type { LLMCredentialSource } from "./types";
import { buildVertexModel, isClaudeModel } from "./vertex";

const AZURE_OPENAI_API_KEY_HEADER = "api-key";
const ANTHROPIC_API_KEY_HEADER = "x-api-key";
const GOOGLE_API_KEY_HEADER = "X-Goog-Api-Key";
const VERTEX_AI_AUTH_HEADER = "authorization";

/**
 * Factory for the secure LLM fetch (outbound URL validation, redirect
 * handling, proxy support) with a per-adapter log context and the adapter's
 * API-key header registered as sensitive.
 */
export type CreateSecureFetch = (
  logContext: string,
  additionalSensitiveHeaders?: string[],
) => typeof fetch;

/**
 * Builds the AI SDK `LanguageModel` for a completion. Credential parsing and
 * endpoint construction preserve the persisted connection contract; see the
 * per-provider modules for adapter-specific details.
 */
export async function buildAiSdkModel(params: {
  model: { adapter: LLMAdapter; id: string };
  modelConfig: AiSdkModelConfig;
  apiKey: string;
  baseURL?: string | null;
  extraHeaders?: Record<string, string>;
  config?: LLMConnectionConfig | null;
  credentialSource: LLMCredentialSource;
  createFetch: CreateSecureFetch;
}): Promise<LanguageModel> {
  const {
    model,
    modelConfig,
    apiKey,
    baseURL,
    extraHeaders,
    config,
    credentialSource,
    createFetch,
  } = params;

  switch (model.adapter) {
    case LLMAdapter.OpenAI:
      return buildOpenAIModel({
        modelId: model.id,
        apiKey,
        baseURL,
        extraHeaders,
        apiMode: modelConfig.openAIApiMode ?? "chat-completions",
        fetch: createFetch("OpenAI LLM base URL"),
      });

    case LLMAdapter.Azure:
      return buildAzureModel({
        modelId: model.id,
        apiKey,
        baseURL,
        extraHeaders,
        fetch: createFetch("Azure OpenAI LLM base URL", [
          AZURE_OPENAI_API_KEY_HEADER,
        ]),
      });

    case LLMAdapter.Anthropic:
      return buildAnthropicModel({
        modelId: model.id,
        apiKey,
        baseURL,
        extraHeaders,
        fetch: createFetch("Anthropic LLM base URL", [
          ANTHROPIC_API_KEY_HEADER,
        ]),
      });

    case LLMAdapter.Bedrock:
      return buildBedrockModel({
        modelId: model.id,
        apiKey,
        config,
        credentialSource,
      });

    case LLMAdapter.GoogleAIStudio:
      return buildGoogleAIStudioModel({
        modelId: model.id,
        apiKey,
        baseURL,
        fetch: createFetch("Google AI Studio LLM base URL", [
          GOOGLE_API_KEY_HEADER,
        ]),
      });

    case LLMAdapter.VertexAI:
      return buildVertexModel({
        modelId: model.id,
        apiKey,
        config,
        extraHeaders,
        fetch: createFetch(
          isClaudeModel(model.id)
            ? "Anthropic Vertex AI endpoint"
            : "Vertex AI LLM endpoint",
          [VERTEX_AI_AUTH_HEADER],
        ),
      });

    default: {
      const _exhaustiveCheck: never = model.adapter;
      throw new Error(`AI SDK adapter is not supported: ${_exhaustiveCheck}`);
    }
  }
}
