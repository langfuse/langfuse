import { JobConfigState } from "@langfuse/shared";
import { type PartialConfig } from "@/src/features/evals/types";

export const CLONED_EVALUATOR_SCORE_NAME_SUFFIX = " (copy)";

export function buildCloneScoreName(scoreName: string): string {
  return `${scoreName}${CLONED_EVALUATOR_SCORE_NAME_SUFFIX}`;
}

/**
 * Builds default form values for a cloned running evaluator (job configuration).
 * Clones start inactive and only apply to new data to avoid duplicate backfills.
 */
export function buildClonedEvaluatorConfig(
  source: PartialConfig,
): PartialConfig {
  return {
    scoreName: buildCloneScoreName(source.scoreName),
    targetObject: source.targetObject,
    filter: source.filter,
    variableMapping: source.variableMapping,
    sampling: source.sampling,
    delay: source.delay,
    timeScope: ["NEW"],
    status: JobConfigState.INACTIVE,
  };
}
