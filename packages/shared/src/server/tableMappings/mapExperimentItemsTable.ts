import { UiColumnMappings } from "../../tableDefinitions";

/**
 * Pre-aggregation column mappings for experiment items.
 *
 * These columns exist in the raw events table and can be filtered BEFORE
 * any aggregation for better query performance.
 *
 * Table alias: e.* for events_core table
 */
export const experimentItemPreAggCols: UiColumnMappings = [
  {
    uiTableName: "Experiment Item ID",
    uiTableId: "experimentItemId",
    clickhouseTableName: "events_core",
    clickhouseSelect: "e.experiment_item_id",
  },
  {
    uiTableName: "Experiment ID",
    uiTableId: "experimentId",
    clickhouseTableName: "events_core",
    clickhouseSelect: "e.experiment_id",
  },
  {
    uiTableName: "Trace ID",
    uiTableId: "traceId",
    clickhouseTableName: "events_core",
    clickhouseSelect: "e.trace_id",
  },
  {
    uiTableName: "Created At",
    uiTableId: "createdAt",
    clickhouseTableName: "events_core",
    clickhouseSelect: "e.created_at",
  },
];

/**
 * Post-aggregation column mappings for experiment items.
 *
 * These columns are either:
 * - Computed during aggregation (hasError)
 * - From joined CTEs (totalCost, latencyMs from metrics; scores from scores CTE)
 *
 * Table aliases used:
 * - e.* for experiment_items CTE (core item info)
 * - im.* for item_metrics CTE (cost, latency)
 * - is.* for item_scores CTE (scores_avg, score_categories)
 */
export const experimentItemPostAggCols: UiColumnMappings = [
  {
    uiTableName: "Total Cost ($)",
    uiTableId: "totalCost",
    clickhouseTableName: "events_core",
    clickhouseSelect: "im.total_cost",
  },
  {
    uiTableName: "Latency (ms)",
    uiTableId: "latencyMs",
    clickhouseTableName: "events_core",
    clickhouseSelect: "im.latency_ms",
  },
  {
    uiTableName: "Scores (numeric)",
    uiTableId: "scores_avg",
    clickhouseTableName: "scores",
    clickhouseSelect: "is.scores_avg",
  },
  {
    uiTableName: "Scores (categorical)",
    uiTableId: "score_categories",
    clickhouseTableName: "scores",
    clickhouseSelect: "is.score_categories",
  },
  {
    uiTableName: "Item Metadata",
    uiTableId: "itemMetadata",
    clickhouseTableName: "events_core",
    clickhouseSelect: "e.item_metadata",
    queryPrefix: "e", // StringObjectFilter uses {prefix}.item_metadata_names/item_metadata_values for array access
  },
];

/**
 * Combined column mappings for experiment items (all columns).
 * Use this for ordering and general column lookups.
 */
export const experimentItemCols: UiColumnMappings = [
  ...experimentItemPreAggCols,
  ...experimentItemPostAggCols,
];
