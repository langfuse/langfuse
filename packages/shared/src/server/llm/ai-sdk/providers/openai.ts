import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

import { processOpenAIBaseURL } from "../../utils";
import type { TranslatedProviderOptions } from "./types";
import { isPlainObject } from "./utils";

export type OpenAIApiMode = "responses" | "chat-completions";

export function buildOpenAIModel(params: {
  modelId: string;
  apiKey: string;
  baseURL?: string | null;
  extraHeaders?: Record<string, string>;
  apiMode: OpenAIApiMode;
  fetch: typeof fetch;
}): LanguageModel {
  const { apiKey, baseURL, extraHeaders, apiMode, modelId } = params;

  const processedBaseURL = processOpenAIBaseURL({
    url: baseURL,
    modelName: modelId,
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
    ? provider.responses(modelId)
    : provider.chat(modelId);
}

/**
 * Translation of Langfuse `modelParams.providerOptions` to AI SDK OpenAI
 * provider options.
 *
 * Persisted provider options contain snake_case OpenAI request-body fields.
 * The AI SDK instead accepts a typed, camelCase whitelist under
 * `providerOptions.openai` and silently drops unknown keys. Silent dropping is
 * unacceptable: the compatibility boundary rejects any key it cannot
 * translate.
 */
const OPENAI_PROVIDER_OPTION_KEY_MAP: Record<string, string> = {
  // snake_case persisted OpenAI request-body fields
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

export function translateOpenAIProviderOptions(
  providerOptions: Record<string, unknown> | undefined,
): TranslatedProviderOptions {
  if (!providerOptions || Object.keys(providerOptions).length === 0) {
    return { ok: true, value: undefined };
  }

  const translated: Record<string, unknown> = {};
  const unknownKeys: string[] = [];

  for (const [key, value] of Object.entries(providerOptions)) {
    if (key === "openai" && isPlainObject(value)) {
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
