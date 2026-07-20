import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
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

  if (
    apiMode === "chat-completions" &&
    isOpenAICompatibleEndpoint(processedBaseURL)
  ) {
    const provider = createOpenAICompatible({
      name: "openai",
      apiKey,
      baseURL: processedBaseURL,
      headers: extraHeaders,
      fetch: params.fetch,
      supportsStructuredOutputs: true,
    });

    return provider.languageModel(modelId);
  }

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

export function isOpenAICompatibleEndpoint(
  baseURL: string | null | undefined,
): baseURL is string {
  if (!baseURL) return false;

  try {
    const url = new URL(baseURL.replace("{model}", "model"));
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname) {
      return false;
    }

    const hostname = url.hostname;
    return hostname !== "api.openai.com";
  } catch {
    return false;
  }
}

/**
 * Translation of Langfuse `modelParams.providerOptions` to AI SDK OpenAI
 * provider options.
 *
 * Persisted provider options contain snake_case OpenAI request-body fields.
 * The AI SDK instead accepts a typed, camelCase whitelist under
 * `providerOptions.openai` and may silently drop unknown keys. Silent dropping
 * is unacceptable for first-party OpenAI, so the compatibility boundary rejects
 * unknown keys there. OpenAI-compatible endpoints can have provider-specific
 * option surfaces, so callers may opt into best-effort unknown-key passthrough.
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

const OPENAI_COMPATIBLE_PROVIDER_OPTION_KEY_MAP: Record<string, string> = {
  // Keep request-body fields in wire shape for the compatible provider. It
  // spreads unknown options directly into the body instead of using OpenAI's
  // stricter camelCase option schema.
  service_tier: "service_tier",
  parallel_tool_calls: "parallel_tool_calls",
  logit_bias: "logit_bias",
  max_completion_tokens: "max_completion_tokens",
  store: "store",
  user: "user",
  serviceTier: "service_tier",
  parallelToolCalls: "parallel_tool_calls",
  logitBias: "logit_bias",
  maxCompletionTokens: "max_completion_tokens",
  // These two are special compatible-provider options. Keeping them camelCase
  // lets the provider emit `reasoning_effort` and `verbosity` in the body.
  reasoning_effort: "reasoningEffort",
  reasoningEffort: "reasoningEffort",
  text_verbosity: "textVerbosity",
  verbosity: "textVerbosity",
  textVerbosity: "textVerbosity",
};

export function translateOpenAIProviderOptions(
  providerOptions: Record<string, unknown> | undefined,
  options?: {
    passthroughUnknown?: boolean;
    target?: "openai" | "openai-compatible";
  },
): TranslatedProviderOptions {
  if (!providerOptions || Object.keys(providerOptions).length === 0) {
    return { ok: true, value: undefined };
  }

  const keyMap =
    options?.target === "openai-compatible"
      ? OPENAI_COMPATIBLE_PROVIDER_OPTION_KEY_MAP
      : OPENAI_PROVIDER_OPTION_KEY_MAP;
  const translated: Record<string, unknown> = {};
  const unknownKeys: string[] = [];

  for (const [key, value] of Object.entries(providerOptions)) {
    if (key === "openai" && isPlainObject(value)) {
      for (const [nestedKey, nestedValue] of Object.entries(value)) {
        const mappedKey = keyMap[nestedKey] ?? nestedKey;
        translated[mappedKey] = nestedValue;
      }
      continue;
    }

    const mappedKey = keyMap[key];
    if (mappedKey === undefined) {
      if (options?.passthroughUnknown) {
        translated[key] = value;
      } else {
        unknownKeys.push(key);
      }
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
