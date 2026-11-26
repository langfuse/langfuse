import { observationEvalVariableColumns } from "../features/evals/observationForEval";
import {
  TopicsTargetObject,
  TRACE_TRANSCRIPT_EVAL_VARIABLE_COLUMN_ID,
} from "../features/evals/types";

const OBSERVATION_VARIABLE_COLUMN_IDS = observationEvalVariableColumns.map(
  ({ id }) => id,
);

/**
 * Columns a variable mapping can read for an evaluation target. Without a
 * target (evaluator definitions are not bound to one) both observation columns
 * and the transcript column are allowed.
 */
export function getEvalVariableColumnIds(targetObject?: string) {
  if (targetObject === undefined) {
    return [
      ...OBSERVATION_VARIABLE_COLUMN_IDS,
      TRACE_TRANSCRIPT_EVAL_VARIABLE_COLUMN_ID,
    ];
  }
  if (targetObject === TopicsTargetObject) {
    return [TRACE_TRANSCRIPT_EVAL_VARIABLE_COLUMN_ID];
  }
  return OBSERVATION_VARIABLE_COLUMN_IDS;
}
