import { UiColumnMappings } from "../../tableDefinitions";

/**
 * Column mappings for experiment aggregations.
 *
 * For FILTERING: References events table columns (e.*) for WHERE clauses before aggregation
 * For ORDERING: References aggregated output column names for ORDER BY after aggregation
 *
 * The aggregation query produces output columns like experiment_id, experiment_name, created_at, etc.
 * which are the aggregated results from the events table.
 */
export const experimentCols: UiColumnMappings = [
  {
    uiTableName: "ID",
    uiTableId: "id",
    clickhouseTableName: "events_core",
    clickhouseSelect: "experiment_id",
  },
  {
    uiTableName: "Name",
    uiTableId: "name",
    clickhouseTableName: "events_core",
    clickhouseSelect: "experiment_name",
  },
  {
    uiTableName: "Description",
    uiTableId: "description",
    clickhouseTableName: "events_core",
    clickhouseSelect: "experiment_description",
  },
  {
    uiTableName: "Dataset ID",
    uiTableId: "experimentDatasetId",
    clickhouseTableName: "events_core",
    clickhouseSelect: "experiment_dataset_id",
  },
  {
    uiTableName: "Created At",
    uiTableId: "createdAt",
    clickhouseTableName: "events_core",
    clickhouseSelect: "created_at",
  },
  {
    uiTableName: "Updated At",
    uiTableId: "updatedAt",
    clickhouseTableName: "events_core",
    clickhouseSelect: "updated_at",
  },
  {
    uiTableName: "Item Count",
    uiTableId: "itemCount",
    clickhouseTableName: "events_core",
    clickhouseSelect: "item_count",
  },
  {
    uiTableName: "Total Cost ($)",
    uiTableId: "totalCost",
    clickhouseTableName: "events_core",
    clickhouseSelect: "total_cost",
  },
  {
    uiTableName: "Error Count",
    uiTableId: "errorCount",
    clickhouseTableName: "events_core",
    clickhouseSelect: "error_count",
  },
  {
    uiTableName: "Scores (numeric)",
    uiTableId: "scores_avg",
    clickhouseTableName: "scores",
    clickhouseSelect: "scores_avg",
  },
  {
    uiTableName: "Scores (categorical)",
    uiTableId: "score_categories",
    clickhouseTableName: "scores",
    clickhouseSelect: "score_categories",
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
    uiTableName: "Updated At",
    uiTableId: "updatedAt",
    clickhouseTableName: "events_core",
    clickhouseSelect: "e.updated_at",
  },
  {
    uiTableName: "Item Count",
    uiTableId: "itemCount",
    clickhouseTableName: "events_core",
    clickhouseSelect: "e.experiment_item_id",
  },
  {
    uiTableName: "Total Cost ($)",
    uiTableId: "totalCost",
    clickhouseTableName: "events_core",
    clickhouseSelect: "e.total_cost",
  },
  {
    uiTableName: "Error Count",
    uiTableId: "errorCount",
    clickhouseTableName: "events_core",
    clickhouseSelect: "e.level",
  },
];
