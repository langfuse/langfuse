import {
  PersistedEvalOutputDefinitionSchema,
  resolvePersistedEvalOutputDefinition,
  ScoreDataTypeEnum,
} from "@langfuse/shared";

import { type ScoreOutputFormState } from "@/src/features/evals/v2/scoreOutputTypes";
import { shouldReplaceDefaultOutputDefinitionField } from "@/src/features/evals/utils/template-form-defaults";

function normalizeDescription(
  value: string,
  field: "scoreDescription" | "reasoningDescription",
) {
  return shouldReplaceDefaultOutputDefinitionField({
    currentValue: value,
    field,
  })
    ? ""
    : value;
}

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
      minValue: "0",
      maxValue: "1",
    };
  }

  const resolved = resolvePersistedEvalOutputDefinition(parsed.data);
  return {
    dataType: resolved.dataType,
    scoreDescription: normalizeDescription(
      resolved.scoreDescription,
      "scoreDescription",
    ),
    reasoningDescription: normalizeDescription(
      resolved.reasoningDescription,
      "reasoningDescription",
    ),
    choices:
      "categories" in resolved
        ? resolved.categories.map((label) => ({
            label,
            value:
              resolved.categoryValues?.[label] != null
                ? String(resolved.categoryValues[label])
                : "",
          }))
        : [],
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
