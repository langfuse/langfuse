import {
  BatchEvalSourceTable,
  EvalTemplateType,
  type BatchActionQuery,
  type ObservationVariableMapping,
} from "@langfuse/shared";

export function getCreateEvaluatorHref(projectId: string): string {
  return `/project/${projectId}/evals?gallery=open`;
}

/**
 * Observations this batch will score, or null when the count cannot be known
 * up front (experiment-scoped runs).
 *
 * `displayCount` is already the observation count for experiment items:
 * callers expand selected rows / select-all totals across experiments.
 */
export function getBatchEvalCostObservationCount(params: {
  displayCount: number;
  sourceTable: BatchEvalSourceTable;
}): number | null {
  const { displayCount, sourceTable } = params;
  if (sourceTable === BatchEvalSourceTable.EXPERIMENTS) {
    return null;
  }
  return displayCount;
}

export function hasCompleteBatchEvalMappings(
  assignments: Array<{
    evaluatorType: EvalTemplateType;
    variableMapping: ObservationVariableMapping[] | null;
    defaultVariableMapping: ObservationVariableMapping[];
    requiredVariables?: string[];
  }>,
): boolean {
  return assignments.every((assignment) => {
    if (assignment.evaluatorType === EvalTemplateType.CODE) {
      return true;
    }
    const mapping =
      assignment.variableMapping ?? assignment.defaultVariableMapping;
    const mappedVariables = new Set(
      mapping
        .filter((entry) => Boolean(entry.selectedColumnId?.trim()))
        .map((entry) => entry.templateVariable),
    );
    const requiredVariables = assignment.requiredVariables ?? [];
    if (requiredVariables.length > 0) {
      return requiredVariables.every((variable) =>
        mappedVariables.has(variable),
      );
    }
    return mapping.every((entry) => Boolean(entry.selectedColumnId?.trim()));
  });
}

export function buildQueryWithSelectedIds(params: {
  query: BatchActionQuery;
  selectAll: boolean;
  selectedObservationIds: string[];
}): BatchActionQuery {
  const { query, selectAll, selectedObservationIds } = params;

  if (selectAll) {
    return query;
  }

  return {
    ...query,
    filter: [
      ...(query.filter ?? []),
      {
        column: "id",
        operator: "any of" as const,
        value: selectedObservationIds,
        type: "stringOptions" as const,
      },
    ],
  };
}
