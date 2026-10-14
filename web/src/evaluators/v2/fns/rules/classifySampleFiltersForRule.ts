import {
  EvalTargetObject,
  eventsTableCols,
  validateEvaluatorFiltersForTarget,
  type FilterState,
} from "@langfuse/shared";

const MEASURE_COLUMNS = new Set([
  "latency",
  "timeToFirstToken",
  "tokensPerSecond",
  "inputTokens",
  "outputTokens",
  "totalTokens",
  "inputCost",
  "outputCost",
  "totalCost",
]);
const SCORE_COLUMNS = new Set([
  "scores_avg",
  "score_categories",
  "score_booleans",
  "trace_scores_avg",
  "trace_score_categories",
  "trace_score_booleans",
]);

function unsupportedFilterReason(filter: FilterState[number]) {
  const suffix = "This filter will only be used to select a test observation.";
  if (MEASURE_COLUMNS.has(filter.column)) {
    return `Evaluation rules can't filter by latency, cost, or tokens at the moment. ${suffix}`;
  }
  if (SCORE_COLUMNS.has(filter.column)) {
    return `Evaluation rules can't filter by scores at the moment. ${suffix}`;
  }
  const label =
    eventsTableCols.find((column) => column.id === filter.column)?.name ??
    filter.column;
  return `Evaluation rules can't filter by ${label} at the moment. ${suffix}`;
}

export function classifySampleFiltersForRule(filter: FilterState) {
  const validation = validateEvaluatorFiltersForTarget({
    targetObject: EvalTargetObject.EVENT,
    filter,
  });
  const unsupportedIndexes = new Set(
    validation.issues.flatMap((issue) =>
      issue.index === null ? filter.map((_, index) => index) : [issue.index],
    ),
  );
  const unsupportedReasons = new Map<number, string>();
  for (const index of unsupportedIndexes) {
    const condition = filter[index];
    if (condition) {
      unsupportedReasons.set(index, unsupportedFilterReason(condition));
    }
  }

  return {
    supportedFilters: filter.filter(
      (_, index) => !unsupportedIndexes.has(index),
    ),
    unsupportedReasons,
  };
}
