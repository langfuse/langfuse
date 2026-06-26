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
  { id: "id", preAggId: "id", nullable: false },
  { id: "name", preAggId: "name", nullable: true },
  { id: "datasetId", preAggId: "experimentDatasetId", nullable: true },
] as const;

const getPublicApiExperimentFilterColumn = (
  preAggId: (typeof publicApiExperimentFilterColumns)[number]["preAggId"],
) => {
  const column = experimentPreAggCols.find((col) => col.uiTableId === preAggId);
  if (!column) {
    throw new Error(`Unknown experiment pre-aggregation column: ${preAggId}`);
  }
  return column;
};

export const publicApiExperimentSimpleFilterMappings: ApiColumnMapping[] =
  publicApiExperimentFilterColumns.map(({ id, preAggId }) => {
    const column = getPublicApiExperimentFilterColumn(preAggId);

    return {
      id,
      clickhouseSelect: column.clickhouseSelect.replace(/^e\./, ""),
      clickhouseTable: column.clickhouseTableName,
      filterType: "StringOptionsFilter",
      clickhousePrefix: "e",
    };
  });

export const publicApiExperimentColumnMappings: UiColumnMappings =
  publicApiExperimentFilterColumns.map(({ id, preAggId }) => {
    const column = getPublicApiExperimentFilterColumn(preAggId);

    return {
      uiTableName: column.uiTableName,
      uiTableId: id,
      clickhouseTableName: column.clickhouseTableName,
      clickhouseSelect: column.clickhouseSelect,
    };
  });

export const publicApiExperimentColumnDefinitions: ColumnDefinition[] =
  publicApiExperimentFilterColumns.map(({ id, preAggId, nullable }) => {
    const column = getPublicApiExperimentFilterColumn(preAggId);

    return {
      name: column.uiTableName,
      id,
      type: "stringOptions",
      internal: column.clickhouseSelect,
      options: [],
      ...(nullable ? { nullable: true } : {}),
    };
  });
