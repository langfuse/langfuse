// The scores feature's public client surface (RFC rule 8). Named re-exports
// only — the list is exactly what other features already imported, nothing
// added for the future.
//
// score-configs/ScoreConfigDetails stays on the deep path: routing it through
// this index would close a runtime cycle (scores -> score-configs -> scores).
export {
  CompareViewAdapter,
  DashboardCategoricalScoreAdapter,
} from "@/src/features/scores/adapters";
export { AnnotateDrawerController } from "@/src/features/scores/components/AnnotateDrawerController";
export { AnnotationForm } from "@/src/features/scores/components/AnnotationForm";
export { DualAnnotationContent } from "@/src/features/scores/components/DualAnnotationContent";
export { ScoreRow } from "@/src/features/scores/components/ScoreRow";
export { MultiSelectKeyValues } from "@/src/features/scores/components/multi-select-key-values";
export { useEmptyScoreConfigs } from "@/src/features/scores/hooks/useEmptyConfigs";
export {
  createScoreColumns,
  useScoreColumns,
} from "@/src/features/scores/hooks/useScoreColumns";
export {
  aggregateScores,
  collectScoreNameCoverage,
  composeAggregateScoreKey,
  decomposeAggregateScoreKey,
  getScoreLabelFromKey,
  normalizeScoreName,
} from "@/src/features/scores/lib/aggregateScores";
export {
  isBooleanDataType,
  isCategoricalDataType,
  isNumericDataType,
  isTextDataType,
} from "@/src/features/scores/lib/helpers";
export {
  hasModifier,
  isCompleteShortcut,
  isInteractiveTarget,
  isOpenDialogPresent,
  isTypingTarget,
} from "@/src/features/scores/lib/keyboardShortcuts";
export { useMergeScoreColumns } from "@/src/features/scores/lib/mergeScoreColumns";
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
} from "@/src/features/scores/lib/scoreColumns";
export { useMergedAggregates } from "@/src/features/scores/lib/useMergedAggregates";
export { useMergedScores } from "@/src/features/scores/lib/useMergedScores";
export type {
  CategoryCounts,
  ChartBin,
  ScoreColumn,
  ScoreData,
  ScoreTarget,
} from "@/src/features/scores/types";
