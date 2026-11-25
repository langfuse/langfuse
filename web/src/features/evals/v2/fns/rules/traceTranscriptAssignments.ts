import {
  TopicsTargetObject,
  TRACE_TRANSCRIPT_EVAL_COLUMN,
  type ObservationVariableMapping,
} from "@langfuse/shared";

import type { EvaluatorTargetObject } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import type { VariableFieldState } from "@/src/features/evals/v2/types/variableMapping";

/** A trace variable's default binding: the first thread's messages. */
export const TRACE_TRANSCRIPT_DEFAULT_FIELD: VariableFieldState = {
  selectedColumnId: TRACE_TRANSCRIPT_EVAL_COLUMN,
  jsonSelector: "$[0].messages",
};

/**
 * Every variable of a trace rule reads threads: a threads mapping keeps its
 * JSON path, any other reads the first thread's messages.
 */
export function traceTranscriptMapping(mapping: ObservationVariableMapping[]) {
  return mapping.map((entry) => ({
    templateVariable: entry.templateVariable,
    selectedColumnId: TRACE_TRANSCRIPT_EVAL_COLUMN,
    jsonSelector:
      entry.selectedColumnId === TRACE_TRANSCRIPT_EVAL_COLUMN
        ? (entry.jsonSelector ?? null)
        : TRACE_TRANSCRIPT_DEFAULT_FIELD.jsonSelector,
  }));
}

/** The mapping the test panel runs on and a save persists. */
export function variableFieldsForTarget(
  targetObject: EvaluatorTargetObject,
  variableFields: Record<string, VariableFieldState>,
) {
  if (targetObject !== TopicsTargetObject) return variableFields;
  return Object.fromEntries(
    Object.entries(variableFields).map(([variable, field]) => [
      variable,
      field.selectedColumnId === TRACE_TRANSCRIPT_EVAL_COLUMN
        ? field
        : TRACE_TRANSCRIPT_DEFAULT_FIELD,
    ]),
  );
}

export function traceTranscriptAssignments(
  assignments: {
    evaluatorId: string;
    variableMapping: ObservationVariableMapping[] | null;
    defaultVariableMapping?: ObservationVariableMapping[] | null;
  }[],
) {
  return assignments.map((assignment) => ({
    evaluatorId: assignment.evaluatorId,
    variableMapping: traceTranscriptMapping(
      assignment.variableMapping ?? assignment.defaultVariableMapping ?? [],
    ),
  }));
}
