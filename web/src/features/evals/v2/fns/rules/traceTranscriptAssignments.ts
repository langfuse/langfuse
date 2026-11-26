import {
  TopicsTargetObject,
  TRACE_TRANSCRIPT_EVAL_COLUMN,
  type ObservationVariableMapping,
} from "@langfuse/shared";
import isEqual from "lodash/isEqual";

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

function readsOnlyThreads(mapping: ObservationVariableMapping[]) {
  return (
    mapping.length > 0 &&
    mapping.every(
      (entry) => entry.selectedColumnId === TRACE_TRANSCRIPT_EVAL_COLUMN,
    )
  );
}

function mappingFitsTarget(
  mapping: ObservationVariableMapping[],
  targetObject: string,
) {
  if (targetObject === TopicsTargetObject) return readsOnlyThreads(mapping);
  return mapping.every(
    (entry) => entry.selectedColumnId !== TRACE_TRANSCRIPT_EVAL_COLUMN,
  );
}

export type RuleNeedingOverride = ReturnType<
  typeof rulesNeedingOverride
>[number];

/** Rules that inherit an evaluator mapping their target cannot read, so each needs an override. */
export function rulesNeedingOverride(
  evaluatorMapping: ObservationVariableMapping[],
  assignments: {
    variableMapping: ObservationVariableMapping[] | null;
    evaluationRule: {
      id: string;
      name: string;
      targetObject: string;
      enabled: boolean;
    };
  }[],
) {
  return assignments.flatMap(({ variableMapping, evaluationRule }) =>
    variableMapping === null &&
    !mappingFitsTarget(evaluatorMapping, evaluationRule.targetObject)
      ? [
          {
            id: evaluationRule.id,
            name: evaluationRule.name,
            targetObject: evaluationRule.targetObject,
            enabled: evaluationRule.enabled,
          },
        ]
      : [],
  );
}

/**
 * An assignment inherits the evaluator's mapping (null) unless the rule changes it.
 * A mapping that does not read threads cannot be inherited, so it is stored converted.
 */
export function traceTranscriptAssignments(
  assignments: {
    evaluatorId: string;
    variableMapping: ObservationVariableMapping[] | null;
    defaultVariableMapping?: ObservationVariableMapping[] | null;
  }[],
) {
  return assignments.map((assignment) => {
    const defaultMapping = assignment.defaultVariableMapping ?? [];
    const variableMapping = traceTranscriptMapping(
      assignment.variableMapping ?? defaultMapping,
    );
    if (
      readsOnlyThreads(defaultMapping) &&
      isEqual(variableMapping, traceTranscriptMapping(defaultMapping))
    ) {
      return { evaluatorId: assignment.evaluatorId, variableMapping: null };
    }
    return { evaluatorId: assignment.evaluatorId, variableMapping };
  });
}
