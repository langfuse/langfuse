import type { EmbeddingModel, LanguageModel } from "ai";

import type { LLMConnectionConfig } from "../../../../interfaces/customLLMProviderConfigSchemas";
import { LLMAdapter } from "../../types";
import type { AiSdkModelConfig } from "../resolveAiSdkModelConfig";
import { buildAnthropicModel } from "./anthropic";
import { buildAzureEmbeddingModel, buildAzureModel } from "./azure";
import { buildBedrockEmbeddingModel, buildBedrockModel } from "./bedrock";
import {
  buildGoogleAIStudioEmbeddingModel,
  buildGoogleAIStudioModel,
} from "./google";
import { buildOpenAIEmbeddingModel, buildOpenAIModel } from "./openai";
import type { LLMCredentialSource } from "./types";
import {
  buildVertexEmbeddingModel,
  buildVertexModel,
  isClaudeModel,
} from "./vertex";

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
        credentialSource,
        fetch: createFetch(
          isClaudeModel(model.id)
            ? "Anthropic Vertex AI endpoint"
            : "Vertex AI LLM endpoint",
          [VERTEX_AI_AUTH_HEADER],
        ),
      });

    case LLMAdapter.TypeSafe:
      throw new Error(
        "TypeSafe decision models cannot generate text; use a decision-model evaluator",
      );

    default: {
      const _exhaustiveCheck: never = model.adapter;
      throw new Error(`AI SDK adapter is not supported: ${_exhaustiveCheck}`);
    }
  }
}

/**
 * Builds the AI SDK `EmbeddingModel` for a persisted connection. Anthropic and
 * TypeSafe have no embeddings API.
 */
export async function buildAiSdkEmbeddingModel(params: {
  model: { adapter: LLMAdapter; id: string };
  apiKey: string;
  baseURL?: string | null;
  extraHeaders?: Record<string, string>;
  config?: LLMConnectionConfig | null;
  credentialSource: LLMCredentialSource;
  createFetch: CreateSecureFetch;
}): Promise<EmbeddingModel> {
  const { model, apiKey, baseURL, extraHeaders, config, credentialSource } =
    params;

  switch (model.adapter) {
    case LLMAdapter.OpenAI:
      return buildOpenAIEmbeddingModel({
        modelId: model.id,
        apiKey,
        baseURL,
        extraHeaders,
        fetch: params.createFetch("OpenAI LLM base URL"),
      });

    case LLMAdapter.Azure:
      return buildAzureEmbeddingModel({
        modelId: model.id,
        apiKey,
        baseURL,
        extraHeaders,
        fetch: params.createFetch("Azure OpenAI LLM base URL", [
          AZURE_OPENAI_API_KEY_HEADER,
        ]),
      });

    case LLMAdapter.Bedrock:
      return buildBedrockEmbeddingModel({
        modelId: model.id,
        apiKey,
        config,
        credentialSource,
      });

    case LLMAdapter.GoogleAIStudio:
      return buildGoogleAIStudioEmbeddingModel({
        modelId: model.id,
        apiKey,
        baseURL,
        fetch: params.createFetch("Google AI Studio LLM base URL", [
          GOOGLE_API_KEY_HEADER,
        ]),
      });

    case LLMAdapter.VertexAI:
      return buildVertexEmbeddingModel({
        modelId: model.id,
        apiKey,
        config,
        extraHeaders,
        credentialSource,
        fetch: params.createFetch("Vertex AI LLM endpoint", [
          VERTEX_AI_AUTH_HEADER,
        ]),
      });

    case LLMAdapter.Anthropic:
    case LLMAdapter.TypeSafe:
      throw new Error(`${model.adapter} connections do not support embeddings`);

    default: {
      const _exhaustiveCheck: never = model.adapter;
      throw new Error(`AI SDK adapter is not supported: ${_exhaustiveCheck}`);
    }
  }
}
