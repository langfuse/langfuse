import type {
  ColumnDefinition,
  UiColumnMappings,
} from "../../tableDefinitions";
import type { ApiColumnMapping } from "../queries/public-api-filter-builder";

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
 * Score aggregation column mappings for experiments.
 */
export const experimentScoreAggCols: UiColumnMappings = [
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
  {
    uiTableName: "Scores (boolean)",
    uiTableId: "obs_score_booleans",
    clickhouseTableName: "scores",
    clickhouseSelect: "obs_score_booleans",
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
    uiTableName: "Trace Scores (boolean)",
    uiTableId: "trace_score_booleans",
    clickhouseTableName: "scores",
    clickhouseSelect: "trace_score_booleans",
  },
];

export const experimentOrderByCols: UiColumnMappings = [
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
  ...experimentScoreAggCols,
];

const publicApiExperimentFilterColumns = [
  {
    id: "id",
    uiTableName: "ID",
    clickhouseTableName: "events_proto",
    clickhouseSelect: "experiment_id",
    nullable: false,
  },
  {
    id: "name",
    uiTableName: "Name",
    clickhouseTableName: "events_proto",
    clickhouseSelect: "experiment_name",
    nullable: true,
  },
  {
    id: "datasetId",
    uiTableName: "Dataset ID",
    clickhouseTableName: "events_proto",
    clickhouseSelect: "experiment_dataset_id",
    nullable: true,
  },
] as const;

export const publicApiExperimentSimpleFilterMappings: ApiColumnMapping[] =
  publicApiExperimentFilterColumns.map((column) => ({
    id: column.id,
    clickhouseSelect: column.clickhouseSelect,
    clickhouseTable: column.clickhouseTableName,
    filterType: "StringOptionsFilter",
    clickhousePrefix: "e",
  }));

export const publicApiExperimentColumnMappings: UiColumnMappings =
  publicApiExperimentFilterColumns.map((column) => ({
    uiTableName: column.uiTableName,
    uiTableId: column.id,
    clickhouseTableName: column.clickhouseTableName,
    clickhouseSelect: column.clickhouseSelect,
    queryPrefix: "e",
  }));

export const publicApiExperimentColumnDefinitions: ColumnDefinition[] =
  publicApiExperimentFilterColumns.map((column) => ({
    name: column.uiTableName,
    id: column.id,
    type: "stringOptions",
    internal: column.clickhouseSelect,
    options: [],
    ...(column.nullable ? { nullable: true } : {}),
  }));

const publicApiExperimentItemFilterColumns = [
  {
    id: "experimentId",
    uiTableName: "ID",
    clickhouseTableName: "events_proto",
    clickhouseSelect: "experiment_id",
    nullable: false,
  },
  {
    id: "experimentName",
    uiTableName: "Name",
    clickhouseTableName: "events_proto",
    clickhouseSelect: "experiment_name",
    nullable: true,
  },
  {
    id: "experimentItemId",
    uiTableName: "Experiment Item ID",
    clickhouseTableName: "events_proto",
    clickhouseSelect: "experiment_item_id",
    nullable: false,
  },
  {
    id: "datasetId",
    uiTableName: "Dataset ID",
    clickhouseTableName: "events_proto",
    clickhouseSelect: "experiment_dataset_id",
    nullable: true,
  },
] as const;

export const publicApiExperimentItemSimpleFilterMappings: ApiColumnMapping[] =
  publicApiExperimentItemFilterColumns.map((column) => ({
    id: column.id,
    clickhouseSelect: column.clickhouseSelect,
    clickhouseTable: column.clickhouseTableName,
    filterType: "StringOptionsFilter",
    clickhousePrefix: "e",
  }));

export const publicApiExperimentItemColumnMappings: UiColumnMappings =
  publicApiExperimentItemFilterColumns.map((column) => ({
    uiTableName: column.uiTableName,
    uiTableId: column.id,
    clickhouseTableName: column.clickhouseTableName,
    clickhouseSelect: column.clickhouseSelect,
    queryPrefix: "e",
  }));

export const publicApiExperimentItemColumnDefinitions: ColumnDefinition[] =
  publicApiExperimentItemFilterColumns.map((column) => ({
    name: column.uiTableName,
    id: column.id,
    type: "stringOptions",
    internal: column.clickhouseSelect,
    options: [],
    ...(column.nullable ? { nullable: true } : {}),
  }));
