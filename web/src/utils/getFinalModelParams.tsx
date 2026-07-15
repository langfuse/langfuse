import {
  type ModelConfig,
  type ModelParams,
  type UIModelParams,
  ZodModelConfig,
} from "@langfuse/shared";

export function getFinalModelParams(modelParams: UIModelParams): ModelParams {
  return {
    provider: modelParams.provider.value,
    adapter: modelParams.adapter.value,
    model: modelParams.model.value,
    ...getFinalModelConfig(modelParams),
  };
}

export function getFinalModelConfig(
  modelParams: Partial<UIModelParams>,
): ModelConfig {
  const enabledParams = Object.entries(modelParams)
    .filter(
      ([key, value]) =>
        value.enabled &&
        !["adapter", "provider", "model", "maxTemperature"].includes(key),
    )
    .reduce<Record<string, unknown>>(
      (params, [key, value]) => ({ ...params, [key]: value.value }),
      {},
    );

  return ZodModelConfig.parse(enabledParams);
}

export function getEnabledModelParamState(
  modelParams: ModelConfig,
): Partial<UIModelParams> {
  const { legacyReasoningTokenBudget, providerOptions, ...canonicalParams } =
    modelParams;
  const normalizedProviderOptions =
    legacyReasoningTokenBudget === undefined
      ? providerOptions
      : {
          ...(providerOptions ?? {}),
          google: {
            ...((providerOptions?.google as Record<string, unknown>) ?? {}),
            thinkingBudget: legacyReasoningTokenBudget,
          },
        };

  return Object.entries({
    ...canonicalParams,
    ...(normalizedProviderOptions === undefined
      ? {}
      : { providerOptions: normalizedProviderOptions }),
  }).reduce<Partial<UIModelParams>>(
    (state, [key, value]) =>
      value === undefined
        ? state
        : {
            ...state,
            [key]: { value, enabled: true },
          },
    {},
  );
}

type LegacyUIModelParams = Partial<UIModelParams> & {
  max_tokens?: { value: number; enabled: boolean };
  top_p?: { value: number; enabled: boolean };
  maxReasoningTokens?: { value: number; enabled: boolean };
};

/** Normalizes pre-AI-SDK Playground cache entries before they enter UI state. */
export function normalizeLegacyUIModelParams(
  modelParams: LegacyUIModelParams,
): Partial<UIModelParams> {
  const { max_tokens, top_p, maxReasoningTokens, ...canonicalParams } =
    modelParams;
  const reasoningBudget = maxReasoningTokens?.enabled
    ? maxReasoningTokens.value
    : undefined;
  const providerOptions = canonicalParams.providerOptions;

  return {
    ...canonicalParams,
    ...(canonicalParams.maxOutputTokens || !max_tokens
      ? {}
      : { maxOutputTokens: max_tokens }),
    ...(canonicalParams.topP || !top_p ? {} : { topP: top_p }),
    ...(reasoningBudget === undefined
      ? {}
      : {
          providerOptions: {
            value: {
              ...(providerOptions?.value ?? {}),
              google: {
                ...((providerOptions?.value?.google as Record<
                  string,
                  unknown
                >) ?? {}),
                thinkingBudget: reasoningBudget,
              },
            },
            enabled: true,
          },
        }),
  };
}
