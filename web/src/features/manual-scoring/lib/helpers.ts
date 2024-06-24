import {
  type ScoreConfig,
  ScoreDataType,
  type CastedConfig,
} from "@langfuse/shared";

export const isNumericDataType = (dataType: ScoreDataType) =>
  dataType === ScoreDataType.NUMERIC;

export const isCategoricalDataType = (dataType: ScoreDataType) =>
  dataType === ScoreDataType.CATEGORICAL;

export const isBooleanDataType = (dataType: ScoreDataType) =>
  dataType === ScoreDataType.BOOLEAN;

export const isPresent = <T>(value: T): value is NonNullable<T> =>
  value !== null && value !== undefined && value !== "";

export const isScoreUnsaved = (scoreId?: string): boolean => !scoreId;

export const isCastedConfig = (config: ScoreConfig): config is CastedConfig => {
  return (
    config.categories === null ||
    (Array.isArray(config.categories) &&
      config.categories.every(
        (category) =>
          category !== null &&
          typeof category === "object" &&
          "label" in category &&
          "value" in category,
      ))
  );
};
