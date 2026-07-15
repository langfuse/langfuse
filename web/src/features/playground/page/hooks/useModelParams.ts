import { useEffect, useMemo, useCallback, useState } from "react";

import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { api } from "@/src/utils/api";
import useLocalStorage from "@/src/components/useLocalStorage";
import {
  LLMAdapter,
  type ModelConfig,
  supportedModels,
  type UIModelParams,
} from "@langfuse/shared";
import { type ModelParamsContext } from "@/src/components/ModelParameters";
import { getEnabledModelParamState } from "@/src/utils/getFinalModelParams";
import { getModelNameKey, getModelProviderKey } from "../storage/keys";

type PromptConfigModel = {
  selectionKey?: string;
  provider?: string;
  model: string;
} & ModelConfig;

type UseModelParamsOptions = {
  promptConfigModel?: PromptConfigModel | null;
};

/**
 * Hook for managing model parameters with window isolation support
 * Supports both single-window and multi-window scenarios through window-specific localStorage keys
 *
 * @param windowId - Optional window identifier for state isolation. Defaults to "default" for backward compatibility
 * @returns Object with model parameters state and management functions
 */
export const useModelParams = (
  windowId?: string,
  options?: UseModelParamsOptions,
) => {
  const [modelParams, setModelParams] = useState<UIModelParams>({
    ...getDefaultAdapterParams(LLMAdapter.OpenAI),
    provider: { value: "", enabled: true },
    model: { value: "", enabled: true },
  });

  // Set initial model params
  const projectId = useProjectIdFromURL();
  const availableLLMApiKeys = api.llmApiKey.all.useQuery(
    {
      projectId: projectId as string,
    },
    { enabled: Boolean(projectId) },
  );

  // Generate window-specific localStorage keys
  const modelNameKey = getModelNameKey(windowId ?? "");
  const modelProviderKey = getModelProviderKey(windowId ?? "");

  const [persistedModelName, setPersistedModelName] = useLocalStorage<
    string | null
  >(modelNameKey, null);

  const [persistedModelProvider, setPersistedModelProvider] = useLocalStorage<
    string | null
  >(modelProviderKey, null);

  const availableProviders = useMemo(() => {
    const adapter = availableLLMApiKeys.data?.data ?? [];

    return adapter.map((key) => key.provider) ?? [];
  }, [availableLLMApiKeys.data?.data]);

  const selectedProviderApiKey = availableLLMApiKeys.data?.data.find(
    (key) => key.provider === modelParams.provider.value,
  );

  const promptConfigSelectionKey = options?.promptConfigModel?.selectionKey;
  const promptConfigProvider = options?.promptConfigModel?.provider;
  const promptConfigModel = options?.promptConfigModel?.model;
  const promptConfig = options?.promptConfigModel;
  const resolvedPromptConfigProvider = useMemo(() => {
    if (!promptConfigModel) return undefined;

    const apiKeys = availableLLMApiKeys.data?.data ?? [];
    const matchingApiKey = promptConfigProvider
      ? (apiKeys.find(({ provider }) => provider === promptConfigProvider) ??
        apiKeys.find(({ adapter }) => adapter === promptConfigProvider))
      : apiKeys.find(({ adapter, customModels, withDefaultModels }) =>
          (withDefaultModels
            ? customModels.concat(supportedModels[adapter])
            : customModels
          ).includes(promptConfigModel),
        );

    return matchingApiKey?.provider;
  }, [availableLLMApiKeys.data?.data, promptConfigModel, promptConfigProvider]);
  const resolvedPromptConfigAdapter = availableLLMApiKeys.data?.data.find(
    ({ provider }) => provider === resolvedPromptConfigProvider,
  )?.adapter;

  const providerModelCombinations =
    availableLLMApiKeys.data?.data.reduce((acc, v) => {
      if (v.withDefaultModels) {
        acc.push(
          ...supportedModels[v.adapter].map((m) => `${v.provider}: ${m}`),
        );
      }
      acc.push(...v.customModels.map((m) => `${v.provider}: ${m}`));

      return acc;
    }, [] as string[]) ?? [];

  const promptConfigProviderModelCombination =
    resolvedPromptConfigProvider && promptConfigModel
      ? `${resolvedPromptConfigProvider}: ${promptConfigModel}`
      : undefined;

  if (
    promptConfigProviderModelCombination &&
    !providerModelCombinations.includes(promptConfigProviderModelCombination)
  ) {
    providerModelCombinations.push(promptConfigProviderModelCombination);
  }

  const availableModels = useMemo(() => {
    if (!selectedProviderApiKey) return [];

    const baseModels = selectedProviderApiKey.withDefaultModels
      ? selectedProviderApiKey.customModels.concat(
          supportedModels[selectedProviderApiKey.adapter],
        )
      : selectedProviderApiKey.customModels;

    const shouldAddModelFromPromptConfig =
      resolvedPromptConfigProvider === selectedProviderApiKey.provider &&
      promptConfigModel &&
      !baseModels.includes(promptConfigModel);

    return shouldAddModelFromPromptConfig
      ? [...baseModels, promptConfigModel]
      : baseModels;
  }, [promptConfigModel, resolvedPromptConfigProvider, selectedProviderApiKey]);

  const updateModelParamValue = useCallback<
    ModelParamsContext["updateModelParamValue"]
  >(
    (key, value) => {
      setModelParams((prev) => {
        const updated = {
          ...prev,
          [key]: { ...prev[key], value },
        };

        if (key !== "provider" || typeof value !== "string") return updated;

        const adapter = availableLLMApiKeys.data?.data.find(
          (connection) => connection.provider === value,
        )?.adapter;
        if (!adapter) return updated;

        const defaults = getDefaultAdapterParams(adapter);
        return {
          ...updated,
          adapter: defaults.adapter,
          maxTemperature: defaults.maxTemperature,
          temperature: {
            ...prev.temperature,
            value: Math.min(
              prev.temperature.value,
              defaults.maxTemperature.value,
            ),
          },
        };
      });

      if (value && key === "model") {
        setPersistedModelName(String(value));
      }
      if (value && key === "provider") {
        setPersistedModelProvider(String(value));
      }
    },
    [
      availableLLMApiKeys.data?.data,
      setPersistedModelName,
      setPersistedModelProvider,
      setModelParams,
    ],
  );

  const setModelParamEnabled: ModelParamsContext["setModelParamEnabled"] = (
    key,
    enabled,
  ) => {
    setModelParams((prev) => {
      const updated = {
        ...prev,
        [key]: { ...prev[key], enabled },
      };

      // For Anthropic models, temperature and topP are mutually exclusive
      // When enabling one, disable the other
      if (updated.adapter.value === LLMAdapter.Anthropic && enabled) {
        if (key === "temperature" && prev.topP.enabled) {
          updated.topP = { ...prev.topP, enabled: false };
        } else if (key === "topP" && prev.temperature.enabled) {
          updated.temperature = { ...prev.temperature, enabled: false };
        }
      }

      return updated;
    });
  };

  // Set default provider and model
  useEffect(() => {
    if (
      availableProviders.length > 0 &&
      (!modelParams.provider.value ||
        !availableProviders.includes(modelParams.provider.value))
    ) {
      // fall back to a valid provider whenever the cached value is missing or no longer available (e.g. after switching projects)
      if (
        persistedModelProvider &&
        availableProviders.includes(persistedModelProvider)
      ) {
        updateModelParamValue("provider", persistedModelProvider);
      } else {
        updateModelParamValue("provider", availableProviders[0]);
      }
    }
  }, [
    availableProviders,
    modelParams.provider.value,
    updateModelParamValue,
    persistedModelProvider,
  ]);

  useEffect(() => {
    if (
      (availableModels.length > 0 && !modelParams.model.value) ||
      !availableModels.includes(modelParams.model.value)
    ) {
      if (persistedModelName && availableModels.includes(persistedModelName)) {
        updateModelParamValue("model", persistedModelName);
      } else {
        updateModelParamValue("model", availableModels[0]);
      }
    }
  }, [
    availableModels,
    modelParams.model.value,
    updateModelParamValue,
    persistedModelName,
  ]);

  useEffect(() => {
    if (
      !promptConfig ||
      !promptConfigSelectionKey ||
      !resolvedPromptConfigProvider ||
      !promptConfigModel
    ) {
      return;
    }

    const {
      selectionKey: _,
      provider: __,
      model: ___,
      ...config
    } = promptConfig;
    const adapterDefaults = resolvedPromptConfigAdapter
      ? getDefaultAdapterParams(resolvedPromptConfigAdapter)
      : undefined;
    setModelParams((prev) => ({
      ...prev,
      ...getEnabledModelParamState(config),
      provider: { value: resolvedPromptConfigProvider, enabled: true },
      model: { value: promptConfigModel, enabled: true },
      ...(adapterDefaults
        ? {
            adapter: adapterDefaults.adapter,
            maxTemperature: adapterDefaults.maxTemperature,
          }
        : {}),
    }));
  }, [
    promptConfigSelectionKey,
    promptConfigModel,
    promptConfig,
    resolvedPromptConfigAdapter,
    resolvedPromptConfigProvider,
  ]);

  return {
    modelParams,
    setModelParams,
    availableProviders,
    availableModels,
    updateModelParamValue,
    setModelParamEnabled,
    providerModelCombinations,
  };
};

