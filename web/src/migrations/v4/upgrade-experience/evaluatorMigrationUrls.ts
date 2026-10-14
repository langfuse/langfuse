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

const DEPRECATED_RULE_FILTERS: FilterState = [
  {
    column: "upgradeRequired",
    type: "boolean",
    operator: "=",
    value: true,
  },
];

function buildLegacyEvaluatorListUrl(projectId: string, filter: FilterState) {
  return `/project/${projectId}/evals/legacy?filter=${encodeURIComponent(
    encodeFiltersGeneric(filter),
  )}`;
}

/** Opens the evaluator list with only the deprecated target types visible. */
export function buildDeprecatedEvaluatorsUrl(projectId: string) {
  return buildLegacyEvaluatorListUrl(projectId, DEPRECATED_EVALUATOR_FILTERS);
}

/** Opens the rules table with only active legacy rules that process new data. */
export function buildDeprecatedRulesUrl(projectId: string) {
  return `/project/${projectId}/evals/rules?filter=${encodeURIComponent(
    encodeFiltersGeneric(DEPRECATED_RULE_FILTERS),
  )}`;
}

/** Opens the evaluator list with only active observation and experiment targets visible. */
export function buildModernEvaluatorsUrl(projectId: string) {
  return `/project/${projectId}/evals`;
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
