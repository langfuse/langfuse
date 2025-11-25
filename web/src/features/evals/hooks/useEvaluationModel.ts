import { api } from "@/src/utils/api";
import {
  type ModelParams,
  ZodModelConfig,
  type UIModelParams,
} from "@langfuse/shared";
import { type Dispatch, type SetStateAction, useEffect } from "react";

export function useEvaluationModel(
  projectId: string,
  setModelParams: Dispatch<SetStateAction<UIModelParams>>,
  customModelParams?: {
    provider: string;
    model: string;
    modelParams: ModelParams & {
      maxTemperature: number;
    };
  },
) {
  const { data: defaultModel, isLoading: isDefaultModelLoading } =
    api.defaultLlmModel.fetchDefaultModel.useQuery({
      projectId,
    });

  const selectedModel = customModelParams ?? defaultModel;

  useEffect(() => {
    if (selectedModel) {
      const { provider, model, modelParams } = selectedModel;
      const parsedModelParams = ZodModelConfig.safeParse(modelParams);
      if (!parsedModelParams.success) {
        return;
      }

      const modelConfig = Object.entries(parsedModelParams.data).reduce(
        (acc, [key, value]) => {
          return {
            ...acc,
            [key]: { value, enabled: true },
          };
        },
        {} as UIModelParams,
      );

      setModelParams((prev: UIModelParams) => ({
        ...prev,
        ...modelConfig,
        provider: { value: provider, enabled: true },
        model: { value: model, enabled: true },
      }));
    }
  }, [selectedModel, setModelParams]);

  return {
    selectedModel,
    isUsingDefaultModel: !customModelParams,
    isDefaultModelLoading,
  };
}
