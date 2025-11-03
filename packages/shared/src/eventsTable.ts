import { ObservationLevelType, ObservationType } from "./domain/observations";
import {
  type SingleValueOption,
  type ColumnDefinition,
  MultiValueOption,
} from "./tableDefinitions";
import { formatColumnOptions } from "./tableDefinitions/typeHelpers";

// Column definitions for the ClickHouse events table
// Used for filtering, sorting, and mapping UI columns to ClickHouse columns
export const eventsTableCols: ColumnDefinition[] = [
  {
    name: "Span ID",
    id: "spanId",
    type: "string",
    internal: "e.span_id",
  },
  {
    name: "Trace ID",
    id: "traceId",
    type: "string",
    internal: "e.trace_id",
  },
  {
    name: "Parent Span ID",
    id: "parentSpanId",
    type: "string",
    internal: "e.parent_span_id",
    nullable: true,
  },
  {
    name: "Start Time",
    id: "startTime",
    type: "datetime",
    internal: "e.start_time",
  },
  {
    name: "End Time",
    id: "endTime",
    type: "datetime",
    internal: "e.end_time",
    nullable: true,
  },
  {
    name: "Name",
    id: "name",
    type: "stringOptions",
    internal: "e.name",
    options: [], // to be added at runtime
    nullable: true,
  },
  {
    name: "Type",
    id: "type",
    type: "stringOptions",
    internal: "e.type",
    options: [],
  },
  {
    name: "Environment",
    id: "environment",
    type: "stringOptions",
    internal: "e.environment",
    options: [], // to be added at runtime
    nullable: true,
  },
  {
    name: "Version",
    id: "version",
    type: "string",
    internal: "e.version",
    nullable: true,
  },
  {
    name: "User ID",
    id: "userId",
    type: "string",
    internal: "e.user_id",
    nullable: true,
  },
  {
    name: "Session ID",
    id: "sessionId",
    type: "string",
    internal: "e.session_id",
    nullable: true,
  },
  {
    name: "Level",
    id: "level",
    type: "stringOptions",
    internal: "e.level",
    options: [
      { value: "DEBUG" },
      { value: "DEFAULT" },
      { value: "WARNING" },
      { value: "ERROR" },
    ] as { value: ObservationLevelType }[],
  },
  {
    name: "Status Message",
    id: "statusMessage",
    type: "string",
    internal: "e.status_message",
    nullable: true,
  },
  {
    name: "Completion Start Time",
    id: "completionStartTime",
    type: "datetime",
    internal: "e.completion_start_time",
    nullable: true,
  },
  {
    name: "Prompt ID",
    id: "promptId",
    type: "string",
    internal: "e.prompt_id",
    nullable: true,
  },
  {
    name: "Prompt Name",
    id: "promptName",
    type: "stringOptions",
    internal: "e.prompt_name",
    options: [], // to be added at runtime
    nullable: true,
  },
  {
    name: "Prompt Version",
    id: "promptVersion",
    type: "string",
    internal: "e.prompt_version",
    nullable: true,
  },
  {
    name: "Model ID",
    id: "modelId",
    type: "stringOptions",
    internal: "e.model_id",
    options: [], // to be added at runtime
    nullable: true,
  },
  {
    name: "Provided Model Name",
    id: "providedModelName",
    type: "stringOptions",
    internal: "e.provided_model_name",
    options: [], // to be added at runtime
    nullable: true,
  },
  {
    name: "Model Parameters",
    id: "modelParameters",
    type: "string",
    internal: "e.model_parameters",
    nullable: true,
  },
  {
    name: "Total Cost ($)",
    id: "totalCost",
    type: "number",
    internal: "e.total_cost",
    nullable: true,
  },
  {
    name: "Input Tokens",
    id: "inputTokens",
    type: "number",
    internal: "e.usage_details.input",
    nullable: true,
  },
  {
    name: "Output Tokens",
    id: "outputTokens",
    type: "number",
    internal: "e.usage_details.output",
    nullable: true,
  },
  {
    name: "Total Tokens",
    id: "totalTokens",
    type: "number",
    internal: "e.usage_details.total",
    nullable: true,
  },
  {
    name: "Input Cost ($)",
    id: "inputCost",
    type: "number",
    internal: "e.cost_details.input",
    nullable: true,
  },
  {
    name: "Output Cost ($)",
    id: "outputCost",
    type: "number",
    internal: "e.cost_details.output",
    nullable: true,
  },
  {
    name: "Latency (s)",
    id: "latency",
    type: "number",
    internal: "date_diff('millisecond', e.start_time, e.end_time) / 1000.0",
    nullable: true,
  },
  {
    name: "Time To First Token (s)",
    id: "timeToFirstToken",
    type: "number",
    internal:
      "date_diff('millisecond', e.start_time, e.completion_start_time) / 1000.0",
    nullable: true,
  },
  {
    name: "Tokens per second",
    id: "tokensPerSecond",
    type: "number",
    internal:
      "e.usage_details.output / (date_diff('millisecond', e.start_time, e.end_time) / 1000.0)",
    nullable: true,
  },
  {
    name: "Input",
    id: "input",
    type: "string",
    internal: "e.input",
    nullable: true,
  },
  {
    name: "Input Truncated",
    id: "inputTruncated",
    type: "string",
    internal: "e.input_truncated",
    nullable: true,
  },
  {
    name: "Output",
    id: "output",
    type: "string",
    internal: "e.output",
    nullable: true,
  },
  {
    name: "Output Truncated",
    id: "outputTruncated",
    type: "string",
    internal: "e.output_truncated",
    nullable: true,
  },
  {
    name: "Metadata",
    id: "metadata",
    type: "stringObject",
    internal: "e.metadata",
  },
  {
    name: "Source",
    id: "source",
    type: "string",
    internal: "e.source",
    nullable: true,
  },
  {
    name: "Service Name",
    id: "serviceName",
    type: "string",
    internal: "e.service_name",
    nullable: true,
  },
  {
    name: "Service Version",
    id: "serviceVersion",
    type: "string",
    internal: "e.service_version",
    nullable: true,
  },
  {
    name: "Scope Name",
    id: "scopeName",
    type: "string",
    internal: "e.scope_name",
    nullable: true,
  },
  {
    name: "Scope Version",
    id: "scopeVersion",
    type: "string",
    internal: "e.scope_version",
    nullable: true,
  },
  {
    name: "Telemetry SDK Language",
    id: "telemetrySdkLanguage",
    type: "string",
    internal: "e.telemetry_sdk_language",
    nullable: true,
  },
  {
    name: "Telemetry SDK Name",
    id: "telemetrySdkName",
    type: "string",
    internal: "e.telemetry_sdk_name",
    nullable: true,
  },
  {
    name: "Telemetry SDK Version",
    id: "telemetrySdkVersion",
    type: "string",
    internal: "e.telemetry_sdk_version",
    nullable: true,
  },
  {
    name: "Trace Name",
    id: "traceName",
    type: "stringOptions",
    internal: "t.name",
    options: [], // to be added at runtime
    nullable: true,
  },
  {
    name: "Trace Tags",
    id: "traceTags",
    type: "arrayOptions",
    internal: "t.tags",
    options: [], // to be added at runtime
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
    options: [], // to be added at runtime
    nullable: true,
  },
];

