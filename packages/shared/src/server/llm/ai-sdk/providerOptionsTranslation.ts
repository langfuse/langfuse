import type { AiSdkProviderOptions } from "./types";

type TranslatedOpenAIProviderOptions = {
  providerOptions?: AiSdkProviderOptions;
  callSettings: {
    seed?: number;
  };
  unsupportedKeys: string[];
};

const TOP_LEVEL_PROVIDER_OPTION_TRANSLATORS = new Set([
  "openai",
  "reasoning_effort",
  "reasoningEffort",
  "seed",
  "store",
  "user",
  "max_completion_tokens",
  "maxCompletionTokens",
]);

export function getUnsupportedOpenAIProviderOptionKeys(
  providerOptions: Record<string, unknown> | undefined,
): string[] {
  if (!providerOptions) return [];

  const unsupportedKeys = Object.keys(providerOptions).filter(
    (key) => !TOP_LEVEL_PROVIDER_OPTION_TRANSLATORS.has(key),
  );

  if ("openai" in providerOptions && !isPlainObject(providerOptions.openai)) {
    unsupportedKeys.push("openai");
  }

  return unsupportedKeys;
}

export function translateOpenAIProviderOptions(
  providerOptions: Record<string, unknown> | undefined,
): TranslatedOpenAIProviderOptions {
  const unsupportedKeys =
    getUnsupportedOpenAIProviderOptionKeys(providerOptions);
  if (!providerOptions) {
    return { callSettings: {}, unsupportedKeys };
  }

  const openaiOptions = isPlainObject(providerOptions.openai)
    ? { ...providerOptions.openai }
    : {};
  const callSettings: TranslatedOpenAIProviderOptions["callSettings"] = {};

  const reasoningEffort =
    providerOptions.reasoningEffort ?? providerOptions.reasoning_effort;
  if (typeof reasoningEffort === "string") {
    openaiOptions.reasoningEffort = reasoningEffort;
  }

  if (typeof providerOptions.seed === "number") {
    callSettings.seed = providerOptions.seed;
  }

  if (typeof providerOptions.store === "boolean") {
    openaiOptions.store = providerOptions.store;
  }

  if (typeof providerOptions.user === "string") {
    openaiOptions.user = providerOptions.user;
  }

  const maxCompletionTokens =
    providerOptions.maxCompletionTokens ??
    providerOptions.max_completion_tokens;
  if (typeof maxCompletionTokens === "number") {
    openaiOptions.maxCompletionTokens = maxCompletionTokens;
  }

  return {
    providerOptions:
      Object.keys(openaiOptions).length > 0
        ? ({ openai: openaiOptions } as AiSdkProviderOptions)
        : undefined,
    callSettings,
    unsupportedKeys,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
