import { encodeFiltersGeneric, type FilterState } from "@langfuse/shared";

const DEPRECATED_EVALUATOR_FILTERS: FilterState = [
  {
    column: "target",
    type: "stringOptions",
    operator: "any of",
    value: ["trace", "dataset"],
  },
];

/** Opens the evaluator list with only the deprecated target types visible. */
export function buildDeprecatedEvaluatorsUrl(projectId: string) {
  const filter = encodeURIComponent(
    encodeFiltersGeneric(DEPRECATED_EVALUATOR_FILTERS),
  );

  return `/project/${projectId}/evals?filter=${filter}`;
}

export function buildEvaluatorUpgradeUrl(
  projectId: string,
  evaluatorId: string,
) {
  return `/project/${projectId}/evals/remap?evaluator=${encodeURIComponent(evaluatorId)}`;
}
