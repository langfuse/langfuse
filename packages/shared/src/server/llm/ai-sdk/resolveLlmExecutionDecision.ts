import { getCurrentSpan } from "../../instrumentation";
import { OpenAIConfigSchema } from "../../../interfaces/customLLMProviderConfigSchemas";
import type { LLMConnectionConfig } from "../../../interfaces/customLLMProviderConfigSchemas";
import { LLMAdapter, type TraceSinkParams } from "../types";
import {
  translateOpenAIProviderOptions,
  type OpenAIApiMode,
} from "./providers/openai";

export type LlmExecutionDecision =
  | {
      engine: "ai-sdk";
      aiSdkAdapter: "openai";
      openAIApiMode: OpenAIApiMode;
      translatedProviderOptions?: Record<string, unknown>;
    }
  | {
      engine: "langchain-js";
      declineReason?: string;
    };

/**
 * Decides which execution engine handles an LLM completion. AI SDK is only
 * selected when the adapter is rolled out via
 * `LANGFUSE_LLM_COMPLETION_AI_SDK_ADAPTERS` AND the call has no requirement
 * the AI SDK path cannot honor yet. Every decline for a rolled-out adapter
 * carries a reason for observability.
 */
export function resolveLlmExecutionDecision(params: {
  adapter: LLMAdapter;
  providerOptions?: Record<string, unknown>;
  llmConnectionConfig?: LLMConnectionConfig | null;
  traceSinkParams?: TraceSinkParams;
  enabledAdapters: readonly string[];
}): LlmExecutionDecision {
  const {
    adapter,
    providerOptions,
    llmConnectionConfig,
    traceSinkParams,
    enabledAdapters,
  } = params;

  if (adapter !== LLMAdapter.OpenAI || !enabledAdapters.includes("openai")) {
    return { engine: "langchain-js" };
  }

  // Experiments consume the root event record synchronously
  // (onRootEventRecordReady) to schedule evals on internal traces, which the
  // langfuse-prefixed environment excludes from regular eval triggering. The
  // async OTel ingestion queue cannot provide that, so experiments stay on
  // LangChain.
  if (traceSinkParams?.eventsWriter?.experimentContext) {
    return {
      engine: "langchain-js",
      declineReason: "sync-root-event-consumer",
    };
  }

  const translated = translateOpenAIProviderOptions(providerOptions);
  if (!translated.ok) {
    return {
      engine: "langchain-js",
      declineReason: `untranslated-provider-options:${translated.unknownKeys.join(",")}`,
    };
  }

  const openAIConfig = OpenAIConfigSchema.parse(llmConnectionConfig ?? {});

  return {
    engine: "ai-sdk",
    aiSdkAdapter: "openai",
    // Chat Completions stays the default: flipping to the Responses API would
    // break OpenAI-compatible proxies configured via custom baseURL.
    openAIApiMode: openAIConfig.useResponsesApi
      ? "responses"
      : "chat-completions",
    translatedProviderOptions: translated.value,
  };
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
    span.setAttribute("langfuse.llm.ai_sdk.adapter", decision.aiSdkAdapter);
    span.setAttribute("langfuse.llm.openai.api_mode", decision.openAIApiMode);
  } else if (decision.declineReason) {
    span.setAttribute(
      "langfuse.llm.execution_decline_reason",
      decision.declineReason,
    );
  }
}
