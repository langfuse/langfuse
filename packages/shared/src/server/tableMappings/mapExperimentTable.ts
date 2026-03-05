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
  {
    uiTableName: "Metadata",
    uiTableId: "metadata",
    clickhouseTableName: "events_proto",
    clickhouseSelect: "experiment_metadata",
    queryPrefix: "e", // StringObjectFilter uses {prefix}.{field}_names/{field}_values for array access
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
    clickhouseSelect: "item_count",
  },
  {
    uiTableName: "Error Count",
    uiTableId: "errorCount",
    clickhouseTableName: "events_proto",
    clickhouseSelect: "error_count",
  },
  // Observation-level scores
  {
    uiTableName: "Scores (numeric)",
    uiTableId: "obs_scores_avg",
    clickhouseTableName: "scores",
    clickhouseSelect: "obs_scores_avg",
  },
  {
    uiTableName: "Scores (categorical)",
    uiTableId: "obs_score_categories",
    clickhouseTableName: "scores",
    clickhouseSelect: "obs_score_categories",
  },
  // Trace-level scores
  {
    uiTableName: "Trace Scores (numeric)",
    uiTableId: "trace_scores_avg",
    clickhouseTableName: "scores",
    clickhouseSelect: "trace_scores_avg",
  },
  {
    uiTableName: "Trace Scores (categorical)",
    uiTableId: "trace_score_categories",
    clickhouseTableName: "scores",
    clickhouseSelect: "trace_score_categories",
  },
  {
    uiTableName: "Start Time",
    uiTableId: "startTime",
    clickhouseTableName: "events_proto",
    clickhouseSelect: "start_time",
  },
];

/**
 * Combined column mappings for experiments (all columns).
 * Used for general column lookups.
 */
export const experimentCols: UiColumnMappings = [
  ...experimentPreAggCols,
  ...experimentPostAggCols,
];

export const experimentTableUiColumnDefinitions: UiColumnMappings = [
  {
    uiTableName: "Has Experiment ID",
    uiTableId: "hasExperimentId",
    clickhouseTableName: "events_proto",
    clickhouseSelect: "e.experiment_id != ''",
  },
  {
    uiTableName: "Experiment ID",
    uiTableId: "experimentId",
    clickhouseTableName: "events_proto",
    clickhouseSelect: 'e."experiment_id"',
  },
  {
    uiTableName: "Start Time",
    uiTableId: "startTime",
    clickhouseTableName: "events_proto",
    clickhouseSelect: "e.start_time",
  },
];
