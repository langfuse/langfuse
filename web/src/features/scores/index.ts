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
} from "@/src/features/scores/adapters";
export { AnnotateDrawerController } from "@/src/features/scores/components/AnnotateDrawerController";
export { AnnotationForm } from "@/src/features/scores/components/AnnotationForm";
export { DualAnnotationContent } from "@/src/features/scores/components/DualAnnotationContent";
export { ScoreRow } from "@/src/features/scores/components/ScoreRow";
export { MultiSelectKeyValues } from "@/src/features/scores/components/multi-select-key-values";
export {
  ScoreCacheProvider,
  useScoreCache,
  type CachedScore,
} from "@/src/features/scores/contexts/ScoreCacheContext";
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
  type ScoreToAggregate,
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
  mergeAggregatesWithCache,
  mergeAnnotationScoresWithCache,
  mergeScoresWithCache,
} from "@/src/features/scores/lib/mergeScoresWithCache";
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
export { transformToAnnotationScores } from "@/src/features/scores/lib/transformScores";
export { useMergedAggregates } from "@/src/features/scores/lib/useMergedAggregates";
export { useMergedScores } from "@/src/features/scores/lib/useMergedScores";
export type {
  AnnotationScore,
  CategoryCounts,
  ChartBin,
  ScoreColumn,
  ScoreData,
  ScoreTarget,
} from "@/src/features/scores/types";

export { default as ScoresTable } from "@/src/features/scores/ScoresTable";
