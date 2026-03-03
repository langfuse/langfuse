import type { FilterConfig } from "@/src/features/filters/lib/filter-config";
import type { ColumnToBackendKeyMap } from "@/src/features/filters/lib/filter-transform";
import type { ColumnDefinition, ObservationLevelType } from "@langfuse/shared";

/**
 * Column definitions for experiment items table.
 * These map to the columns in packages/shared/src/server/tableMappings/mapExperimentItemsTable.ts
 */
export const experimentItemsTableCols: ColumnDefinition[] = [
  {
    name: "Experiment Item ID",
    id: "id",
    type: "string",
    internal: "experiment_item_id",
  },
  {
    name: "Experiment ID",
    id: "experimentId",
    type: "string",
    internal: "experiment_id",
  },
  {
    name: "Trace ID",
    id: "traceId",
    type: "string",
    internal: "trace_id",
  },
  {
    name: "Dataset Item ID",
    id: "datasetItemId",
    type: "string",
    internal: "dataset_item_id",
  },
  {
    name: "Start Time",
    id: "startTime",
    type: "datetime",
    internal: "start_time",
  },
  {
    name: "Level",
    id: "level",
    type: "stringOptions",
    internal: "level",
    options: [
      { value: "DEBUG" },
      { value: "DEFAULT" },
      { value: "WARNING" },
      { value: "ERROR" },
    ] as { value: ObservationLevelType }[],
  },
  {
    name: "Total Cost ($)",
    id: "totalCost",
    type: "number",
    internal: "total_cost",
    nullable: true,
  },
  {
    name: "Latency (ms)",
    id: "latencyMs",
    type: "number",
    internal: "latency_ms",
    nullable: true,
  },
  {
    name: "Scores (numeric)",
    id: "scores_avg",
    type: "numberObject",
    internal: "scores_avg",
  },
  {
    name: "Scores (categorical)",
    id: "score_categories",
    type: "categoryOptions",
    internal: "score_categories",
    options: [],
    nullable: true,
  },
  {
    name: "Item Metadata",
    id: "itemMetadata",
    type: "stringObject",
    internal: "item_metadata",
    nullable: true,
  },
  {
    name: "Metadata",
    id: "eventMetadata",
    type: "stringObject",
    internal: "metadata",
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
export const experimentItemsFilterConfig: FilterConfig = {
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
  ],
};
