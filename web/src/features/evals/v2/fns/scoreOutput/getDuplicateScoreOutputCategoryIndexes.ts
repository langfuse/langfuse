import { getCategoricalCategoryRuleViolations } from "@langfuse/shared";

export const DUPLICATE_CATEGORY_NAMES_MESSAGE =
  "Category names must be unique.";

export function getDuplicateScoreOutputCategoryIndexes(categories: string[]) {
  return getCategoricalCategoryRuleViolations(categories).flatMap(
    (violation) =>
      violation.type === "duplicate_value" &&
      categories[violation.index]?.trim()
        ? [violation.index]
        : [],
  );
}
