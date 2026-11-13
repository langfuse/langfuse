import {
  TRACE_TRANSCRIPT_EVAL_COLUMN,
  type ObservationVariableMapping,
} from "@langfuse/shared";

/**
 * A trace transcript rule stores every variable on the threads column. The
 * rule form still edits observation mappings; the writer only accepts threads.
 */
export function traceTranscriptAssignments(
  assignments: {
    evaluatorId: string;
    variableMapping: ObservationVariableMapping[] | null;
    defaultVariableMapping?: ObservationVariableMapping[] | null;
  }[],
) {
  return assignments.map((assignment) => {
    const source =
      assignment.variableMapping ?? assignment.defaultVariableMapping ?? [];
    return {
      evaluatorId: assignment.evaluatorId,
      variableMapping: source.map((mapping) => ({
        templateVariable: mapping.templateVariable,
        selectedColumnId: TRACE_TRANSCRIPT_EVAL_COLUMN,
        jsonSelector: null,
      })),
    };
  });
}
