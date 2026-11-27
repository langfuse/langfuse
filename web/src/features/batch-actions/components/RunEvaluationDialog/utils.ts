import {
  BatchEvalSourceTable,
  EvalTemplateType,
  extractValueFromObjectAsString,
  zipToolCallsFromRecord,
  type BatchActionQuery,
  type ObservationVariableMapping,
} from "@langfuse/shared";
import { type RouterOutputs } from "@/src/utils/api";

type ObservationPreview = RouterOutputs["observations"]["byId"];
type EventPreview = RouterOutputs["events"]["batchIO"][number];

const PROMPT_PREVIEW_CHAR_LIMIT = 2000;

export function getCreateEvaluatorHref(params: {
  projectId: string;
  forceV3Experience: boolean;
}): string {
  const { projectId, forceV3Experience } = params;

  return forceV3Experience
    ? `/project/${projectId}/evals/legacy`
    : `/project/${projectId}/evals?gallery=open`;
}

function stringifyPreviewValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function renderPromptPreviewFromObservation(params: {
  prompt: string | null | undefined;
  variableMapping: ObservationVariableMapping[];
  observation: ObservationPreview | EventPreview;
}): string {
  const { prompt, variableMapping, observation } = params;

  if (!prompt) {
    return "Template has no prompt.";
  }

  // Both source records carry tool calls in the raw storage shape (name-less
  // JSON strings + parallel names); zip so a toolCalls mapping previews the
  // named objects the evaluator runtime receives. Zipped lazily: this runs
  // per evaluator row per render, and most mappings never reference toolCalls.
  const observationWithToolCalls = variableMapping.some(
    (mapping) => mapping.selectedColumnId === "toolCalls",
  )
    ? { ...observation, toolCalls: zipToolCallsFromRecord(observation) }
    : observation;

  const variableValues = new Map<string, string>();

  for (const mapping of variableMapping) {
    const { value } = extractValueFromObjectAsString(
      observationWithToolCalls,
      mapping.selectedColumnId,
      mapping.jsonSelector ?? undefined,
    );
    variableValues.set(mapping.templateVariable, stringifyPreviewValue(value));
  }

  const renderedPrompt = prompt.replace(/{{([^{}]+)}}/g, (_match, variable) => {
    const variableName = String(variable).trim();
    return variableValues.get(variableName) ?? "";
  });

  return renderedPrompt.length > PROMPT_PREVIEW_CHAR_LIMIT
    ? `${renderedPrompt.slice(0, PROMPT_PREVIEW_CHAR_LIMIT)}...`
    : renderedPrompt;
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
