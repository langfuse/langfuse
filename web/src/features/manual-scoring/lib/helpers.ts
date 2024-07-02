import {
  type ScoreConfig,
  ScoreDataType,
  type CastedConfig,
  type CreateConfig,
  type ConfigCategory,
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

export const isCastedConfigCategory = (
  categories: ScoreConfig["categories"],
): categories is ConfigCategory =>
  categories === null ||
  (Array.isArray(categories) &&
    categories.every(
      (category) =>
        category !== null &&
        typeof category === "object" &&
        "label" in category &&
        "value" in category,
    ));

export const isCastedConfig = (config: ScoreConfig): config is CastedConfig => {
  return isCastedConfigCategory(config.categories);
};

export const validateScoreConfig = (values: CreateConfig): string | null => {
  const { dataType, maxValue, minValue, categories } = values;

  if (isNumericDataType(dataType)) {
    if (isPresent(maxValue) && isPresent(minValue) && maxValue <= minValue) {
      return "Maximum value must be greater than Minimum value.";
    }
  } else if (isCategoricalDataType(dataType)) {
    if (!categories || categories.length === 0) {
      return "At least one category is required for categorical data types.";
    }
  } else if (isBooleanDataType(dataType)) {
    if (categories?.length !== 2)
      return "Boolean data type must have exactly 2 categories.";
    const isBooleanCategoryInvalid = categories?.some(
      (category) => category.value !== 0 && category.value !== 1,
    );
    if (isBooleanCategoryInvalid)
      return "Boolean data type must have categories with values 0 and 1.";
  }

  const uniqueNames = new Set<string>();
  const uniqueValues = new Set<number>();

  for (const category of categories || []) {
    if (uniqueNames.has(category.label)) {
      return "Category names must be unique.";
    }
    uniqueNames.add(category.label);

    if (uniqueValues.has(category.value)) {
      return "Category values must be unique.";
    }
    uniqueValues.add(category.value);
  }

  return null;
};
