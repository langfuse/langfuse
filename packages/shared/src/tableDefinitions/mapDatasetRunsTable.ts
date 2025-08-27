import { UiColumnMappings } from "./types";

export const datasetRunsTableUiColumnDefinitions: UiColumnMappings = [
  {
    uiTableName: "Dataset Run ID",
    uiTableId: "id",
    clickhouseTableName: "dataset_run_items_rmt",
    clickhouseSelect: "dri.dataset_run_id",
  },
  {
    uiTableName: "Created At",
    uiTableId: "createdAt",
    clickhouseTableName: "dataset_run_items_rmt",
    clickhouseSelect: "dri.dataset_run_created_at",
  },
  {
    uiTableName: "Count Run Items",
    uiTableId: "countRunItems",
    clickhouseTableName: "dataset_run_items_rmt",
    clickhouseSelect: "count_run_items",
  },
  {
    uiTableName: "Average Latency",
    uiTableId: "avgLatency",
    clickhouseTableName: "dataset_run_items_rmt",
    clickhouseSelect: "avg_latency_seconds",
  },
  {
    uiTableName: "Average Total Cost",
    uiTableId: "avgTotalCost",
    clickhouseTableName: "dataset_run_items_rmt",
    clickhouseSelect: "avg_total_cost",
  },
  {
    uiTableName: "[Agg] Scores (numeric)",
    uiTableId: "agg_scores_avg",
    clickhouseTableName: "dataset_run_items_rmt",
    clickhouseSelect: "sa.scores_avg",
  },
  {
    uiTableName: "[Agg] Scores (categorical)",
    uiTableId: "agg_score_categories",
    clickhouseTableName: "dataset_run_items_rmt",
    clickhouseSelect: "sa.score_categories",
  },
];
