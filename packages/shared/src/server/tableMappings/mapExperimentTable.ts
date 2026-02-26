import { UiColumnMappings } from "../../tableDefinitions";

/**
 * Column mappings for experiment aggregations (post-aggregation filtering/ordering).
 *
 * Table aliases used:
 * - e.* for experiment_data CTE (core experiment info)
 * - em.* for experiment_metrics CTE (cost, latency)
 * - es.* for experiment_scores CTE (scores_avg, score_categories)
 *
 * These aliases must match the CTEQueryBuilder setup in experiments.ts.
 */
export const experimentCols: UiColumnMappings = [
  {
    uiTableName: "ID",
    uiTableId: "id",
    clickhouseTableName: "events_core",
    clickhouseSelect: "e.experiment_id",
  },
  {
    uiTableName: "Name",
    uiTableId: "name",
    clickhouseTableName: "events_core",
    clickhouseSelect: "e.experiment_name",
  },
  {
    uiTableName: "Description",
    uiTableId: "description",
    clickhouseTableName: "events_core",
    clickhouseSelect: "e.experiment_description",
  },
  {
    uiTableName: "Dataset ID",
    uiTableId: "experimentDatasetId",
    clickhouseTableName: "events_core",
    clickhouseSelect: "e.experiment_dataset_id",
  },
  {
    uiTableName: "Created At",
    uiTableId: "createdAt",
    clickhouseTableName: "events_core",
    clickhouseSelect: "e.created_at",
  },
  {
    uiTableName: "Updated At",
    uiTableId: "updatedAt",
    clickhouseTableName: "events_core",
    clickhouseSelect: "e.updated_at",
  },
  {
    uiTableName: "Item Count",
    uiTableId: "itemCount",
    clickhouseTableName: "events_core",
    clickhouseSelect: "e.item_count",
  },
  {
    uiTableName: "Total Cost ($)",
    uiTableId: "totalCost",
    clickhouseTableName: "events_core",
    clickhouseSelect: "em.total_cost",
  },
  {
    uiTableName: "Error Count",
    uiTableId: "errorCount",
    clickhouseTableName: "events_core",
    clickhouseSelect: "e.error_count",
  },
  {
    uiTableName: "Latency (ms)",
    uiTableId: "latencyAvg",
    clickhouseTableName: "events_core",
    clickhouseSelect: "em.latency_avg",
  },
  {
    uiTableName: "Scores (numeric)",
    uiTableId: "scores_avg",
    clickhouseTableName: "scores",
    clickhouseSelect: "es.scores_avg",
  },
  {
    uiTableName: "Scores (categorical)",
    uiTableId: "score_categories",
    clickhouseTableName: "scores",
    clickhouseSelect: "es.score_categories",
  },
];

/**
 * Column mappings for filtering on events table columns BEFORE aggregation.
 * These use the e.* prefix to reference actual events table columns.
 */
export const experimentEventsFilterCols: UiColumnMappings = [
  {
    uiTableName: "ID",
    uiTableId: "id",
    clickhouseTableName: "events_core",
    clickhouseSelect: "e.experiment_id",
  },
  {
    uiTableName: "Name",
    uiTableId: "name",
    clickhouseTableName: "events_core",
    clickhouseSelect: "e.experiment_name",
  },
  {
    uiTableName: "Description",
    uiTableId: "description",
    clickhouseTableName: "events_core",
    clickhouseSelect: "e.experiment_description",
  },
  {
    uiTableName: "Dataset ID",
    uiTableId: "experimentDatasetId",
    clickhouseTableName: "events_core",
    clickhouseSelect: "e.experiment_dataset_id",
  },
  {
    uiTableName: "Created At",
    uiTableId: "createdAt",
    clickhouseTableName: "events_core",
    clickhouseSelect: "e.created_at",
  },
  {
    uiTableName: "Item Count",
    uiTableId: "itemCount",
    clickhouseTableName: "events_core",
    clickhouseSelect: "e.experiment_item_id",
  },
  {
    uiTableName: "Error Count",
    uiTableId: "errorCount",
    clickhouseTableName: "events_core",
    clickhouseSelect: "e.level",
  },
];
