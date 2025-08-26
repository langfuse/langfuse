import { UiColumnMappings } from "./types";

export const datasetRunsTableUiColumnDefinitions: UiColumnMappings = [
  {
    uiTableName: "Dataset Run ID",
    uiTableId: "id",
    clickhouseTableName: "dataset_run_items",
    clickhouseSelect: "dri.dataset_run_id",
  },
  {
    uiTableName: "Created At",
    uiTableId: "createdAt",
    clickhouseTableName: "dataset_run_items",
    clickhouseSelect: "dri.dataset_run_created_at",
  },
  {
    uiTableName: "Count Run Items",
    uiTableId: "countRunItems",
    clickhouseTableName: "dataset_run_items",
    clickhouseSelect: "count_run_items",
  },
  {
    uiTableName: "Average Latency",
    uiTableId: "avgLatency",
    clickhouseTableName: "dataset_run_items",
    clickhouseSelect: "avg_latency_seconds",
  },
  {
    uiTableName: "Average Total Cost",
    uiTableId: "avgTotalCost",
    clickhouseTableName: "dataset_run_items",
    clickhouseSelect: "avg_total_cost",
  },
  {
    uiTableName: "[Agg] Scores (numeric)",
    uiTableId: "agg_scores_avg",
    clickhouseTableName: "dataset_run_items",
    clickhouseSelect: "sa.scores_avg",
  },
  {
    uiTableName: "[Agg] Scores (categorical)",
    uiTableId: "agg_score_categories",
    clickhouseTableName: "dataset_run_items",
    clickhouseSelect: "sa.score_categories",
  },
  {
    uiTableName: "[Run] Scores (numeric)",
    uiTableId: "run_scores_avg",
    clickhouseTableName: "dataset_run_items",
    clickhouseSelect: "dri.scores_avg",
  },

  {
    uiTableName: "[Run] Scores (categorical)",
    uiTableId: "run_score_categories",
    clickhouseTableName: "dataset_run_items",
    clickhouseSelect: "dri.score_categories",
  },
];
