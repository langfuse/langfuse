import { getScoreDataTypeIcon } from "@/src/features/scores/lib/scoreColumns";
import {
  isPresent,
  type ScoreConfigCategoryDomain,
  type ScoreDataType,
} from "@langfuse/shared";
import { type ErrorOption } from "react-hook-form";

export const resolveConfigValue = ({
  name,
  dataType,
}: {
  name: string;
  dataType: ScoreDataType;
}) => {
  return `${getScoreDataTypeIcon(dataType)} ${name}`;
};

export const getAnnotationFormError = ({
  value,
  minValue,
  maxValue,
}: {
  value?: number | null;
  minValue?: number | null;
  maxValue?: number | null;
}): ErrorOption | null => {
  if (
    (isPresent(maxValue) && Number(value) > maxValue) ||
    (isPresent(minValue) && Number(value) < minValue)
  ) {
    return {
      type: "custom",
      message: `Not in range: [${minValue ?? "-∞"},${maxValue ?? "∞"}]`,
    };
  }
  return null;
};

export const enrichCategories = (
  categories: ScoreConfigCategoryDomain[],
  currentStringValue?: string | null,
): (ScoreConfigCategoryDomain & { isOutdated: boolean })[] => {
  if (categories.length === 0) return [];

  const enrichedCategories = categories.map((category) => ({
    ...category,
    isOutdated: false,
  }));

  if (!currentStringValue) return enrichedCategories;

  // If current value exists in categories, return as-is
  if (categories.some((category) => category.label === currentStringValue)) {
    return enrichedCategories;
  }

  return [
    {
      label: currentStringValue,
      value: 0,
      isOutdated: true,
    },
    ...enrichedCategories,
  ];
};
