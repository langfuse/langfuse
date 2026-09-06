import {
  PersistedEvalOutputDefinitionSchema,
  resolvePersistedEvalOutputDefinition,
  ScoreDataTypeEnum,
} from "@langfuse/shared";

import { type ScoreOutputFormState } from "@/src/features/evals/v2/scoreOutputTypes";

export function toScoreOutputFormState(
  outputDefinition: unknown,
): ScoreOutputFormState {
  const parsed =
    PersistedEvalOutputDefinitionSchema.safeParse(outputDefinition);
  if (!parsed.success) {
    return {
      dataType: ScoreDataTypeEnum.NUMERIC,
      scoreDescription: "",
      reasoningDescription: "",
      choices: [],
      shouldAllowMultipleMatches: false,
      minValue: "0",
      maxValue: "1",
    };
  }

  const resolved = resolvePersistedEvalOutputDefinition(parsed.data);
  return {
    dataType: resolved.dataType,
    scoreDescription: resolved.scoreDescription,
    reasoningDescription: resolved.reasoningDescription,
    choices:
      "categories" in resolved
        ? resolved.categories.map((label) => ({
            label,
          }))
        : [],
    shouldAllowMultipleMatches:
      "shouldAllowMultipleMatches" in resolved
        ? resolved.shouldAllowMultipleMatches
        : false,
    minValue:
      "minValue" in resolved && resolved.minValue != null
        ? String(resolved.minValue)
        : "",
    maxValue:
      "maxValue" in resolved && resolved.maxValue != null
        ? String(resolved.maxValue)
        : "",
  };
}
