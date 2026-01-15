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
  {
    name: "Comment Count",
    id: "commentCount",
    type: "number",
    internal: "", // handled by comment filter helpers
  },
  {
    name: "Comment Content",
    id: "commentContent",
    type: "string",
    internal: "", // handled by comment filter helpers
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

// Columns for observation-based eval filtering.
// These are evaluated in-memory against the processed observation record.
// Includes both observation-level fields and trace-level fields extracted from OTEL attributes.
export const evalObservationFilterCols: ColumnDefinition[] = [
  // Observation-level fields
  {
    name: "Type",
    id: "type",
    type: "stringOptions",
    internal: "type",
    options: [{ value: "SPAN" }, { value: "GENERATION" }, { value: "EVENT" }],
  },
  {
    name: "Name",
    id: "name",
    type: "stringOptions",
    internal: "name",
    options: [], // to be filled in at runtime
    nullable: true,
  },
  {
    name: "Model",
    id: "model",
    type: "stringOptions",
    internal: "model",
    options: [], // to be filled in at runtime
    nullable: true,
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
    name: "Metadata",
    id: "metadata",
    type: "stringObject",
    internal: "metadata",
  },
  // Trace-level fields (extracted from OTEL attributes)
  {
    name: "Trace Name",
    id: "trace_name",
    type: "stringOptions",
    internal: "trace_name",
    options: [], // to be filled in at runtime
    nullable: true,
  },
  {
    name: "User ID",
    id: "user_id",
    type: "string",
    internal: "user_id",
    nullable: true,
  },
  {
    name: "Session ID",
    id: "session_id",
    type: "string",
    internal: "session_id",
    nullable: true,
  },
  {
    name: "Tags",
    id: "tags",
    type: "arrayOptions",
    internal: "tags",
    options: [], // to be filled in at runtime
  },
  {
    name: "Release",
    id: "release",
    type: "string",
    internal: "release",
    nullable: true,
  },
];
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

export type ObservationFilterOptions = {
  name?: Array<SingleValueOption>;
  model?: Array<SingleValueOption>;
  trace_name?: Array<SingleValueOption>;
  tags?: Array<SingleValueOption>;
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

export function observationFilterColsWithOptions(
  options?: ObservationFilterOptions,
  cols: ColumnDefinition[] = evalObservationFilterCols,
): ColumnDefinition[] {
  return cols.map((col) => {
    if (col.id === "name") {
      return formatColumnOptions(col, options?.name ?? []);
    }
    if (col.id === "model") {
      return formatColumnOptions(col, options?.model ?? []);
    }
    if (col.id === "trace_name") {
      return formatColumnOptions(col, options?.trace_name ?? []);
    }
    if (col.id === "tags") {
      return formatColumnOptions(col, options?.tags ?? []);
    }
    return col;
  });
}
