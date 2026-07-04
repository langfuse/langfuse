import { OpenAIConfigSchema } from "../../../interfaces/customLLMProviderConfigSchemas";
import { LLMAdapter, type ModelParams, type TraceSinkParams } from "../types";
import type { AiSdkOpenAIApiMode } from "./types";
import { getUnsupportedOpenAIProviderOptionKeys } from "./providerOptionsTranslation";

export type LlmExecutionDecision =
  | {
      engine: "ai-sdk";
      adapter: "openai";
      apiMode: AiSdkOpenAIApiMode;
    }
  | {
      engine: "langchain-js";
      declineReason?:
        | "ai-sdk-adapter-not-enabled"
        | "ai-sdk-adapter-not-supported"
        | "ai-sdk-experiment-trace-sink"
        | "ai-sdk-untranslated-provider-options";
      declineDetail?: string;
    };

export function getOpenAIApiModeFromConfig(
  config: Record<string, string | boolean> | null | undefined,
): AiSdkOpenAIApiMode {
  const openAIConfig = OpenAIConfigSchema.parse(config ?? {});
  return openAIConfig.useResponsesApi ? "responses" : "chat-completions";
}

export function resolveLlmExecutionDecision(params: {
  modelParams: ModelParams;
  enabledAdapters: string[];
  traceSinkParams?: TraceSinkParams;
  connectionConfig?: Record<string, string | boolean> | null;
}): LlmExecutionDecision {
  const { modelParams, enabledAdapters, traceSinkParams, connectionConfig } =
    params;

  if (modelParams.adapter !== LLMAdapter.OpenAI) {
    return enabledAdapters.includes(modelParams.adapter)
      ? {
          engine: "langchain-js",
          declineReason: "ai-sdk-adapter-not-supported",
          declineDetail: modelParams.adapter,
        }
      : {
          engine: "langchain-js",
          declineReason: "ai-sdk-adapter-not-enabled",
          declineDetail: modelParams.adapter,
        };
  }

  const apiMode = getOpenAIApiModeFromConfig(connectionConfig);
  if (!isOpenAIEnabled(enabledAdapters, apiMode)) {
    return {
      engine: "langchain-js",
      declineReason: "ai-sdk-adapter-not-enabled",
      declineDetail: apiMode,
    };
  }

  if (traceSinkParams?.eventsWriter?.experimentContext) {
    return {
      engine: "langchain-js",
      declineReason: "ai-sdk-experiment-trace-sink",
    };
  }

  const unsupportedProviderOptionKeys = getUnsupportedOpenAIProviderOptionKeys(
    modelParams.providerOptions,
  );
  if (unsupportedProviderOptionKeys.length > 0) {
    return {
      engine: "langchain-js",
      declineReason: "ai-sdk-untranslated-provider-options",
      declineDetail: unsupportedProviderOptionKeys.join(","),
    };
  }

  return {
    engine: "ai-sdk",
    adapter: "openai",
    apiMode,
  };
}

function isOpenAIEnabled(
  enabledAdapters: string[],
  apiMode: AiSdkOpenAIApiMode,
): boolean {
  if (enabledAdapters.includes("openai")) return true;
  if (apiMode === "responses" && enabledAdapters.includes("openaiResponses")) {
    return true;
  }
  if (
    apiMode === "chat-completions" &&
    enabledAdapters.includes("openaiChatCompletions")
  ) {
    return true;
  }
  return false;
}
