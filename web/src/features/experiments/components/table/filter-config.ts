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
  // Dataset names are unique per project, so the NAME is the canonical filter
  // value: it survives in a URL or saved view as something readable, and the
  // sidebar picker and the search bar can both show the same string. It is
  // translated to `experimentDatasetId` on the way to the query (the dataset
  // name is not a ClickHouse column) — see fns/datasetNameFilter.
  {
    name: "Dataset",
    id: "experimentDatasetName",
    type: "stringOptions",
    internal: "experiment_dataset_id",
    options: [],
  },
  // Still filterable so URLs and saved views written before the switch keep
  // resolving; no longer offered as a facet.
  {
    name: "Dataset ID",
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
  // Level-agnostic scores: one filter per data type that matches a score
  // whether it was recorded on an observation or on the trace. The `obs_*` ids
  // are aliases so existing links and saved views keep resolving — and start
  // matching trace-level scores, which is the fix. The old DISPLAY names are
  // aliases too: a saved view may store a column by its label, and
  // `validateFilters` drops what it cannot resolve.
  {
    name: "Numeric Scores",
    id: "scores_avg",
    type: "numberObject",
    internal: "scores_avg",
    aliases: ["obs_scores_avg", "Scores (numeric)"],
  },
  {
    name: "Categorical Scores",
    id: "score_categories",
    type: "categoryOptions",
    internal: "score_categories",
    options: [],
    nullable: true,
    aliases: ["obs_score_categories", "Scores (categorical)"],
  },
  {
    name: "Boolean Scores",
    id: "score_booleans",
    type: "booleanObject",
    internal: "score_booleans",
    nullable: true,
    aliases: ["obs_score_booleans", "Scores (boolean)"],
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

export const experimentsFilterConfig: FilterConfig = {
  tableName: "experiments",

  columnDefinitions: experimentsTableCols,

  defaultExpanded: ["experimentDatasetName"],

  facets: [
    {
      type: "string" as const,
      column: "name",
      label: getExperimentsColumnName("name"),
    },
    {
      type: "categorical" as const,
      column: "experimentDatasetName",
      label: getExperimentsColumnName("experimentDatasetName"),
    },
    {
      type: "stringKeyValue" as const,
      column: "metadata",
      label: getExperimentsColumnName("metadata"),
    },
    // One facet per score data type. Each offered name is tagged with the
    // level(s) it exists at (ScoreTag), so the distinction stays visible where
    // it is actionable instead of being duplicated across six facets.
    {
      type: "keyValue" as const,
      column: "score_categories",
      label: getExperimentsColumnName("score_categories"),
    },
    {
      type: "numericKeyValue" as const,
      column: "scores_avg",
      label: getExperimentsColumnName("scores_avg"),
    },
    {
      type: "booleanKeyValue" as const,
      column: "score_booleans",
      label: getExperimentsColumnName("score_booleans"),
    },
  ],
};

export type ExperimentsOmittableFilterColumn =
  | "experimentDatasetId"
  | "experimentDatasetName";

export function isExperimentsOmittableFilterColumn(
  column: string,
): column is ExperimentsOmittableFilterColumn {
  return column === "experimentDatasetId";
}

export function getExperimentsFilterConfig(
  omittedFilter: ExperimentsOmittableFilterColumn[] = [],
): FilterConfig {
  // A dataset-scoped page pins `experimentDatasetId`, but the facet it should
  // hide is the name one that replaced it.
  return omitFilterFacets(
    experimentsFilterConfig,
    omittedFilter.map((column) =>
      column === "experimentDatasetId" ? "experimentDatasetName" : column,
    ) as ExperimentsOmittableFilterColumn[],
  );
}
