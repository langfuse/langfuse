import { createOpenAI } from "@ai-sdk/openai";

import {
  LLMConnectionConfig,
  OpenAIConfigSchema,
} from "../../../../interfaces/customLLMProviderConfigSchemas";
import { processOpenAIBaseURL } from "../../openaiBaseUrl";
import type { ModelParams } from "../../types";
import { translateOpenAIProviderOptions } from "../providerOptionsTranslation";
import type { AiSdkModelResolution } from "./types";

export function resolveOpenAIModel(params: {
  apiKey: string;
  baseURL?: string | null;
  config?: LLMConnectionConfig | null;
  extraHeaders?: Record<string, string>;
  fetch: typeof globalThis.fetch;
  modelParams: ModelParams;
}): AiSdkModelResolution {
  const { apiKey, baseURL, config, extraHeaders, fetch, modelParams } = params;

  const openAIConfig = OpenAIConfigSchema.parse(config ?? {});
  const processedBaseURL = processOpenAIBaseURL({
    url: baseURL,
    modelName: modelParams.model,
  });
  const openai = createOpenAI({
    apiKey,
    baseURL: processedBaseURL ?? undefined,
    headers: extraHeaders,
    fetch,
  });
  const providerOptions = translateOpenAIProviderOptions(
    modelParams.providerOptions,
  );

  return {
    model: openAIConfig.useResponsesApi
      ? openai.responses(modelParams.model)
      : openai.chat(modelParams.model),
    providerOptions: providerOptions.providerOptions,
    callSettings: providerOptions.callSettings,
    metadata: {
      adapter: "openai",
      apiMode: openAIConfig.useResponsesApi ? "responses" : "chat-completions",
    },
  };
}
