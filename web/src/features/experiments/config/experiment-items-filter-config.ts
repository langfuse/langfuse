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
  // Level-agnostic scores: one filter per data type that matches a score
  // whether it was recorded on the item's root span or on its trace. The
  // `obs_*` ids are aliases so existing links and saved views keep resolving -
  // and start matching trace-level scores, which is the fix. The old DISPLAY
  // names are aliases too: a saved view may store a column by its label, and
  // `validateFilters` drops what it cannot resolve.
  {
    name: "scores_avg",
    id: "scores_avg",
    type: "numberObject",
    internal: "scores_avg",
    aliases: ["obs_scores_avg", "Scores (numeric)"],
  },
  {
    name: "score_categories",
    id: "score_categories",
    type: "categoryOptions",
    internal: "score_categories",
    options: [],
    nullable: true,
    aliases: ["obs_score_categories", "Scores (categorical)"],
  },
  {
    name: "score_booleans",
    id: "score_booleans",
    type: "booleanObject",
    internal: "score_booleans",
    nullable: true,
    aliases: ["obs_score_booleans", "Scores (boolean)"],
  },
  {
    name: "trace_scores_avg",
    id: "trace_scores_avg",
    type: "numberObject",
    internal: "trace_scores_avg",
    aliases: ["Trace Scores (numeric)"],
  },
  {
    name: "trace_score_categories",
    id: "trace_score_categories",
    type: "categoryOptions",
    internal: "trace_score_categories",
    options: [],
    nullable: true,
    aliases: ["Trace Scores (categorical)"],
  },
  {
    name: "trace_score_booleans",
    id: "trace_score_booleans",
    type: "booleanObject",
    internal: "trace_score_booleans",
    nullable: true,
    aliases: ["Trace Scores (boolean)"],
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
      column: "score_categories",
      label: getExperimentItemsColumnName("score_categories"),
    },
    {
      type: "numericKeyValue" as const,
      column: "scores_avg",
      label: getExperimentItemsColumnName("scores_avg"),
    },
    {
      type: "booleanKeyValue" as const,
      column: "score_booleans",
      label: getExperimentItemsColumnName("score_booleans"),
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
