import {
  type ColumnDefinition,
  type MultiValueOption,
  type ObservationLevelType,
  type SingleValueOption,
} from "..";
import { formatColumnOptions } from "./typeHelpers";

export const tracesOnlyCols: ColumnDefinition[] = [
  {
    name: "⭐️",
    id: "bookmarked",
    type: "boolean",
    internal: "t.bookmarked",
  },
  { name: "ID", id: "id", type: "string", internal: "t.id" },
  {
    name: "Name",
    id: "name",
    type: "stringOptions",
    internal: 't."name"',
    options: [], // to be filled in at runtime
    nullable: true,
  },
  {
    name: "Environment",
    id: "environment",
    type: "stringOptions",
    internal: 't."environment"',
    options: [], // to be filled in at runtime
  },
  {
    name: "Timestamp",
    id: "timestamp",
    type: "datetime",
    internal: 't."timestamp"',
  },
  {
    name: "User ID",
    id: "userId",
    type: "string",
    internal: 't."user_id"',
    nullable: true,
  },
  {
    name: "Session ID",
    id: "sessionId",
    type: "string",
    internal: 't."session_id"',
    nullable: true,
  },
  {
    name: "Metadata",
    id: "metadata",
    type: "stringObject",
    internal: 't."metadata"',
  },
  {
    name: "Version",
    id: "version",
    type: "string",
    internal: 't."version"',
    nullable: true,
  },
  {
    name: "Release",
    id: "release",
    type: "string",
    internal: 't."release"',
    nullable: true,
  },
  {
    name: "Level",
    id: "level",
    type: "stringOptions",
    internal: '"level"',
    options: [
      { value: "DEBUG" },
      { value: "DEFAULT" },
      { value: "WARNING" },
      { value: "ERROR" },
    ] as { value: ObservationLevelType }[],
  },
  {
    name: "Tags",
    id: "tags",
    type: "arrayOptions",
    internal: 't."tags"',
    options: [], // to be filled in at runtime
  },
];
export const tracesTableCols: ColumnDefinition[] = [
  ...tracesOnlyCols,
  {
    name: "Input Tokens",
    id: "inputTokens",
    type: "number",
    internal: 'generation_metrics."promptTokens"',
    nullable: true,
  },
  {
    name: "Output Tokens",
    id: "outputTokens",
    type: "number",
    internal: 'generation_metrics."completionTokens"',
    nullable: true,
  },
  {
    name: "Error Level Count",
    id: "errorCount",
    type: "number",
    internal: 'generation_metrics."errorCount"',
  },
  {
    name: "Warning Level Count",
    id: "warningCount",
    type: "number",
    internal: 'generation_metrics."warningCount"',
  },
  {
    name: "Default Level Count",
    id: "defaultCount",
    type: "number",
    internal: 'generation_metrics."defaultCount"',
  },
  {
    name: "Debug Level Count",
    id: "debugCount",
    type: "number",
    internal: 'generation_metrics."debugCount"',
  },
  {
    name: "Total Tokens",
    id: "totalTokens",
    type: "number",
    internal: 'generation_metrics."totalTokens"',
    nullable: true,
  },
  {
    name: "Tokens",
    id: "tokens",
    type: "number",
    internal: 'generation_metrics."totalTokens"',
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
    options: [], // to be filled in at runtime
    nullable: true,
  },
  {
    name: "Latency (s)",
    id: "latency",
    type: "number",
    internal: "observation_metrics.latency",
  },
  {
    name: "Input Cost ($)",
    id: "inputCost",
    type: "number",
    internal: '"calculatedInputCost"',
    nullable: true,
  },
  {
    name: "Output Cost ($)",
    id: "outputCost",
    type: "number",
    internal: '"calculatedOutputCost"',
    nullable: true,
  },
  {
    name: "Total Cost ($)",
    id: "totalCost",
    type: "number",
    internal: '"calculatedTotalCost"',
    nullable: true,
  },
];

export const datasetCol: ColumnDefinition = {
  name: "Dataset",
  id: "datasetId",
  type: "stringOptions",
  internal: 'di."dataset_id"',
  options: [], // to be filled in at runtime
};

// Used only for dataset evaluator, not on dataset table
export const datasetOnlyCols: ColumnDefinition[] = [datasetCol];

export const evalTraceTableCols: ColumnDefinition[] = tracesOnlyCols;
export const evalDatasetFormFilterCols: ColumnDefinition[] = datasetOnlyCols;
export type TraceOptions = {
  scores_avg?: Array<string>;
  score_categories?: Array<MultiValueOption>;
  name?: Array<SingleValueOption>;
  tags?: Array<SingleValueOption>;
  environment?: Array<SingleValueOption>;
};
export type DatasetOptions = {
  datasetId: Array<SingleValueOption>;
};

// Used only for dataset evaluator, not on dataset table
export function datasetFormFilterColsWithOptions(
  options?: DatasetOptions,
  cols: ColumnDefinition[] = evalDatasetFormFilterCols,
): ColumnDefinition[] {
  return cols.map((col) => {
    if (col.id === "datasetId") {
      return formatColumnOptions(col, options?.datasetId ?? []);
    }
    return col;
  });
}

export function tracesTableColsWithOptions(
  options?: TraceOptions,
  cols: ColumnDefinition[] = tracesTableCols,
): ColumnDefinition[] {
  return cols.map((col) => {
    if (col.id === "scores_avg") {
      return formatColumnOptions(col, options?.scores_avg ?? []);
    }
    if (col.id === "name") {
      return formatColumnOptions(col, options?.name ?? []);
    }
    if (col.id === "tags") {
      return formatColumnOptions(col, options?.tags ?? []);
    }
    if (col.id === "environment") {
      return formatColumnOptions(col, options?.environment ?? []);
    }
    if (col.id === "score_categories") {
      return formatColumnOptions(col, options?.score_categories ?? []);
    }
    return col;
  });
}
