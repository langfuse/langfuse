// The navigation feature's public client surface (RFC rule 8). Named
// re-exports only — the tab helpers other features already imported by
// file path. Pages stay off this door.
export {
  DASHBOARD_TABS,
  getDashboardTabs,
} from "@/src/app/shell/navigation/utils/dashboard-tabs";
export {
  DATASET_ITEM_TABS,
  getDatasetItemTabs,
  type DatasetItemTab,
} from "@/src/app/shell/navigation/utils/dataset-item-tabs";
export {
  DATASET_RUN_COMPARE_TABS,
  getDatasetRunCompareTabs,
} from "@/src/app/shell/navigation/utils/dataset-run-compare-tabs";
export {
  DATASET_TABS,
  getDatasetTabs,
} from "@/src/app/shell/navigation/utils/dataset-tabs";
export {
  EVALS_TABS,
  getEvalsTabs,
} from "@/src/app/shell/navigation/utils/evals-tabs";
export {
  EVALS_V2_TABS,
  getEvalsV2Tabs,
} from "@/src/app/shell/navigation/utils/evals-v2-tabs";
export {
  PROMPT_TABS,
  getPromptTabs,
} from "@/src/app/shell/navigation/utils/prompt-tabs";
export {
  SCORES_TABS,
  getScoresTabs,
} from "@/src/app/shell/navigation/utils/scores-tabs";
export {
  TRACING_TABS,
  getTracingTabs,
} from "@/src/app/shell/navigation/utils/tracing-tabs";
