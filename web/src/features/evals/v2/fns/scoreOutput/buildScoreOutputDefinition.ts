import {
  EvalOutputDefinitionSchema,
  ScoreDataTypeEnum,
  type EvalOutputDefinition,
} from "@langfuse/shared";
import type { ScoreOutputFormState } from "@/src/features/evals/v2/scoreOutputTypes";
import {
  DEFAULT_REASONING_DESCRIPTION,
  DEFAULT_SCORE_DESCRIPTION,
} from "@/src/features/evals/v2/scoreOutputDefaults";

// A blank input means "no bound". Anything else is handed to the schema as-is
// (NaN included) so an unparsable entry fails validation instead of silently
// dropping the bound the user typed.
function parseNumericBound(key: "minValue" | "maxValue", raw: string) {
  return raw.trim() ? { [key]: Number(raw) } : {};
}

export function buildScoreOutputDefinition(
  state: ScoreOutputFormState,
): EvalOutputDefinition | null {
  const base = {
    dataType: state.dataType,
    reasoning: {
      description:
        state.reasoningDescription.trim() || DEFAULT_REASONING_DESCRIPTION,
    },
  };
  const scoreDescription =
    state.scoreDescription.trim() || DEFAULT_SCORE_DESCRIPTION;
  const candidate =
    state.dataType === ScoreDataTypeEnum.CATEGORICAL
      ? {
          ...base,
          score: {
            description: scoreDescription,
            categories: state.choices.map(({ label }) => label.trim()),
            shouldAllowMultipleMatches: state.shouldAllowMultipleMatches,
          },
        }
      : state.dataType === ScoreDataTypeEnum.NUMERIC
        ? {
            ...base,
            score: {
              description: scoreDescription,
              ...parseNumericBound("minValue", state.minValue),
              ...parseNumericBound("maxValue", state.maxValue),
            },
          }
        : {
            ...base,
            score: { description: scoreDescription },
          };
  const parsed = EvalOutputDefinitionSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}
