// Dual-use scores helpers for server callers (RFC rule 8 / rule 10).
// The client door already re-exports these for UI; tRPC routers and public
// API services reach them here so they do not load AnnotationForm / ScoresTable.
export {
  aggregateScores,
  composeAggregateScoreKey,
} from "@/src/scores/lib/aggregateScores";
export {
  isBooleanDataType,
  isNumericDataType,
  isTraceScore,
} from "@/src/scores/lib/helpers";
