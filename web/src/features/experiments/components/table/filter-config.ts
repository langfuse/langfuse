import {
  omitFilterFacets,
  type FilterConfig,
} from "@/src/features/filters/lib/filter-config";
import type { ColumnDefinition } from "@langfuse/shared";

// Temporary column definitions for experiments
// TODO: Move to shared package once backend is implemented
// Column definitions that match backend experimentCols mapping
// These must align with packages/shared/src/server/tableMappings/mapExperimentTable.ts
export const experimentsTableCols: ColumnDefinition[] = [
  {
    name: "id",
    id: "id",
    type: "string",
    internal: "experiment_id",
  },
  {
    name: "name",
    id: "name",
    type: "string",
    internal: "experiment_name",
  },
  {
    name: "description",
    id: "description",
    type: "string",
    internal: "experiment_description",
    nullable: true,
  },
  {
    name: "metadata",
    id: "metadata",
    type: "stringObject",
    internal: "experiment_metadata",
    nullable: true,
  },
  {
    name: "prompts",
    id: "prompts",
    type: "string",
    internal: "prompts",
    nullable: true,
  },
  {
    name: "experimentDatasetId",
    id: "experimentDatasetId",
    type: "stringOptions",
    internal: "experiment_dataset_id",
    options: [],
  },
  {
    name: "startTime",
    id: "startTime",
    type: "datetime",
    internal: "start_time",
  },
  {
    name: "itemCount",
    id: "itemCount",
    type: "number",
    internal: "item_count",
  },
  {
    name: "totalCost",
    id: "totalCost",
    type: "number",
    internal: "total_cost",
    nullable: true,
  },
  {
    name: "latencyAvg",
    id: "latencyAvg",
    type: "number",
    internal: "latency_avg",
    nullable: true,
  },
  {
    name: "errorCount",
    id: "errorCount",
    type: "number",
    internal: "error_count",
  },
  // Observation-level scores (eos.* alias in backend)
  {
    name: "obs_scores_avg",
    id: "obs_scores_avg",
    type: "numberObject",
    internal: "obs_scores_avg",
  },
  {
    name: "obs_score_categories",
    id: "obs_score_categories",
    type: "categoryOptions",
    internal: "obs_score_categories",
    options: [],
    nullable: true,
  },
  {
    name: "obs_score_booleans",
    id: "obs_score_booleans",
    type: "booleanObject",
    internal: "obs_score_booleans",
    nullable: true,
  },
  // Trace-level scores (ets.* alias in backend)
  {
    name: "trace_scores_avg",
    id: "trace_scores_avg",
    type: "numberObject",
    internal: "trace_scores_avg",
  },
  {
    name: "trace_score_categories",
    id: "trace_score_categories",
    type: "categoryOptions",
    internal: "trace_score_categories",
    options: [],
    nullable: true,
  },
  {
    name: "trace_score_booleans",
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
    },
    {
      type: "numericKeyValue" as const,
      column: "obs_scores_avg",
      label: getExperimentsColumnName("obs_scores_avg"),
    },
    {
      type: "booleanKeyValue" as const,
      column: "obs_score_booleans",
      label: getExperimentsColumnName("obs_score_booleans"),
    },
    // Trace-level scores
    {
      type: "keyValue" as const,
      column: "trace_score_categories",
      label: getExperimentsColumnName("trace_score_categories"),
    },
    {
      type: "numericKeyValue" as const,
      column: "trace_scores_avg",
      label: getExperimentsColumnName("trace_scores_avg"),
    },
    {
      type: "booleanKeyValue" as const,
      column: "trace_score_booleans",
      label: getExperimentsColumnName("trace_score_booleans"),
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
  getLabel: (columnId: string) => string,
  omittedFilter: ExperimentsOmittableFilterColumn[] = [],
): FilterConfig {
  const config = omitFilterFacets(experimentsFilterConfig, omittedFilter);
  return {
    ...config,
    columnDefinitions: config.columnDefinitions.map((column) => ({
      ...column,
      name: getLabel(column.id),
    })),
    facets: config.facets.map((facet) => ({
      ...facet,
      label: getLabel(facet.column),
    })),
  };
}
