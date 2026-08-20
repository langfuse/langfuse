import { encodeFiltersGeneric, type FilterState } from "@langfuse/shared";

const DEPRECATED_EVALUATOR_FILTERS: FilterState = [
  {
    column: "status",
    type: "stringOptions",
    operator: "any of",
    value: ["ACTIVE", "PAUSED"],
  },
  {
    column: "target",
    type: "stringOptions",
    operator: "any of",
    value: ["trace", "dataset"],
  },
  {
    column: "timeScope",
    type: "arrayOptions",
    operator: "any of",
    value: ["NEW"],
  },
];

const MODERN_EVALUATOR_FILTERS: FilterState = [
  {
    column: "status",
    type: "stringOptions",
    operator: "any of",
    value: ["ACTIVE"],
  },
  {
    column: "target",
    type: "stringOptions",
    operator: "any of",
    // The UI calls `event` evaluators observations.
    value: ["event", "experiment"],
  },
];

function buildEvaluatorListUrl(projectId: string, filter: FilterState) {
  return `/project/${projectId}/evals?filter=${encodeURIComponent(
    encodeFiltersGeneric(filter),
  )}`;
}

/** Opens the evaluator list with only the deprecated target types visible. */
export function buildDeprecatedEvaluatorsUrl(projectId: string) {
  return buildEvaluatorListUrl(projectId, DEPRECATED_EVALUATOR_FILTERS);
}

/** Opens the evaluator list with only active observation and experiment targets visible. */
export function buildModernEvaluatorsUrl(projectId: string) {
  return buildEvaluatorListUrl(projectId, MODERN_EVALUATOR_FILTERS);
}

export function buildEvaluatorUpgradeUrl(
  projectId: string,
  evaluatorId: string,
  returnFilter?: string,
) {
  const filterQuery = returnFilter
    ? `&returnFilter=${encodeURIComponent(returnFilter)}`
    : "";
  return `/project/${projectId}/evals/remap?evaluator=${encodeURIComponent(evaluatorId)}${filterQuery}`;
}
