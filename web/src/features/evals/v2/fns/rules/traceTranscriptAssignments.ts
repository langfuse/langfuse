/* eslint-disable @repo/export-rules */
import {
  TopicsTargetObject,
  TRACE_TRANSCRIPT_EVAL_COLUMN,
  type EvalTemplateType,
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
 * A trace rule reads only threads: a threads mapping keeps its JSON path, any
 * other variable stays unmapped until the rule maps it.
 */
export function traceTranscriptMapping(mapping: ObservationVariableMapping[]) {
  return mapping.map((entry) =>
    entry.selectedColumnId === TRACE_TRANSCRIPT_EVAL_COLUMN
      ? {
          templateVariable: entry.templateVariable,
          selectedColumnId: TRACE_TRANSCRIPT_EVAL_COLUMN,
          jsonSelector: entry.jsonSelector ?? null,
        }
      : {
          templateVariable: entry.templateVariable,
          selectedColumnId: "",
          jsonSelector: null,
        },
  );
}

/** A trace rule cannot inherit a mapping that reads other fields, so it needs its own threads mapping. */
export function needsTraceMapping(assignment: {
  evaluatorType: EvalTemplateType;
  variableMapping: ObservationVariableMapping[] | null;
  defaultVariableMapping?: ObservationVariableMapping[] | null;
}) {
  // Code evaluators have no user mapping; the server rejects them on trace rules.
  if (assignment.evaluatorType === "CODE") return false;
  return (
    assignment.variableMapping ??
    assignment.defaultVariableMapping ??
    []
  ).some((entry) => entry.selectedColumnId !== TRACE_TRANSCRIPT_EVAL_COLUMN);
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

/** An assignment inherits the evaluator's mapping (null) unless the rule changes it. */
export function traceTranscriptAssignments(
  assignments: {
    evaluatorId: string;
    variableMapping: ObservationVariableMapping[] | null;
    defaultVariableMapping?: ObservationVariableMapping[] | null;
  }[],
) {
  return assignments.map(
    ({ evaluatorId, variableMapping, defaultVariableMapping }) => {
      if (variableMapping === null) return { evaluatorId, variableMapping };
      const mapping = traceTranscriptMapping(variableMapping);
      const inheritsDefault = isEqual(
        mapping,
        traceTranscriptMapping(defaultVariableMapping ?? []),
      );
      return { evaluatorId, variableMapping: inheritsDefault ? null : mapping };
    },
  );
}
