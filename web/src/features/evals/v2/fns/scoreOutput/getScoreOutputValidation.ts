import {
  getMinimumCategoricalCategoriesMessage,
  ScoreDataTypeEnum,
} from "@langfuse/shared";

import {
  DUPLICATE_CATEGORY_NAMES_MESSAGE,
  getDuplicateScoreOutputCategoryIndexes,
} from "@/src/features/evals/v2/fns/scoreOutput/getDuplicateScoreOutputCategoryIndexes";
import type { ScoreOutputSelectorState } from "@/src/features/evals/v2/scoreOutputTypes";

const EMPTY_CATEGORY_NAME_MESSAGE = "Category names cannot be empty.";

export type ScoreOutputValidationMessages = {
  emptyCategoryName: string;
  duplicateCategoryNames: string;
  minimumCategories: string;
};

export function getScoreOutputValidation(
  state: ScoreOutputSelectorState,
  messages: ScoreOutputValidationMessages = {
    emptyCategoryName: EMPTY_CATEGORY_NAME_MESSAGE,
    duplicateCategoryNames: DUPLICATE_CATEGORY_NAMES_MESSAGE,
    minimumCategories: `${getMinimumCategoricalCategoriesMessage()}.`,
  },
) {
  if (state.dataType !== ScoreDataTypeEnum.CATEGORICAL) {
    return { categoryWarnings: [], reason: null };
  }

  const duplicateIndexes = new Set(
    getDuplicateScoreOutputCategoryIndexes(
      state.choices.map(({ label }) => label),
    ),
  );
  const categoryWarnings = state.choices.map(({ label }, index) =>
    !label.trim()
      ? messages.emptyCategoryName
      : duplicateIndexes.has(index)
        ? messages.duplicateCategoryNames
        : null,
  );

  return {
    categoryWarnings,
    reason:
      categoryWarnings.find((warning) => warning !== null) ??
      (state.choices.length < 2 ? messages.minimumCategories : null),
  };
}
