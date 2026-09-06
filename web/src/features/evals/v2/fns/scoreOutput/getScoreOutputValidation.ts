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

export function getScoreOutputValidation(state: ScoreOutputSelectorState) {
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
      ? EMPTY_CATEGORY_NAME_MESSAGE
      : duplicateIndexes.has(index)
        ? DUPLICATE_CATEGORY_NAMES_MESSAGE
        : null,
  );

  return {
    categoryWarnings,
    reason:
      categoryWarnings.find((warning) => warning !== null) ??
      (state.choices.length < 2
        ? `${getMinimumCategoricalCategoriesMessage()}.`
        : null),
  };
}
