import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";

import type { TranslatedProviderOptions } from "./types";
import { ensureBaseURLSuffix, isPlainObject } from "./utils";

/**
 * The stored Google AI Studio base URL is an origin-style prefix without the
 * generated `/v1beta/models/...` path. The AI SDK's `baseURL` includes the
 * version (default `https://generativelanguage.googleapis.com/v1beta`).
 */
export function toGoogleAIStudioBaseURL(
  baseURL: string | null | undefined,
): string | undefined {
  return ensureBaseURLSuffix(baseURL, "/v1beta");
}

export function buildGoogleAIStudioModel(params: {
  modelId: string;
  apiKey: string;
  baseURL?: string | null;
  fetch: typeof fetch;
}): LanguageModel {
  const provider = createGoogleGenerativeAI({
    apiKey: params.apiKey,
    baseURL: toGoogleAIStudioBaseURL(params.baseURL),
    fetch: params.fetch,
  });

  // Extra headers are intentionally not sent; only the API key header belongs
  // on this request path.
  return provider(params.modelId);
}

const GOOGLE_THINKING_LEVELS = new Set(["minimal", "low", "medium", "high"]);

/**
 * Translation of Langfuse `modelParams.providerOptions` (plus the Vertex-only
 * `modelParams.maxReasoningTokens`) to AI SDK Google provider options.
 *
 * Persisted Google options use a non-strict shape
 * ({ thinkingBudget?, thinkingLevel? }); unknown keys were never sent and are
 * intentionally stripped here, unlike adapters whose stored options are
 * request-body passthroughs.
 *
 * The compatibility mapper derives wire `thinkingConfig` from the model family:
 * `gemini-2.5*` gets `thinkingBudget`, everything else gets `thinkingLevel`,
 * converting between the two representations when needed. We mirror the
 * direct cases and reject the conversion cases (budget-only on a
 * level-family model or vice versa), since guessing a model-specific
 * conversion would silently drift.
 */
export function translateGoogleProviderOptions(params: {
  providerOptions: Record<string, unknown> | undefined;
  model: string;
  maxReasoningTokens?: number;
}): TranslatedProviderOptions {
  const { providerOptions, model, maxReasoningTokens } = params;

  const translated: Record<string, unknown> = {};

  const nested = providerOptions?.google;
  if (isPlainObject(nested)) {
    // Nested `google` object is treated as already AI SDK-shaped.
    Object.assign(translated, nested);
  }

  const rawThinkingBudget = providerOptions?.thinkingBudget;
  const rawThinkingLevel = providerOptions?.thinkingLevel;

  if (
    rawThinkingBudget !== undefined &&
    typeof rawThinkingBudget !== "number"
  ) {
    // The persisted schema rejected this shape; keep it a configuration error.
    return { ok: false, unknownKeys: ["thinkingBudget"] };
  }
  if (rawThinkingLevel !== undefined && typeof rawThinkingLevel !== "string") {
    return { ok: false, unknownKeys: ["thinkingLevel"] };
  }

  // Persisted precedence: maxReasoningTokens ?? thinkingBudget.
  const thinkingBudget = maxReasoningTokens ?? rawThinkingBudget;
  const thinkingLevel = rawThinkingLevel?.toLowerCase();

  if (thinkingBudget !== undefined || thinkingLevel !== undefined) {
    const thinkingConfig = buildThinkingConfig({
      model,
      thinkingBudget,
      thinkingLevel,
    });
    if (!thinkingConfig.ok) return thinkingConfig;

    translated.thinkingConfig = {
      ...(typeof translated.thinkingConfig === "object"
        ? translated.thinkingConfig
        : {}),
      ...thinkingConfig.value,
    };
  }

  return {
    ok: true,
    value: Object.keys(translated).length > 0 ? translated : undefined,
  };
}

function buildThinkingConfig(params: {
  model: string;
  thinkingBudget?: number;
  thinkingLevel?: string;
}):
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; unknownKeys: string[] } {
  const { model } = params;
  let { thinkingBudget, thinkingLevel } = params;

  if (model.startsWith("gemini-2.5")) {
    // Budget-family model. A lone thinkingLevel would require a model-specific
    // conversion table; reject instead of guessing.
    if (thinkingBudget === undefined) {
      return { ok: false, unknownKeys: ["thinkingLevel"] };
    }

    // Preserve the established request shape, quirks included:
    // `includeThoughts` is computed
    // BEFORE the 2.5-pro 128-token clamp (an explicit budget of 128 hides
    // thoughts while 1-127 gets clamped to 128 with thoughts visible), the
    // `>= 0` bound intentionally exempts negative budgets from clamping, and
    // negative budgets pass through to surface the same provider error.
    const includeThoughts = !(
      thinkingBudget === 0 ||
      (model.includes("pro") && thinkingBudget === 128)
    );
    if (
      model.startsWith("gemini-2.5-pro") &&
      thinkingBudget >= 0 &&
      thinkingBudget < 128
    ) {
      thinkingBudget = 128;
    }

    return {
      ok: true,
      value: { thinkingBudget, includeThoughts },
    };
  }

  // Level-family model (gemini-3 and newer).
  if (thinkingLevel === undefined) {
    return { ok: false, unknownKeys: ["thinkingBudget"] };
  }
  if (!GOOGLE_THINKING_LEVELS.has(thinkingLevel)) {
    return { ok: false, unknownKeys: ["thinkingLevel"] };
  }

  const includeThoughts = thinkingLevel !== "minimal";

  // Remap unsupported levels for the pro families.
  if (model.startsWith("gemini-3-pro")) {
    if (thinkingLevel === "minimal") thinkingLevel = "low";
    else if (thinkingLevel === "medium") thinkingLevel = "high";
  } else if (model.startsWith("gemini-3.1-pro")) {
    if (thinkingLevel === "minimal") thinkingLevel = "low";
  }

  return {
    ok: true,
    value: { thinkingLevel, includeThoughts },
  };
}
