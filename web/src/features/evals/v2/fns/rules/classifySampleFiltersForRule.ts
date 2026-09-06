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

type UnsupportedFilterMessages = {
  measures: string;
  scores: string;
  formatColumn: (label: string) => string;
};

const DEFAULT_MESSAGES: UnsupportedFilterMessages = {
  measures:
    "Evaluation rules can't filter by latency, cost, or tokens at the moment. This filter will only be used to select a test observation.",
  scores:
    "Evaluation rules can't filter by scores at the moment. This filter will only be used to select a test observation.",
  formatColumn: (label) =>
    `Evaluation rules can't filter by ${label} at the moment. This filter will only be used to select a test observation.`,
};

function unsupportedFilterReason(
  filter: FilterState[number],
  messages: UnsupportedFilterMessages,
) {
  if (MEASURE_COLUMNS.has(filter.column)) {
    return messages.measures;
  }
  if (SCORE_COLUMNS.has(filter.column)) {
    return messages.scores;
  }
  const label =
    eventsTableCols.find((column) => column.id === filter.column)?.name ??
    filter.column;
  return messages.formatColumn(label);
}

export function classifySampleFiltersForRule(
  filter: FilterState,
  messages = DEFAULT_MESSAGES,
) {
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
      unsupportedReasons.set(
        index,
        unsupportedFilterReason(condition, messages),
      );
    }
  }

  return {
    supportedFilters: filter.filter(
      (_, index) => !unsupportedIndexes.has(index),
    ),
    unsupportedReasons,
  };
}
