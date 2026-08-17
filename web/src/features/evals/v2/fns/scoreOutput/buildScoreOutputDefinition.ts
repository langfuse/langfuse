import {
  PersistedEvalOutputDefinitionSchema,
  ScoreDataTypeEnum,
  type PersistedEvalOutputDefinition,
} from "@langfuse/shared";
import type { ScoreOutputFormState } from "@/src/features/evals/v2/scoreOutputTypes";
import {
  DEFAULT_REASONING_DESCRIPTION,
  DEFAULT_SCORE_DESCRIPTION,
} from "@/src/features/evals/v2/scoreOutputDefaults";

export function buildScoreOutputDefinition(
  state: ScoreOutputFormState,
): PersistedEvalOutputDefinition | null {
  const base = {
    version: 2 as const,
    dataType: state.dataType,
    reasoning: {
      description:
        state.reasoningDescription.trim() || DEFAULT_REASONING_DESCRIPTION,
    },
  };
  const candidate =
    state.dataType === ScoreDataTypeEnum.CATEGORICAL
      ? {
          ...base,
          score: {
            description:
              state.scoreDescription.trim() || DEFAULT_SCORE_DESCRIPTION,
            categories: state.choices.map(({ label }) => label.trim()),
            shouldAllowMultipleMatches: state.shouldAllowMultipleMatches,
          },
        }
      : {
          ...base,
          score: {
            description:
              state.scoreDescription.trim() || DEFAULT_SCORE_DESCRIPTION,
          },
        };
  const parsed = PersistedEvalOutputDefinitionSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}
