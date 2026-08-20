import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

import type { TranslatedProviderOptions } from "./types";
import { isPlainObject } from "./utils";

/**
 * Default base URL for the OrcaRouter adapter. OrcaRouter is an
 * OpenAI-compatible chat gateway; when a connection does not set a custom
 * base URL, Langfuse points at this endpoint and sends requests through
 * `POST /v1/chat/completions`.
 */
export const ORCAROUTER_DEFAULT_BASE_URL = "https://api.orcarouter.ai/v1";

/**
 * Translation of Langfuse `modelParams.providerOptions` to AI SDK OpenAI
 * provider options for the OrcaRouter adapter. OrcaRouter follows the
 * OpenAI-compatible wire format, so this mirrors the compatible-provider
 * translation in `openai.ts` (wire-shaped snake_case keys, unknown-key
 * passthrough for gateway-specific surfaces).
 */
const ORCAROUTER_PROVIDER_OPTION_KEY_MAP: Record<string, string> = {
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
  reasoning_effort: "reasoningEffort",
  reasoningEffort: "reasoningEffort",
  text_verbosity: "textVerbosity",
  verbosity: "textVerbosity",
  textVerbosity: "textVerbosity",
};

export function buildOrcaRouterModel(params: {
  modelId: string;
  apiKey: string;
  baseURL?: string | null;
  extraHeaders?: Record<string, string>;
  fetch: typeof fetch;
}): LanguageModel {
  const { apiKey, baseURL, extraHeaders, modelId } = params;

  const provider = createOpenAICompatible({
    name: "orcarouter",
    apiKey,
    baseURL: baseURL?.length ? baseURL : ORCAROUTER_DEFAULT_BASE_URL,
    headers: extraHeaders,
    fetch: params.fetch,
    supportsStructuredOutputs: true,
  });

  return provider.languageModel(modelId);
}

export function isOrcaRouterEndpoint(
  baseURL: string | null | undefined,
): baseURL is string {
  if (!baseURL) return false;

  try {
    const url = new URL(baseURL.replace("{model}", "model"));
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname) {
      return false;
    }

    const hostname = url.hostname.replace(/\.$/, "");
    return hostname === "api.orcarouter.ai";
  } catch {
    return false;
  }
}

export function translateOrcaRouterProviderOptions(
  providerOptions: Record<string, unknown> | undefined,
): TranslatedProviderOptions {
  if (!providerOptions || Object.keys(providerOptions).length === 0) {
    return { ok: true, value: undefined };
  }

  const translated: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(providerOptions)) {
    if (key === "openai" && isPlainObject(value)) {
      for (const [nestedKey, nestedValue] of Object.entries(value)) {
        const mappedKey = ORCAROUTER_PROVIDER_OPTION_KEY_MAP[nestedKey];
        // OrcaRouter is a gateway, so unknown per-provider options are
        // forwarded best-effort rather than rejected.
        translated[mappedKey ?? nestedKey] = nestedValue;
      }
      continue;
    }

    const mappedKey = ORCAROUTER_PROVIDER_OPTION_KEY_MAP[key];
    // Gateway-specific request-body keys are forwarded to the wire verbatim
    // (mirrors the OpenAI-compatible passthrough in `openai.ts`).
    if (mappedKey === undefined) {
      translated[key] = value;
      continue;
    }

    translated[mappedKey] = value;
  }

  return {
    ok: true,
    value: Object.keys(translated).length > 0 ? translated : undefined,
  };
}
