import {
  omitFilterFacets,
  type FilterConfig,
} from "@/src/features/filters/lib/filter-config";
import type { ColumnDefinition } from "@langfuse/shared";

// The score levels are named after the evaluation context a score was created
// in, matching the score-level vocabulary used everywhere else in the app.
export const OBSERVATION_SCORES_TOOLTIP =
  "Scores whose evaluation context was a single observation inside an experiment item's run.";
export const TRACE_SCORES_TOOLTIP =
  "Scores whose evaluation context was the whole trace of an experiment item's run.";

// Temporary column definitions for experiments
// TODO: Move to shared package once backend is implemented
// Column definitions that match backend experimentCols mapping
// These must align with packages/shared/src/server/tableMappings/mapExperimentTable.ts
export const experimentsTableCols: ColumnDefinition[] = [
  {
    name: "ID",
    id: "id",
    type: "string",
    internal: "experiment_id",
  },
  {
    name: "Name",
    id: "name",
    type: "string",
    internal: "experiment_name",
  },
  {
    name: "Description",
    id: "description",
    type: "string",
    internal: "experiment_description",
    nullable: true,
  },
  {
    name: "Metadata",
    id: "metadata",
    type: "stringObject",
    internal: "experiment_metadata",
    nullable: true,
  },
  {
    name: "Referenced Prompts",
    id: "prompts",
    type: "string",
    internal: "prompts",
    nullable: true,
  },
  {
    name: "Dataset",
    id: "experimentDatasetId",
    type: "stringOptions",
    internal: "experiment_dataset_id",
    options: [],
  },
  {
    name: "Start Time",
    id: "startTime",
    type: "datetime",
    internal: "start_time",
  },
  {
    name: "Item Count",
    id: "itemCount",
    type: "number",
    internal: "item_count",
  },
  {
    name: "Total Cost ($)",
    id: "totalCost",
    type: "number",
    internal: "total_cost",
    nullable: true,
  },
  {
    name: "Latency (s)",
    id: "latencyAvg",
    type: "number",
    internal: "latency_avg",
    nullable: true,
  },
  {
    name: "Error Count",
    id: "errorCount",
    type: "number",
    internal: "error_count",
  },
  // Observation-level scores (eos.* alias in backend)
  {
    name: "Observation Scores (numeric)",
    id: "obs_scores_avg",
    type: "numberObject",
    internal: "obs_scores_avg",
    aliases: ["Scores (numeric)"],
  },
  {
    name: "Observation Scores (categorical)",
    id: "obs_score_categories",
    type: "categoryOptions",
    internal: "obs_score_categories",
    options: [],
    nullable: true,
    aliases: ["Scores (categorical)"],
  },
  {
    name: "Observation Scores (boolean)",
    id: "obs_score_booleans",
    type: "booleanObject",
    internal: "obs_score_booleans",
    nullable: true,
    aliases: ["Scores (boolean)"],
  },
  // Trace-level scores (ets.* alias in backend)
  {
    name: "Trace Scores (numeric)",
    id: "trace_scores_avg",
    type: "numberObject",
    internal: "trace_scores_avg",
  },
  {
    name: "Trace Scores (categorical)",
    id: "trace_score_categories",
    type: "categoryOptions",
    internal: "trace_score_categories",
    options: [],
    nullable: true,
  },
  {
    name: "Trace Scores (boolean)",
    id: "trace_score_booleans",
    type: "booleanObject",
    internal: "trace_score_booleans",
    nullable: true,
  },
];

// Helper function to get column name from experimentsTableCols by ID
export const getExperimentsColumnName = (id: string): string => {
  const column = experimentsTableCols.find((col) => col.id === id);
  if (!column) {
    throw new Error(`Column ${id} not found in experimentsTableCols`);
  }
  return column.name;
};

const experimentsFilterConfig: FilterConfig = {
  tableName: "experiments",

  columnDefinitions: experimentsTableCols,

  defaultExpanded: ["experimentDatasetId"],

  facets: [
    {
      type: "string" as const,
      column: "name",
      label: getExperimentsColumnName("name"),
    },
    {
      type: "categorical" as const,
      column: "experimentDatasetId",
      label: getExperimentsColumnName("experimentDatasetId"),
    },
    {
      type: "stringKeyValue" as const,
      column: "metadata",
      label: getExperimentsColumnName("metadata"),
    },
    // Observation-level scores
    {
      type: "keyValue" as const,
      column: "obs_score_categories",
      label: getExperimentsColumnName("obs_score_categories"),
      tooltip: OBSERVATION_SCORES_TOOLTIP,
    },
    {
      type: "numericKeyValue" as const,
      column: "obs_scores_avg",
      label: getExperimentsColumnName("obs_scores_avg"),
      tooltip: OBSERVATION_SCORES_TOOLTIP,
    },
    {
      type: "booleanKeyValue" as const,
      column: "obs_score_booleans",
      label: getExperimentsColumnName("obs_score_booleans"),
      tooltip: OBSERVATION_SCORES_TOOLTIP,
    },
    // Trace-level scores
    {
      type: "keyValue" as const,
      column: "trace_score_categories",
      label: getExperimentsColumnName("trace_score_categories"),
      tooltip: TRACE_SCORES_TOOLTIP,
    },
    {
      type: "numericKeyValue" as const,
      column: "trace_scores_avg",
      label: getExperimentsColumnName("trace_scores_avg"),
      tooltip: TRACE_SCORES_TOOLTIP,
    },
    {
      type: "booleanKeyValue" as const,
      column: "trace_score_booleans",
      label: getExperimentsColumnName("trace_score_booleans"),
      tooltip: TRACE_SCORES_TOOLTIP,
    },
  ],
};

export type ExperimentsOmittableFilterColumn = "experimentDatasetId";

export function isExperimentsOmittableFilterColumn(
  column: string,
): column is ExperimentsOmittableFilterColumn {
  return column === "experimentDatasetId";
}

export function getExperimentsFilterConfig(
  omittedFilter: ExperimentsOmittableFilterColumn[] = [],
): FilterConfig {
  return omitFilterFacets(experimentsFilterConfig, omittedFilter);
}
