import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";

import type { ModelParams } from "../../types";
import type { TranslatedProviderOptions } from "./types";
import { ensureBaseURLSuffix, isPlainObject } from "./utils";

/**
 * LangChain's `anthropicApiUrl` is the API origin — the underlying
 * @anthropic-ai/sdk appends `/v1/messages` itself. The AI SDK instead expects
 * the `/v1` prefix to be part of `baseURL` (default
 * `https://api.anthropic.com/v1`) and appends only `/messages`.
 */
export function toAnthropicBaseURL(
  baseURL: string | null | undefined,
): string | undefined {
  return ensureBaseURLSuffix(baseURL, "/v1");
}

export function buildAnthropicModel(params: {
  modelParams: ModelParams;
  apiKey: string;
  baseURL?: string | null;
  extraHeaders?: Record<string, string>;
  fetch: typeof fetch;
}): LanguageModel {
  const provider = createAnthropic({
    apiKey: params.apiKey,
    baseURL: toAnthropicBaseURL(params.baseURL),
    headers: params.extraHeaders,
    fetch: params.fetch,
  });

  return provider(params.modelParams.model);
}

// Keys the AI SDK Anthropic provider accepts verbatim (camelCase, already
// AI SDK-shaped). `thinking` and `metadata` are handled separately because
// their nested fields need snake_case translation.
const ANTHROPIC_PASSTHROUGH_KEYS = new Set([
  "sendReasoning",
  "disableParallelToolUse",
  "structuredOutputMode",
  "effort",
  "speed",
]);

const ANTHROPIC_THINKING_TYPES = new Set(["adaptive", "enabled", "disabled"]);

/**
 * Translation of Langfuse `modelParams.providerOptions` to AI SDK Anthropic
 * provider options.
 *
 * The LangChain engine merges `providerOptions` verbatim into the Anthropic
 * request body (`invocationKwargs`), so users configured snake_case Anthropic
 * body params — most importantly `thinking: { type, budget_tokens }`. The AI
 * SDK accepts a typed camelCase whitelist under `providerOptions.anthropic`
 * and silently drops unknown keys; any key we cannot translate makes the
 * dispatcher decline to LangChain instead.
 *
 * Note the Claude Fable/Mythos guard from the LangChain path is unnecessary
 * here: the AI SDK only serializes `thinking` when it is explicitly enabled
 * or adaptive, so an omitted config never sends `{ type: "disabled" }`.
 */
export function translateAnthropicProviderOptions(
  providerOptions: Record<string, unknown> | undefined,
  options?: {
    /**
     * The LangChain Vertex-Claude path silently strips a `model` override from
     * `invocationKwargs`; mirror that instead of declining.
     */
    dropModelOverride?: boolean;
  },
): TranslatedProviderOptions {
  if (!providerOptions || Object.keys(providerOptions).length === 0) {
    return { ok: true, value: undefined };
  }

  const translated: Record<string, unknown> = {};
  const unknownKeys: string[] = [];

  for (const [key, value] of Object.entries(providerOptions)) {
    if (key === "anthropic" && isPlainObject(value)) {
      // Nested `anthropic` object is treated as already AI SDK-shaped.
      Object.assign(translated, value);
      continue;
    }

    if (key === "model" && options?.dropModelOverride) {
      continue;
    }

    if (key === "thinking") {
      const thinking = translateAnthropicThinking(value);
      if (!thinking.ok) {
        unknownKeys.push(key);
        continue;
      }
      translated.thinking = thinking.value;
      continue;
    }

    if (key === "metadata") {
      const metadata = translateAnthropicMetadata(value);
      if (!metadata.ok) {
        unknownKeys.push(key);
        continue;
      }
      translated.metadata = metadata.value;
      continue;
    }

    if (ANTHROPIC_PASSTHROUGH_KEYS.has(key)) {
      translated[key] = value;
      continue;
    }

    unknownKeys.push(key);
  }

  if (unknownKeys.length > 0) {
    return { ok: false, unknownKeys };
  }

  return {
    ok: true,
    value: Object.keys(translated).length > 0 ? translated : undefined,
  };
}

function translateAnthropicThinking(
  value: unknown,
): { ok: true; value: Record<string, unknown> } | { ok: false } {
  if (typeof value !== "object" || value === null) return { ok: false };

  const {
    type,
    budget_tokens: budgetTokensSnake,
    budgetTokens: budgetTokensCamel,
    display,
    ...rest
  } = value as Record<string, unknown>;

  if (Object.keys(rest).length > 0) return { ok: false };
  if (typeof type !== "string" || !ANTHROPIC_THINKING_TYPES.has(type)) {
    return { ok: false };
  }

  const budgetTokens = budgetTokensCamel ?? budgetTokensSnake;

  return {
    ok: true,
    value: {
      type,
      ...(budgetTokens !== undefined ? { budgetTokens } : {}),
      ...(display !== undefined ? { display } : {}),
    },
  };
}

function translateAnthropicMetadata(
  value: unknown,
): { ok: true; value: Record<string, unknown> } | { ok: false } {
  if (typeof value !== "object" || value === null) return { ok: false };

  const {
    user_id: userIdSnake,
    userId: userIdCamel,
    ...rest
  } = value as Record<string, unknown>;

  if (Object.keys(rest).length > 0) return { ok: false };

  const userId = userIdCamel ?? userIdSnake;

  return {
    ok: true,
    value: userId !== undefined ? { userId } : {},
  };
}
