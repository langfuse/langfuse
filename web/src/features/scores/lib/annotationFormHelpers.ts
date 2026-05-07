import { getScoreDataTypeIcon } from "@/src/features/scores/lib/scoreColumns";
import {
  isPresent,
  type ScoreConfigDataType,
  type ScoreConfigCategoryDomain,
} from "@langfuse/shared";

export const resolveConfigValue = ({
  name,
  dataType,
}: {
  name: string;
  dataType: ScoreConfigDataType;
}) => {
  return `${getScoreDataTypeIcon(dataType)} ${name}`;
};

export const validateNumericScore = ({
  value,
  minValue,
  maxValue,
}: {
  value?: number | null;
  minValue?: number | null;
  maxValue?: number | null;
}): string | null => {
  if (
    (isPresent(maxValue) && Number(value) > maxValue) ||
    (isPresent(minValue) && Number(value) < minValue)
  ) {
    return `Not in range: [${minValue ?? "-∞"},${maxValue ?? "∞"}]`;
  }
  return null;
};

// In case the underlying score config categories have changed, we need to enrich the category options with a stale score value
export const enrichCategoryOptionsWithStaleScoreValue = (
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
