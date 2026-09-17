// The scores feature's public client surface (RFC rule 8). Named re-exports
// only — the list is exactly what other features already imported, nothing
// added for the future.
//
// score-configs/ScoreConfigDetails stays on the deep path: routing it through
// this index would close a runtime cycle (scores -> score-configs -> scores).
export {
  CompareViewAdapter,
  DashboardCategoricalScoreAdapter,
} from "./adapters";
export { AnnotateDrawerController } from "./components/AnnotateDrawerController";
export { AnnotationForm } from "./components/AnnotationForm";
export { DualAnnotationContent } from "./components/DualAnnotationContent";
export { ScoreRow } from "./components/ScoreRow";
export { MultiSelectKeyValues } from "./components/multi-select-key-values";
export { useEmptyScoreConfigs } from "./hooks/useEmptyConfigs";
export { createScoreColumns, useScoreColumns } from "./hooks/useScoreColumns";
export {
  collectScoreNameCoverage,
  composeAggregateScoreKey,
  decomposeAggregateScoreKey,
  getScoreLabelFromKey,
  normalizeScoreName,
} from "./lib/aggregateScores";
export {
  isBooleanDataType,
  isCategoricalDataType,
  isNumericDataType,
  isTextDataType,
} from "./lib/helpers";
export {
  hasModifier,
  isCompleteShortcut,
  isInteractiveTarget,
  isOpenDialogPresent,
  isTypingTarget,
} from "./lib/keyboardShortcuts";
export { useMergeScoreColumns } from "./lib/mergeScoreColumns";
export {
  addPrefixToScoreKeys,
  collectPresentScoreKeys,
  convertScoreColumnsToAnalyticsData,
  getScoreDataTypeExplanation,
  getScoreDataTypeIcon,
  revealScoreColumns,
  scoreFilters,
  splitScoreDataTypeIcon,
  withPresentScoreKeys,
} from "./lib/scoreColumns";
export { useMergedAggregates } from "./lib/useMergedAggregates";
export { useMergedScores } from "./lib/useMergedScores";
export type {
  CategoryCounts,
  ChartBin,
  ScoreColumn,
  ScoreData,
  ScoreTarget,
} from "./types";
