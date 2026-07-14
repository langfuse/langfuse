import { getCurrentSpan } from "../../instrumentation";
import {
  BedrockConfigSchema,
  OpenAIConfigSchema,
  VertexAIConfigSchema,
} from "../../../interfaces/customLLMProviderConfigSchemas";
import type { LLMConnectionConfig } from "../../../interfaces/customLLMProviderConfigSchemas";
import { logger } from "../../logger";
import { LLMAdapter, type ModelParams } from "../types";
import { translateAnthropicProviderOptions } from "./providers/anthropic";
import { translateAzureBaseURL } from "./providers/azure";
import { translateBedrockProviderOptions } from "./providers/bedrock";
import { translateGoogleProviderOptions } from "./providers/google";
import {
  translateOpenAIProviderOptions,
  type OpenAIApiMode,
} from "./providers/openai";
import type { TranslatedProviderOptions } from "./providers/types";
import {
  assertValidAnthropicVertexModelName,
  assertValidVertexLocation,
  isClaudeModel,
} from "./providers/vertex";

export type AiSdkEngineDecision = {
  engine: "ai-sdk";
  adapter: LLMAdapter;
  /** Key under `providerOptions` the AI SDK model reads its options from. */
  providerOptionsName: string;
  translatedProviderOptions?: Record<string, unknown>;
  /** Only set for the OpenAI adapter. */
  openAIApiMode?: OpenAIApiMode;
};

export type LlmExecutionDecision =
  | AiSdkEngineDecision
  | {
      engine: "langchain-js";
    };

const LANGCHAIN_DECISION = { engine: "langchain-js" } as const;

/**
 * Decides which execution engine handles an LLM completion. AI SDK is only
 * selected when the adapter is rolled out via
 * `LANGFUSE_LLM_COMPLETION_AI_SDK_ADAPTERS` (values are `LLMAdapter` enum
 * strings) AND the call has no requirement the AI SDK path cannot honor yet.
 * Every decline for a rolled-out adapter carries a reason for observability.
 *
 * Declines also cover config shapes the LangChain path rejects with its
 * canonical errors (invalid Vertex locations, malformed Bedrock config, ...)
 * so misconfigurations keep surfacing identically.
 */
