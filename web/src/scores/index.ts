// The scores feature's public client surface (RFC rule 8). Named re-exports
// only — the list is exactly what other features already imported, nothing
// added for the future.
//
// score-configs/ScoreConfigDetails stays on the deep path: routing it through
// this index would close a runtime cycle (scores -> score-configs -> scores).
//
// Dual-use modules (aggregateScores, scoreColumns, helpers, scoresSearchRegistry)
// stay a deep import for server callers. This door already carries React UI
// (AnnotationForm, ScoresTable), and routing those files through here would
// pull that UI into tRPC routers. Client importers of the same files come
// through this door; server importers keep the file path.
//
// annotationFormHelpers stays deep: its only external importer is the
// scoreConfigs tRPC router.
export {
  CompareViewAdapter,
  DashboardCategoricalScoreAdapter,
} from "@/src/scores/adapters";
export { AnnotateDrawerController } from "@/src/scores/components/AnnotateDrawerController";
export { AnnotationForm } from "@/src/scores/components/AnnotationForm";
export { ScoreRow } from "@/src/scores/components/ScoreRow";
export { MultiSelectKeyValues } from "@/src/scores/components/multi-select-key-values";
export {
  ScoreCacheProvider,
  type CachedScore,
} from "@/src/scores/contexts/ScoreCacheContext";
export { useEmptyScoreConfigs } from "@/src/scores/hooks/useEmptyConfigs";
export {
  createScoreColumns,
  useScoreColumns,
} from "@/src/scores/hooks/useScoreColumns";
export {
  aggregateScores,
  collectScoreNameCoverage,
  composeAggregateScoreKey,
  decomposeAggregateScoreKey,
  getScoreLabelFromKey,
  normalizeScoreName,
  type ScoreToAggregate,
} from "@/src/scores/lib/aggregateScores";
export {
  isBooleanDataType,
  isCategoricalDataType,
  isNumericDataType,
  isTextDataType,
} from "@/src/scores/lib/helpers";
export {
  hasModifier,
  isCompleteShortcut,
  isInteractiveTarget,
  isOpenDialogPresent,
  isTypingTarget,
} from "@/src/scores/lib/keyboardShortcuts";
export { useMergeScoreColumns } from "@/src/scores/lib/mergeScoreColumns";
export {
  mergeAggregatesWithCache,
  mergeAnnotationScoresWithCache,
  mergeScoresWithCache,
} from "@/src/scores/lib/mergeScoresWithCache";
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
} from "@/src/scores/lib/scoreColumns";
export { transformToAnnotationScores } from "@/src/scores/lib/transformScores";
export { useMergedAggregates } from "@/src/scores/lib/useMergedAggregates";
export { useMergedScores } from "@/src/scores/lib/useMergedScores";
export type {
  AnnotationScore,
  CategoryCounts,
  ChartBin,
  ScoreColumn,
  ScoreData,
  ScoreTarget,
} from "@/src/scores/types";

export { default as ScoresTable } from "@/src/scores/ScoresTable";
