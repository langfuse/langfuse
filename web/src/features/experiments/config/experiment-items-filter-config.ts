import type { FilterConfig } from "@/src/features/filters/lib/filter-config";
import type { ColumnDefinition, ObservationLevelType } from "@langfuse/shared";

/**
 * Column definitions for experiment items table.
 * These map to the columns in packages/shared/src/server/tableMappings/mapExperimentItemsTable.ts
 */
export const experimentItemsTableCols: ColumnDefinition[] = [
  {
    name: "id",
    id: "id",
    type: "string",
    internal: "experiment_item_id",
  },
  {
    name: "experimentId",
    id: "experimentId",
    type: "string",
    internal: "experiment_id",
  },
  {
    name: "traceId",
    id: "traceId",
    type: "string",
    internal: "trace_id",
  },
  {
    name: "datasetItemId",
    id: "datasetItemId",
    type: "string",
    internal: "dataset_item_id",
  },
  {
    name: "startTime",
    id: "startTime",
    type: "datetime",
    internal: "start_time",
  },
  {
    name: "level",
    id: "level",
    type: "stringOptions",
    internal: "level",
    options: [
      { value: "DEBUG" },
      { value: "DEFAULT" },
      { value: "WARNING" },
      { value: "ERROR" },
    ] as { value: ObservationLevelType }[],
    aliases: ["Level"],
  },
  {
    name: "totalCost",
    id: "totalCost",
    type: "number",
    internal: "total_cost",
    nullable: true,
  },
  {
    name: "latencyMs",
    id: "latencyMs",
    type: "number",
    internal: "latency_ms",
    nullable: true,
  },
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
  {
    name: "itemMetadata",
    id: "itemMetadata",
    type: "stringObject",
    internal: "itemMetadata",
    nullable: true,
  },
  {
    name: "eventMetadata",
    id: "eventMetadata",
    type: "stringObject",
    internal: "eventMetadata",
    nullable: true,
  },
];

/**
 * Helper function to get column name from experimentItemsTableCols by ID
 */
export const getExperimentItemsColumnName = (id: string): string => {
  const column = experimentItemsTableCols.find((col) => col.id === id);
  if (!column) {
    throw new Error(`Column ${id} not found in experimentItemsTableCols`);
  }
  return column.name;
};

/**
 * Filter configuration for experiment items table.
 * Defines available sidebar filters and their types.
 */
const experimentItemsFilterConfig: FilterConfig = {
  tableName: "experiment-items",

  columnDefinitions: experimentItemsTableCols,

  facets: [
    {
      type: "stringKeyValue" as const,
      column: "itemMetadata",
      label: getExperimentItemsColumnName("itemMetadata"),
    },
    {
      type: "stringKeyValue" as const,
      column: "eventMetadata",
      label: getExperimentItemsColumnName("eventMetadata"),
    },
    {
      type: "keyValue" as const,
      column: "obs_score_categories",
      label: getExperimentItemsColumnName("obs_score_categories"),
    },
    {
      type: "numericKeyValue" as const,
      column: "obs_scores_avg",
      label: getExperimentItemsColumnName("obs_scores_avg"),
    },
    {
      type: "booleanKeyValue" as const,
      column: "obs_score_booleans",
      label: getExperimentItemsColumnName("obs_score_booleans"),
    },
    {
      type: "keyValue" as const,
      column: "trace_score_categories",
      label: getExperimentItemsColumnName("trace_score_categories"),
    },
    {
      type: "numericKeyValue" as const,
      column: "trace_scores_avg",
      label: getExperimentItemsColumnName("trace_scores_avg"),
    },
    {
      type: "booleanKeyValue" as const,
      column: "trace_score_booleans",
      label: getExperimentItemsColumnName("trace_score_booleans"),
    },
  ],
};

export const getExperimentItemsFilterConfig = (
  getLabel: (columnId: string) => string,
): FilterConfig => ({
  ...experimentItemsFilterConfig,
  columnDefinitions: experimentItemsFilterConfig.columnDefinitions.map(
    (column) => ({ ...column, name: getLabel(column.id) }),
  ),
  facets: experimentItemsFilterConfig.facets.map((facet) => ({
    ...facet,
    label: getLabel(facet.column),
  })),
});
