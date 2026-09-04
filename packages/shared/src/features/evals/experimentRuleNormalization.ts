import type { FilterState } from "../../types";
import { eventsEvalFilterColumns } from "./observationForEval";
import {
  EvalTargetObject,
  type EvalTargetObject as EvalTargetObjectType,
} from "./types";

const EXPERIMENT_ROOT_FILTER_COLUMN = "isExperimentItemRootSpan";

// Persisted dataset evaluators used both the display name and the legacy
// dataset-table id. Keep that storage compatibility independent of UI copy.
const LEGACY_EVENT_FILTER_COLUMN_ALIASES: Readonly<Record<string, string>> = {
  Dataset: "experimentDatasetId",
  datasetId: "experimentDatasetId",
};

const experimentRootFilter = {
  type: "boolean" as const,
  column: EXPERIMENT_ROOT_FILTER_COLUMN,
  operator: "=" as const,
  value: true,
};

export function isExperimentEvaluationRule(params: {
  targetObject: EvalTargetObjectType;
  filter: FilterState;
}) {
  return (
    params.targetObject === EvalTargetObject.EXPERIMENT ||
    params.filter.some(
      (filter) =>
        filter.column === EXPERIMENT_ROOT_FILTER_COLUMN &&
        filter.type === "boolean" &&
        filter.operator === "=" &&
        filter.value === true,
    )
  );
}

export function ensureExperimentRootFilter(filter: FilterState): FilterState {
  return [
    ...filter.filter((entry) => entry.column !== EXPERIMENT_ROOT_FILTER_COLUMN),
    experimentRootFilter,
  ];
}

export function stripExperimentRootFilter(filter: FilterState): FilterState {
  return filter.filter(
    (entry) => entry.column !== EXPERIMENT_ROOT_FILTER_COLUMN,
  );
}

function normalizeEventFilterColumns(filter: FilterState): FilterState {
  return filter.map((entry) => {
    const inputColumn =
      LEGACY_EVENT_FILTER_COLUMN_ALIASES[entry.column] ?? entry.column;
    const column = eventsEvalFilterColumns.find(
      (candidate) =>
        candidate.id === inputColumn ||
        candidate.name === inputColumn ||
        candidate.aliases?.includes(inputColumn),
    );
    return column && column.id !== entry.column
      ? { ...entry, column: column.id }
      : entry;
  });
}

export function normalizeEvaluationRuleTarget(params: {
  targetObject: EvalTargetObjectType;
  filter: FilterState;
}) {
  const normalizedParams =
    params.targetObject === EvalTargetObject.EVENT ||
    params.targetObject === EvalTargetObject.EXPERIMENT
      ? { ...params, filter: normalizeEventFilterColumns(params.filter) }
      : params;

  if (!isExperimentEvaluationRule(normalizedParams)) return normalizedParams;

  return {
    targetObject: EvalTargetObject.EVENT,
    filter: ensureExperimentRootFilter(normalizedParams.filter),
  };
}
