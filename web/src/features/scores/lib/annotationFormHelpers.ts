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
  formatError,
}: {
  value?: number | null;
  minValue?: number | null;
  maxValue?: number | null;
  formatError?: (min: number | string, max: number | string) => string;
}): string | null => {
  if (
    (isPresent(maxValue) && Number(value) > maxValue) ||
    (isPresent(minValue) && Number(value) < minValue)
  ) {
    const min = minValue ?? "-∞";
    const max = maxValue ?? "∞";
    return formatError
      ? formatError(min, max)
      : `Not in range: [${min},${max}]`;
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

export const resolveCategoricalNumericValue = ({
  categories,
  stringValue,
  numericValue,
}: {
  categories?: Pick<ScoreConfigCategoryDomain, "label" | "value">[] | null;
  stringValue: string;
  numericValue?: number;
}): number | undefined => {
  if (isPresent(numericValue)) return numericValue;
  return categories?.find(({ label }) => label === stringValue)?.value;
};

export const nextCategoryValue = (
  categories: Pick<ScoreConfigCategoryDomain, "value">[],
): number => {
  if (categories.length === 0) return 0;
  return (
    categories.reduce((max, category) => Math.max(max, category.value), 0) + 1
  );
};

export const validateNewCategoryLabel = (
  label: string,
  categories: Pick<ScoreConfigCategoryDomain, "label">[],
  messages?: { required: string; exists: string },
): string | null => {
  const trimmed = label.trim();
  if (!trimmed) return messages?.required ?? "Category name is required";
  if (categories.some((category) => category.label === trimmed)) {
    return messages?.exists ?? "A category with this name already exists";
  }
  return null;
};

export const getAddCategoryActionLabel = (
  search: string,
  existingLabels: string[],
  messages?: { addNamed: (name: string) => string; addNew: string },
): string => {
  const trimmed = search.trim();
  if (trimmed && !existingLabels.includes(trimmed)) {
    return messages?.addNamed(trimmed) ?? `Add "${trimmed}"`;
  }
  return messages?.addNew ?? "Add new category";
};

export const appendCategoryToExisting = (
  categories: ScoreConfigCategoryDomain[],
  label: string,
):
  | { ok: true; categories: ScoreConfigCategoryDomain[] }
  | { ok: false; error: string } => {
  const trimmed = label.trim();
  const error = validateNewCategoryLabel(trimmed, categories);
  if (error) return { ok: false, error };

  return {
    ok: true,
    categories: [
      ...categories,
      { label: trimmed, value: nextCategoryValue(categories) },
    ],
  };
};
