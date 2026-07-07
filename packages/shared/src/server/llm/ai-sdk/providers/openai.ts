import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

import type { ModelParams } from "../../types";
import { processOpenAIBaseURL } from "../../utils";

export type OpenAIApiMode = "responses" | "chat-completions";

export function buildOpenAIModel(params: {
  modelParams: ModelParams;
  apiKey: string;
  baseURL?: string | null;
  extraHeaders?: Record<string, string>;
  apiMode: OpenAIApiMode;
  fetch: typeof fetch;
}): LanguageModel {
  const { apiKey, baseURL, extraHeaders, apiMode, modelParams } = params;

  const processedBaseURL = processOpenAIBaseURL({
    url: baseURL,
    modelName: modelParams.model,
  });

  const provider = createOpenAI({
    apiKey,
    baseURL: processedBaseURL ?? undefined,
    headers: extraHeaders,
    fetch: params.fetch,
  });

  // Chat Completions is the default; the Responses API is opt-in via the
  // connection's useResponsesApi config. The provider maps maxOutputTokens to
  // max_completion_tokens for reasoning models (o*/gpt-5*) on its own.
  return apiMode === "responses"
    ? provider.responses(modelParams.model)
    : provider.chat(modelParams.model);
}

/**
 * Translation of Langfuse `modelParams.providerOptions` to AI SDK OpenAI
 * provider options.
 *
 * The LangChain engine merges `providerOptions` verbatim into the request body
 * (`modelKwargs`), so users configured snake_case OpenAI body params. The AI
 * SDK instead accepts a typed, camelCase whitelist under
 * `providerOptions.openai` and silently drops unknown keys. Silent dropping is
 * unacceptable: any key we cannot translate makes the dispatcher decline to
 * LangChain (with a recorded reason) instead.
 */
const OPENAI_PROVIDER_OPTION_KEY_MAP: Record<string, string> = {
  // snake_case (OpenAI request body, as used with LangChain modelKwargs)
  reasoning_effort: "reasoningEffort",
  service_tier: "serviceTier",
  parallel_tool_calls: "parallelToolCalls",
  logit_bias: "logitBias",
  max_completion_tokens: "maxCompletionTokens",
  text_verbosity: "textVerbosity",
  verbosity: "textVerbosity",
  store: "store",
  user: "user",
  // camelCase (already AI SDK-shaped)
  reasoningEffort: "reasoningEffort",
  serviceTier: "serviceTier",
  parallelToolCalls: "parallelToolCalls",
  logitBias: "logitBias",
  maxCompletionTokens: "maxCompletionTokens",
  textVerbosity: "textVerbosity",
};

export type TranslatedProviderOptions =
  | { ok: true; value: Record<string, unknown> | undefined }
  | { ok: false; unknownKeys: string[] };

export function translateOpenAIProviderOptions(
  providerOptions: Record<string, unknown> | undefined,
): TranslatedProviderOptions {
  if (!providerOptions || Object.keys(providerOptions).length === 0) {
    return { ok: true, value: undefined };
  }

  const translated: Record<string, unknown> = {};
  const unknownKeys: string[] = [];

  for (const [key, value] of Object.entries(providerOptions)) {
    if (key === "openai" && typeof value === "object" && value !== null) {
      // Nested `openai` object is treated as already AI SDK-shaped.
      Object.assign(translated, value);
      continue;
    }

    const mappedKey = OPENAI_PROVIDER_OPTION_KEY_MAP[key];
    if (mappedKey === undefined) {
      unknownKeys.push(key);
      continue;
    }

    translated[mappedKey] = value;
  }

  if (unknownKeys.length > 0) {
    return { ok: false, unknownKeys };
  }

  return {
    ok: true,
    value: Object.keys(translated).length > 0 ? translated : undefined,
  };
}
