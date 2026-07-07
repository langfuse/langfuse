import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";

import type { ModelParams } from "../../types";
import type { TranslatedProviderOptions } from "./types";

/**
 * LangChain's secure Google AI Studio client appends the SDK-generated path
 * (`/v1beta/models/...`) to the stored base URL, so the stored value is an
 * origin-style prefix without the API version. The AI SDK's `baseURL` includes
 * the version (default `https://generativelanguage.googleapis.com/v1beta`).
 */
export function toGoogleAIStudioBaseURL(
  baseURL: string | null | undefined,
): string | undefined {
  if (!baseURL) return undefined;

  const trimmed = baseURL.replace(/\/+$/, "");
  return trimmed.endsWith("/v1beta") ? trimmed : `${trimmed}/v1beta`;
}

export function buildGoogleAIStudioModel(params: {
  modelParams: ModelParams;
  apiKey: string;
  baseURL?: string | null;
  fetch: typeof fetch;
}): LanguageModel {
  const provider = createGoogleGenerativeAI({
    apiKey: params.apiKey,
    baseURL: toGoogleAIStudioBaseURL(params.baseURL),
    fetch: params.fetch,
  });

  // Note: extra headers are intentionally not sent — the LangChain engine's
  // Google AI Studio client only injects the API key header.
  return provider(params.modelParams.model);
}

const GOOGLE_THINKING_LEVELS = new Set(["minimal", "low", "medium", "high"]);

/**
 * Translation of Langfuse `modelParams.providerOptions` (plus the Vertex-only
 * `modelParams.maxReasoningTokens`) to AI SDK Google provider options.
 *
 * The LangChain engine parses `providerOptions` with a non-strict zod schema
 * ({ thinkingBudget?, thinkingLevel? }) — unknown keys are silently stripped,
 * never sent — so stripping them here is exact parity, unlike the other
 * adapters where unknown keys reach the request body.
 *
 * LangChain then derives a wire `thinkingConfig` from the model family:
 * `gemini-2.5*` gets `thinkingBudget`, everything else gets `thinkingLevel`,
 * converting between the two representations when needed. We mirror the
 * direct cases and decline the conversion cases (budget-only on a
 * level-family model or vice versa), since replicating LangChain's
 * model-specific conversion tables would silently drift.
 */
export function translateGoogleProviderOptions(params: {
  providerOptions: Record<string, unknown> | undefined;
  model: string;
  maxReasoningTokens?: number;
}): TranslatedProviderOptions {
  const { providerOptions, model, maxReasoningTokens } = params;

  const translated: Record<string, unknown> = {};

  const nested = providerOptions?.google;
  if (typeof nested === "object" && nested !== null) {
    // Nested `google` object is treated as already AI SDK-shaped.
    Object.assign(translated, nested);
  }

  const rawThinkingBudget = providerOptions?.thinkingBudget;
  const rawThinkingLevel = providerOptions?.thinkingLevel;

  if (
    rawThinkingBudget !== undefined &&
    typeof rawThinkingBudget !== "number"
  ) {
    // LangChain's schema parse would throw; decline so it does.
    return { ok: false, unknownKeys: ["thinkingBudget"] };
  }
  if (rawThinkingLevel !== undefined && typeof rawThinkingLevel !== "string") {
    return { ok: false, unknownKeys: ["thinkingLevel"] };
  }

  // LangChain precedence: maxReasoningTokens ?? thinkingBudget.
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
    // Budget-family model. LangChain converts a lone thinkingLevel into a
    // token budget via model-specific tables; decline instead of guessing.
    if (thinkingBudget === undefined) {
      return { ok: false, unknownKeys: ["thinkingLevel"] };
    }

    // Mirror LangChain: thought summaries are on unless thinking is off, and
    // the 2.5-pro family cannot go below its 128-token minimum.
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

  // LangChain remaps unsupported levels for the pro families.
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
