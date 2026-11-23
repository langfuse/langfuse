import {
  TRACE_TRANSCRIPT_EVAL_COLUMN,
  type ObservationVariableMapping,
} from "@langfuse/shared";

/**
 * Every variable of a trace transcript rule reads the threads column. A
 * mapping already on threads keeps its JSON path; any other reads all of it.
 */
export function traceTranscriptMapping(mapping: ObservationVariableMapping[]) {
  return mapping.map((entry) => ({
    templateVariable: entry.templateVariable,
    selectedColumnId: TRACE_TRANSCRIPT_EVAL_COLUMN,
    jsonSelector:
      entry.selectedColumnId === TRACE_TRANSCRIPT_EVAL_COLUMN
        ? (entry.jsonSelector ?? null)
        : null,
  }));
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