// Options for filter dropdowns - to be populated at runtime from database
export type EventsTableOptions = {
  name: Array<SingleValueOption>;
  type: Array<SingleValueOption>;
  environment: Array<SingleValueOption>;
  providedModelName: Array<SingleValueOption>;
  modelId: Array<SingleValueOption>;
  promptName: Array<SingleValueOption>;
  traceName: Array<SingleValueOption>;
  traceTags: Array<SingleValueOption>;
  scores_avg: Array<string>;
  score_categories: Array<MultiValueOption>;
};

// Helper function to inject runtime options into column definitions
export function eventsTableColsWithOptions(
  options?: EventsTableOptions,
): ColumnDefinition[] {
  return eventsTableCols.map((col) => {
    if (col.id === "name") {
      return formatColumnOptions(col, options?.name ?? []);
    }
    if (col.id === "type") {
      return formatColumnOptions(col, options?.type ?? []);
    }
    if (col.id === "environment") {
      return formatColumnOptions(col, options?.environment ?? []);
    }
    if (col.id === "providedModelName") {
      return formatColumnOptions(col, options?.providedModelName ?? []);
    }
    if (col.id === "modelId") {
      return formatColumnOptions(col, options?.modelId ?? []);
    }
    if (col.id === "promptName") {
      return formatColumnOptions(col, options?.promptName ?? []);
    }
    if (col.id === "traceName") {
      return formatColumnOptions(col, options?.traceName ?? []);
    }
    if (col.id === "traceTags") {
      return formatColumnOptions(col, options?.traceTags ?? []);
    }
    if (col.id === "scores_avg") {
      return formatColumnOptions(col, options?.scores_avg ?? []);
    }
    if (col.id === "score_categories") {
      return formatColumnOptions(col, options?.score_categories ?? []);
    }
    return col;
  });
}
