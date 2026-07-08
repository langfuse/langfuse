import {
  type ModelConfig,
  type ModelParams,
  type UIModelParams,
} from "@langfuse/shared";

export function getFinalModelParams(modelParams: UIModelParams): ModelParams {
  return Object.entries(modelParams)
    .filter(([key, value]) => value.enabled && key !== "maxTemperature")
    .reduce(
      (params, [key, value]) => ({ ...params, [key]: value.value }),
      {} as ModelParams,
    );
}

export function getEnabledModelParamState(
  modelParams: ModelConfig,
): Partial<UIModelParams> {
  return Object.entries(modelParams).reduce<Partial<UIModelParams>>(
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
