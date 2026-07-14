import type { LanguageModel } from "ai";

import type { LLMConnectionConfig } from "../../../../interfaces/customLLMProviderConfigSchemas";
import { LLMAdapter, type ModelParams } from "../../types";
import type { AiSdkEngineDecision } from "../resolveLlmExecutionDecision";
import { buildAnthropicModel } from "./anthropic";
import { buildAzureModel } from "./azure";
import { buildBedrockModel } from "./bedrock";
import { buildGoogleAIStudioModel } from "./google";
import { buildOpenAIModel } from "./openai";
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
 * Builds the AI SDK `LanguageModel` for a dispatched completion. Credential
 * parsing and endpoint construction mirror the LangChain engine per adapter;
 * see the per-provider modules for the parity notes.
 */
export async function buildAiSdkModel(params: {
  decision: AiSdkEngineDecision;
  modelParams: ModelParams;
  apiKey: string;
  baseURL?: string | null;
  extraHeaders?: Record<string, string>;
  config?: LLMConnectionConfig | null;
  shouldUseLangfuseAPIKey: boolean;
  createFetch: CreateSecureFetch;
}): Promise<LanguageModel> {
  const {
    decision,
    modelParams,
    apiKey,
    baseURL,
    extraHeaders,
    config,
    shouldUseLangfuseAPIKey,
    createFetch,
  } = params;

  switch (decision.adapter) {
    case LLMAdapter.OpenAI:
      return buildOpenAIModel({
        modelParams,
        apiKey,
        baseURL,
        extraHeaders,
        apiMode: decision.openAIApiMode ?? "chat-completions",
        fetch: createFetch("OpenAI LLM base URL"),
      });

    case LLMAdapter.Azure:
      return buildAzureModel({
        modelParams,
        apiKey,
        baseURL,
        extraHeaders,
        fetch: createFetch("Azure OpenAI LLM base URL", [
          AZURE_OPENAI_API_KEY_HEADER,
        ]),
      });

    case LLMAdapter.Anthropic:
      return buildAnthropicModel({
        modelParams,
        apiKey,
        baseURL,
        extraHeaders,
        fetch: createFetch("Anthropic LLM base URL", [
          ANTHROPIC_API_KEY_HEADER,
        ]),
      });

    case LLMAdapter.Bedrock:
      return buildBedrockModel({
        modelParams,
        apiKey,
        config,
        shouldUseLangfuseAPIKey,
      });

    case LLMAdapter.GoogleAIStudio:
      return buildGoogleAIStudioModel({
        modelParams,
        apiKey,
        baseURL,
        fetch: createFetch("Google AI Studio LLM base URL", [
          GOOGLE_API_KEY_HEADER,
        ]),
      });

    case LLMAdapter.VertexAI:
      return buildVertexModel({
        modelParams,
        apiKey,
        config,
        extraHeaders,
        fetch: createFetch(
          isClaudeModel(modelParams.model)
            ? "Anthropic Vertex AI endpoint"
            : "Vertex AI LLM endpoint",
          [VERTEX_AI_AUTH_HEADER],
        ),
      });

    default: {
      const _exhaustiveCheck: never = decision.adapter;
      throw new Error(`AI SDK adapter is not supported: ${_exhaustiveCheck}`);
    }
  }
}
