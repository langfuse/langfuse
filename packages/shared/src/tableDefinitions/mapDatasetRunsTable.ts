import { UiColumnMappings } from "./types";

export const datasetRunsTableUiColumnDefinitions: UiColumnMappings = [
  {
    uiTableName: "Dataset Run ID",
    uiTableId: "id",
    clickhouseTableName: "dataset_run_items_rmt",
    clickhouseSelect: "drm.dataset_run_id",
  },
  {
    uiTableName: "Created At",
    uiTableId: "createdAt",
    clickhouseTableName: "dataset_run_items_rmt",
    clickhouseSelect: "drm.dataset_run_created_at",
  },
  {
    uiTableName: "Scores (numeric)",
    uiTableId: "agg_scores_avg",
    clickhouseTableName: "dataset_run_items_rmt",
    clickhouseSelect: "sa.scores_avg",
  },
  {
    uiTableName: "Scores (categorical)",
    uiTableId: "agg_score_categories",
    clickhouseTableName: "dataset_run_items_rmt",
    clickhouseSelect: "sa.score_categories",
  },
];
