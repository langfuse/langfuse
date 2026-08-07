import {
  PersistedEvalOutputDefinitionSchema,
  ScoreDataTypeEnum,
  type PersistedEvalOutputDefinition,
} from "@langfuse/shared";

import { type ScoreOutputFormState } from "@/src/features/evals/v2/scoreOutputTypes";

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : Number(trimmed);
}

/** Returns null when the editable output definition is invalid. */
export function buildScoreOutputDefinition(
  state: ScoreOutputFormState,
): PersistedEvalOutputDefinition | null {
  const base = {
    version: 2,
    dataType: state.dataType,
    reasoning: { description: state.reasoningDescription.trim() },
  };

  let candidate: unknown;
  if (state.dataType === ScoreDataTypeEnum.CATEGORICAL) {
    const choices = state.choices
      .map((choice) => ({ ...choice, label: choice.label.trim() }))
      .filter((choice) => choice.label.length > 0);
    const categoryValues: Record<string, number> = {};
    for (const choice of choices) {
      const value = parseOptionalNumber(choice.value);
      if (value === null) continue;
      if (Number.isNaN(value)) return null;
      categoryValues[choice.label] = value;
    }
    candidate = {
      ...base,
      score: {
        description: state.scoreDescription.trim(),
        categories: choices.map((choice) => choice.label),
        categoryValues:
          Object.keys(categoryValues).length > 0 ? categoryValues : null,
        shouldAllowMultipleMatches: false,
      },
    };
  } else if (state.dataType === ScoreDataTypeEnum.NUMERIC) {
    const minValue = parseOptionalNumber(state.minValue);
    const maxValue = parseOptionalNumber(state.maxValue);
    if (Number.isNaN(minValue) || Number.isNaN(maxValue)) return null;
    candidate = {
      ...base,
      score: {
        description: state.scoreDescription.trim(),
        minValue,
        maxValue,
      },
    };
  } else {
    candidate = {
      ...base,
      score: { description: state.scoreDescription.trim() },
    };
  }

  const parsed = PersistedEvalOutputDefinitionSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}
