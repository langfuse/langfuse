// The navigation feature's public client surface (RFC rule 8). Named
// re-exports only — the tab helpers other features already imported by
// file path. Pages stay off this door.
export {
  DASHBOARD_TABS,
  getDashboardTabs,
} from "@/src/features/navigation/utils/dashboard-tabs";
export {
  DATASET_ITEM_TABS,
  getDatasetItemTabs,
  type DatasetItemTab,
} from "@/src/features/navigation/utils/dataset-item-tabs";
export {
  DATASET_RUN_COMPARE_TABS,
  getDatasetRunCompareTabs,
} from "@/src/features/navigation/utils/dataset-run-compare-tabs";
export {
  DATASET_TABS,
  getDatasetTabs,
} from "@/src/features/navigation/utils/dataset-tabs";
export {
  EVALS_TABS,
  getEvalsTabs,
} from "@/src/features/navigation/utils/evals-tabs";
export {
  EVALS_V2_TABS,
  getEvalsV2Tabs,
} from "@/src/features/navigation/utils/evals-v2-tabs";
export {
  PROMPT_TABS,
  getPromptTabs,
} from "@/src/features/navigation/utils/prompt-tabs";
export {
  SCORES_TABS,
  getScoresTabs,
} from "@/src/features/navigation/utils/scores-tabs";
export {
  TRACING_TABS,
  getTracingTabs,
} from "@/src/features/navigation/utils/tracing-tabs";
