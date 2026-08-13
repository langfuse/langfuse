import type { FilterState } from "../../types";
import {
  EvalTargetObject,
  type EvalTargetObject as EvalTargetObjectType,
} from "./types";

const EXPERIMENT_ROOT_FILTER_COLUMN = "isExperimentItemRootSpan";

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

export function normalizeEvaluationRuleTarget(params: {
  targetObject: EvalTargetObjectType;
  filter: FilterState;
}) {
  if (!isExperimentEvaluationRule(params)) return params;

  return {
    targetObject: EvalTargetObject.EVENT,
    filter: ensureExperimentRootFilter(params.filter),
  };
}