function getDefaultAdapterParams(
  adapter: LLMAdapter,
): Omit<UIModelParams, "provider" | "model"> {
  let temperature: number;
  let maxTemperature: number;

  switch (adapter) {
    // Docs: https://platform.openai.com/docs/api-reference/chat/create
    case LLMAdapter.OpenAI:
    case LLMAdapter.Azure:
      temperature = 0;
      maxTemperature = 2;
      break;

    // Docs: https://docs.anthropic.com/claude/reference/messages_post
    case LLMAdapter.Anthropic:
    case LLMAdapter.Bedrock:
      temperature = 0;
      maxTemperature = 1;
      break;

    case LLMAdapter.VertexAI:
    case LLMAdapter.GoogleAIStudio:
      temperature = 1;
      maxTemperature = 2;
      break;
  }

  return {
    adapter: { value: adapter, enabled: true },
    temperature: { value: temperature, enabled: false },
    maxTemperature: { value: maxTemperature, enabled: false },
    maxOutputTokens: { value: 4096, enabled: false },
    topP: { value: 1, enabled: false },
    topK: { value: 40, enabled: false },
    presencePenalty: { value: 0, enabled: false },
    frequencyPenalty: { value: 0, enabled: false },
    stopSequences: { value: [], enabled: false },
    seed: { value: 0, enabled: false },
    reasoning: { value: "provider-default", enabled: false },
    providerOptions: { value: {}, enabled: false },
  };
}
