import { useEffect, useMemo, useState } from "react";

import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { api } from "@/src/utils/api";
import {
  LLMAdapter,
  supportedModels,
  type UIModelParams,
} from "@langfuse/shared";
import { type ModelParamsContext } from "@/src/components/ModelParameters";

export const useModelParams = () => {
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

  const availableProviders = useMemo(() => {
    const adapter = availableLLMApiKeys.data?.data ?? [];

    return adapter.map((key) => key.provider) ?? [];
  }, [availableLLMApiKeys.data?.data]);

  const selectedProviderApiKey = availableLLMApiKeys.data?.data.find(
    (key) => key.provider === modelParams.provider.value,
  );

  const availableModels = useMemo(
    () =>
      !selectedProviderApiKey
        ? []
        : selectedProviderApiKey.withDefaultModels
          ? [
              ...selectedProviderApiKey.customModels,
              ...supportedModels[selectedProviderApiKey.adapter],
            ]
          : selectedProviderApiKey.customModels,
    [selectedProviderApiKey],
  );

  const updateModelParamValue: ModelParamsContext["updateModelParamValue"] = (
    key,
    value,
  ) => {
    setModelParams((prev) => ({
      ...prev,
      [key]: { ...prev[key], value },
    }));
  };

  const setModelParamEnabled: ModelParamsContext["setModelParamEnabled"] = (
    key,
    enabled,
  ) => {
    setModelParams((prev) => ({
      ...prev,
      [key]: { ...prev[key], enabled },
    }));
  };

  // Set default provider and model
  useEffect(() => {
    if (availableProviders.length > 0 && !modelParams.provider.value) {
      updateModelParamValue("provider", availableProviders[0]);
    }
  }, [availableProviders, modelParams.provider.value]);

  useEffect(() => {
    if (
      (availableModels.length > 0 && !modelParams.model.value) ||
      !availableModels.includes(modelParams.model.value)
    ) {
      updateModelParamValue("model", availableModels[0]);
    }
  }, [availableModels, modelParams.model.value]);

  // Update adapter, max temperature, temperature, max_tokens, top_p when provider changes
  useEffect(() => {
    if (selectedProviderApiKey?.adapter) {
      setModelParams((prev) => ({
        ...prev,
        adapter: {
          value: selectedProviderApiKey.adapter,
          enabled: true,
        },
        maxTemperature: {
          value: getDefaultAdapterParams(selectedProviderApiKey.adapter)
            .maxTemperature.value,
          enabled: getDefaultAdapterParams(selectedProviderApiKey.adapter)
            .maxTemperature.enabled,
        },
        temperature: {
          value: Math.min(
            prev.temperature.value,
            getDefaultAdapterParams(selectedProviderApiKey.adapter)
              .maxTemperature.value,
          ),
          enabled: getDefaultAdapterParams(selectedProviderApiKey.adapter)
            .temperature.enabled,
        },
        max_tokens: {
          value: getDefaultAdapterParams(selectedProviderApiKey.adapter)
            .max_tokens.value,
          enabled: getDefaultAdapterParams(selectedProviderApiKey.adapter)
            .max_tokens.enabled,
        },
        top_p: {
          value: getDefaultAdapterParams(selectedProviderApiKey.adapter).top_p
            .value,
          enabled: getDefaultAdapterParams(selectedProviderApiKey.adapter).top_p
            .enabled,
        },
      }));
    }
  }, [selectedProviderApiKey?.adapter]);

  return {
    modelParams,
    setModelParams,
    availableProviders,
    availableModels,
    updateModelParamValue,
    setModelParamEnabled,
  };
};

function getDefaultAdapterParams(
  adapter: LLMAdapter,
): Omit<UIModelParams, "provider" | "model"> {
  switch (adapter) {
    // Docs: https://platform.openai.com/docs/api-reference/chat/create
    case LLMAdapter.OpenAI:
      return {
        adapter: {
          value: adapter,
          enabled: true,
        },
        temperature: { value: 0, enabled: true },
        maxTemperature: { value: 2, enabled: true },
        max_tokens: { value: 256, enabled: true },
        top_p: { value: 1, enabled: true },
      };

    case LLMAdapter.Azure:
      return {
        adapter: {
          value: adapter,
          enabled: true,
        },
        temperature: { value: 0, enabled: true },
        maxTemperature: { value: 2, enabled: true },
        max_tokens: { value: 256, enabled: true },
        top_p: { value: 1, enabled: true },
      };

    // Docs: https://docs.anthropic.com/claude/reference/messages_post
    case LLMAdapter.Anthropic:
      return {
        adapter: {
          value: adapter,
          enabled: true,
        },
        temperature: { value: 0, enabled: true },
        maxTemperature: { value: 1, enabled: true },
        max_tokens: { value: 256, enabled: true },
        top_p: { value: 1, enabled: true },
      };

    case LLMAdapter.Bedrock:
      return {
        adapter: {
          value: adapter,
          enabled: true,
        },
        temperature: { value: 0, enabled: true },
        maxTemperature: { value: 1, enabled: true },
        max_tokens: { value: 256, enabled: true },
        top_p: { value: 1, enabled: true },
      };

    case LLMAdapter.VertexAI:
      return {
        adapter: {
          value: adapter,
          enabled: true,
        },
        temperature: { value: 1, enabled: true },
        maxTemperature: { value: 2, enabled: true },
        max_tokens: { value: 256, enabled: true },
        top_p: { value: 1, enabled: true },
      };

    case LLMAdapter.GoogleAIStudio:
      return {
        adapter: {
          value: adapter,
          enabled: true,
        },
        temperature: { value: 1, enabled: true },
        maxTemperature: { value: 2, enabled: true },
        max_tokens: { value: 256, enabled: true },
        top_p: { value: 1, enabled: true },
      };
    case LLMAdapter.Atla:
      return {
        adapter: {
          value: adapter,
          enabled: true,
        },
        temperature: { value: 0, enabled: false },
        maxTemperature: { value: 1, enabled: false },
        max_tokens: { value: 4096, enabled: false },
        top_p: { value: 1, enabled: false },
      };
  }
}
