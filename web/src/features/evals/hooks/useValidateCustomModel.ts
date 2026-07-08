import { type ModelParams } from "@langfuse/shared";

export function useValidateCustomModel(
  availableProviders: string[],
  customModelParams?: {
    provider: string;
    model: string;
    modelParams: ModelParams & {
      maxTemperature: number;
    };
  },
): { isCustomModelValid: boolean } {
  if (!customModelParams) {
    return { isCustomModelValid: false };
  }

  if (!availableProviders.includes(customModelParams.provider)) {
    return { isCustomModelValid: false };
  }

  return { isCustomModelValid: true };
}
