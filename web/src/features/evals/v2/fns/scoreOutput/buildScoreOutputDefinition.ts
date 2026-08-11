import {
  PersistedEvalOutputDefinitionSchema,
  ScoreDataTypeEnum,
  type PersistedEvalOutputDefinition,
} from "@langfuse/shared";
import type { ScoreOutputFormState } from "@/src/features/evals/v2/scoreOutputTypes";

export function buildScoreOutputDefinition(
  state: ScoreOutputFormState,
): PersistedEvalOutputDefinition | null {
  const base = {
    version: 2 as const,
    dataType: state.dataType,
    reasoning: { description: state.reasoningDescription.trim() },
  };
  const candidate =
    state.dataType === ScoreDataTypeEnum.CATEGORICAL
      ? {
          ...base,
          score: {
            description: state.scoreDescription.trim(),
            categories: state.choices.map(({ label }) => label.trim()),
            shouldAllowMultipleMatches: false,
          },
        }
      : {
          ...base,
          score: { description: state.scoreDescription.trim() },
        };
  const parsed = PersistedEvalOutputDefinitionSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}