export function resolveLlmExecutionDecision(params: {
  modelParams: ModelParams;
  llmConnectionConfig?: LLMConnectionConfig | null;
  baseURL?: string | null;
  shouldUseLangfuseAPIKey?: boolean;
  enabledAdapters: readonly string[];
}): LlmExecutionDecision {
  const {
    modelParams,
    llmConnectionConfig,
    baseURL,
    shouldUseLangfuseAPIKey,
    enabledAdapters,
  } = params;
  const { adapter, model, providerOptions } = modelParams;

  if (!enabledAdapters.includes(adapter)) {
    return LANGCHAIN_DECISION;
  }

  const decline = (reason: string): typeof LANGCHAIN_DECISION => {
    logger.warn(`AI SDK engine declined for adapter ${adapter}: ${reason}`);
    return LANGCHAIN_DECISION;
  };
  const declineForOptions = (
    translated: Extract<TranslatedProviderOptions, { ok: false }>,
  ) =>
    decline(
      `cannot translate provider options: ${translated.unknownKeys.join(",")}`,
    );

  switch (adapter) {
    case LLMAdapter.OpenAI: {
      const translated = translateOpenAIProviderOptions(providerOptions);
      if (!translated.ok) return declineForOptions(translated);

      const openAIConfig = OpenAIConfigSchema.parse(llmConnectionConfig ?? {});

      return {
        engine: "ai-sdk",
        adapter,
        providerOptionsName: "openai",
        translatedProviderOptions: translated.value,
        // Chat Completions stays the default: flipping to the Responses API
        // would break OpenAI-compatible proxies configured via custom baseURL.
        openAIApiMode: openAIConfig.useResponsesApi
          ? "responses"
          : "chat-completions",
      };
    }

    case LLMAdapter.Azure: {
      const baseUrlTranslation = translateAzureBaseURL(baseURL);
      if (!baseUrlTranslation.ok) return decline(baseUrlTranslation.reason);

      // Azure deployments speak the OpenAI Chat Completions body, so provider
      // options share the OpenAI translation (namespaced under `azure`).
      const translated = translateOpenAIProviderOptions(providerOptions);
      if (!translated.ok) return declineForOptions(translated);

      return {
        engine: "ai-sdk",
        adapter,
        providerOptionsName: "azure",
        translatedProviderOptions: translated.value,
      };
    }

    case LLMAdapter.Anthropic: {
      const translated = translateAnthropicProviderOptions(providerOptions);
      if (!translated.ok) return declineForOptions(translated);

      return {
        engine: "ai-sdk",
        adapter,
        providerOptionsName: "anthropic",
        translatedProviderOptions: translated.value,
      };
    }

    case LLMAdapter.Bedrock: {
      if (
        !shouldUseLangfuseAPIKey &&
        !BedrockConfigSchema.safeParse(llmConnectionConfig).success
      ) {
        return decline("missing or invalid Bedrock region config");
      }

      const translated = translateBedrockProviderOptions(providerOptions);
      if (!translated.ok) return declineForOptions(translated);

      return {
        engine: "ai-sdk",
        adapter,
        providerOptionsName: "bedrock",
        translatedProviderOptions: translated.value,
      };
    }

    case LLMAdapter.GoogleAIStudio: {
      // Note: `maxReasoningTokens` is intentionally not passed — the LangChain
      // engine only forwards it for Vertex AI.
      const translated = translateGoogleProviderOptions({
        providerOptions,
        model,
      });
      if (!translated.ok) return declineForOptions(translated);

      return {
        engine: "ai-sdk",
        adapter,
        providerOptionsName: "google",
        translatedProviderOptions: translated.value,
      };
    }

    case LLMAdapter.VertexAI: {
      const parsedConfig = llmConnectionConfig
        ? VertexAIConfigSchema.safeParse(llmConnectionConfig)
        : undefined;
      if (parsedConfig && !parsedConfig.success) {
        return decline("invalid Vertex AI config");
      }
      try {
        assertValidVertexLocation(parsedConfig?.data.location);
        if (isClaudeModel(model)) assertValidAnthropicVertexModelName(model);
      } catch (e) {
        return decline(e instanceof Error ? e.message : String(e));
      }

      const translated = isClaudeModel(model)
        ? translateAnthropicProviderOptions(providerOptions, {
            dropModelOverride: true,
          })
        : translateGoogleProviderOptions({
            providerOptions,
            model,
            maxReasoningTokens: modelParams.maxReasoningTokens,
          });
      if (!translated.ok) return declineForOptions(translated);

      return {
        engine: "ai-sdk",
        adapter,
        providerOptionsName: isClaudeModel(model) ? "anthropic" : "google",
        translatedProviderOptions: translated.value,
      };
    }

    default: {
      const _exhaustiveCheck: never = adapter;
      logger.warn(`Unknown adapter for engine dispatch: ${_exhaustiveCheck}`);
      return LANGCHAIN_DECISION;
    }
  }
}

/**
 * Records the execution-engine decision on the current active span (e.g. the
 * worker's `eval.call-llm` span), so engine rollout can be sliced in
 * observability tooling without re-deriving the decision at call sites.
 */
export function recordLlmExecutionDecision(
  decision: LlmExecutionDecision,
): void {
  const span = getCurrentSpan();
  if (!span) return;

  span.setAttribute("langfuse.llm.execution_engine", decision.engine);

  if (decision.engine === "ai-sdk") {
    span.setAttribute("langfuse.llm.ai_sdk.adapter", decision.adapter);
    if (decision.openAIApiMode) {
      span.setAttribute("langfuse.llm.openai.api_mode", decision.openAIApiMode);
    }
  }
}
