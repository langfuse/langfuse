import { UiColumnMappings } from "../../tableDefinitions";

/**
 * Pre-aggregation column mappings for experiments.
 *
 * These columns exist in the raw events table and can be filtered BEFORE
 * the experiment_data CTE aggregation for better query performance.
 *
 * Used for filtering raw events before GROUP BY.
 */
export const experimentPreAggCols: UiColumnMappings = [
  {
    uiTableName: "ID",
    uiTableId: "id",
    clickhouseTableName: "events_proto",
    clickhouseSelect: "e.experiment_id",
  },
  {
    uiTableName: "Name",
    uiTableId: "name",
    clickhouseTableName: "events_proto",
    clickhouseSelect: "e.experiment_name",
  },
  {
    uiTableName: "Description",
    uiTableId: "description",
    clickhouseTableName: "events_proto",
    clickhouseSelect: "e.experiment_description",
  },
  {
    uiTableName: "Dataset ID",
    uiTableId: "experimentDatasetId",
    clickhouseTableName: "events_proto",
    clickhouseSelect: "e.experiment_dataset_id",
  },
  {
    uiTableName: "Start Time",
    uiTableId: "startTime",
    clickhouseTableName: "events_proto",
    clickhouseSelect: "e.start_time",
  },
];

/**
 * Post-aggregation column mappings for experiments.
 *
 * These columns are either:
 * - Computed during aggregation (itemCount, errorCount, metadata)
 * - From joined CTEs (totalCost, latencyAvg from metrics; scores from scores CTE)
 *
 * Table aliases used:
 * - e.* for experiment_data CTE (core experiment info)
 * - em.* for experiment_metrics CTE (cost, latency)
 * - es.* for experiment_scores CTE (scores_avg, score_categories)
 *
 * These aliases must match the CTEQueryBuilder setup in experiments.ts.
 */
export const experimentPostAggCols: UiColumnMappings = [
  {
    uiTableName: "Item Count",
    uiTableId: "itemCount",
    clickhouseTableName: "events_proto",
    clickhouseSelect: "e.item_count",
  },
  {
    uiTableName: "Total Cost ($)",
    uiTableId: "totalCost",
    clickhouseTableName: "events_proto",
    clickhouseSelect: "em.total_cost",
  },
  {
    uiTableName: "Error Count",
    uiTableId: "errorCount",
    clickhouseTableName: "events_proto",
    clickhouseSelect: "e.error_count",
  },
  {
    uiTableName: "Latency (ms)",
    uiTableId: "latencyAvg",
    clickhouseTableName: "events_proto",
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
  {
    uiTableName: "Metadata",
    uiTableId: "metadata",
    clickhouseTableName: "events_proto",
    clickhouseSelect: "e.experiment_metadata",
    queryPrefix: "e", // StringObjectFilter uses {prefix}.metadata_names/metadata_values for array access
  },
];

/**
 * Combined column mappings for experiments (all columns).
 * Use this for ordering and general column lookups.
 */
export const experimentCols: UiColumnMappings = [
  ...experimentPreAggCols,
  ...experimentPostAggCols,
];
