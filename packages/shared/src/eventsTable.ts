import { type ColumnDefinition } from "./tableDefinitions";

export const eventsTableHasParentObservationSql = "e.parent_span_id != ''";
export const eventsTableIsRootObservationSql =
  "(e.parent_span_id = '' OR e.is_app_root = true)";
// True when the observation carries input / output. NULL/'' both count as
// absent (NULL != '' is NULL, i.e. not true), so only real payloads match.
export const eventsTableHasInputSql = "e.input != ''";
export const eventsTableHasOutputSql = "e.output != ''";

type MutableDeep<T> = T extends readonly (infer U)[]
  ? MutableDeep<U>[]
  : T extends object
    ? { -readonly [K in keyof T]: MutableDeep<T[K]> }
    : T;

// Column definitions for the ClickHouse events table
// Used for filtering, sorting, and mapping UI columns to ClickHouse columns
const eventsTableColsDefinition = [
  {
    name: "ID",
    id: "id",
    type: "stringOptions",
    internal: "e.span_id",
    options: [], // to be added at runtime
  },
  {
    name: "Trace ID",
    id: "traceId",
    type: "string",
    internal: "e.trace_id",
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
    name: "Trace Name",
    id: "traceName",
    type: "stringOptions",
    internal: "e.trace_name",
    options: [], // to be added at runtime
    nullable: true,
  },
  {
    name: "Level",
    id: "level",
    type: "stringOptions",
    internal: "e.level",
    options: [],
  },
  {
    name: "Status Message",
    id: "statusMessage",
    type: "string",
    internal: "e.status_message",
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
    type: "number",
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
    name: "Cost ($)",
    id: "totalCost",
    type: "number",
    internal:
      "if(mapExists((k, v) -> (k = 'total'), cost_details), cost_details['total'], NULL)",
    nullable: true,
  },
  {
    name: "Input Tokens",
    id: "inputTokens",
    type: "number",
    internal:
      "arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'input') > 0, usage_details)))",
    nullable: true,
  },
  {
    name: "Output Tokens",
    id: "outputTokens",
    type: "number",
    internal:
      "arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'output') > 0, usage_details)))",
    nullable: true,
  },
  {
    name: "Total Tokens",
    id: "totalTokens",
    type: "number",
    internal:
      "if(mapExists((k, v) -> (k = 'total'), usage_details), usage_details['total'], NULL)",
    nullable: true,
  },
  {
    name: "Input Cost ($)",
    id: "inputCost",
    type: "number",
    internal:
      "arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'input') > 0, cost_details)))",
    nullable: true,
  },
  {
    name: "Output Cost ($)",
    id: "outputCost",
    type: "number",
    internal:
      "arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'output') > 0, cost_details)))",
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
      "(arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'output') > 0, usage_details))) / (date_diff('millisecond', start_time, end_time) / 1000))",
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
    name: "Output",
    id: "output",
    type: "string",
    internal: "e.output",
    nullable: true,
  },
  {
    name: "Metadata",
    id: "metadata",
    type: "stringObject",
    internal: "e.metadata",
  },
  {
    name: "Trace Tags",
    id: "traceTags",
    type: "arrayOptions",
    internal: "e.tags",
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
  {
    name: "Scores (boolean)",
    id: "score_booleans",
    type: "booleanObject",
    internal: "score_booleans",
    nullable: true,
  },
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
    options: [], // to be added at runtime
    nullable: true,
  },
  {
    name: "Trace Scores (boolean)",
    id: "trace_score_booleans",
    type: "booleanObject",
    internal: "trace_score_booleans",
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
  {
    name: "Has Parent Observation",
    id: "hasParentObservation",
    type: "boolean",
    internal: eventsTableHasParentObservationSql,
  },
  {
    name: "Is Root Observation",
    id: "isRootObservation",
    type: "boolean",
    internal: eventsTableIsRootObservationSql,
  },
  {
    name: "Has Input",
    id: "hasInput",
    type: "boolean",
    internal: eventsTableHasInputSql,
  },
  {
    name: "Has Output",
    id: "hasOutput",
    type: "boolean",
    internal: eventsTableHasOutputSql,
  },
  {
    name: "Experiment Dataset ID",
    id: "experimentDatasetId",
    type: "stringOptions",
    internal: "e.experiment_dataset_id",
    options: [], // to be added at runtime
    nullable: true,
  },
  {
    name: "Experiment ID",
    id: "experimentId",
    type: "stringOptions",
    internal: "e.experiment_id",
    options: [], // to be added at runtime
    nullable: true,
  },
  {
    name: "Experiment Name",
    id: "experimentName",
    type: "stringOptions",
    internal: "e.experiment_name",
    options: [], // to be added at runtime
    nullable: true,
  },
  {
    name: "Available Tool Names",
    id: "toolNames",
    type: "arrayOptions",
    internal: "mapKeys(e.tool_definitions)",
    options: [],
    nullable: true,
  },
  {
    name: "Called Tool Names",
    id: "calledToolNames",
    type: "arrayOptions",
    internal: "e.tool_call_names",
    options: [],
    nullable: true,
  },
  {
    name: "Available Tools",
    id: "toolDefinitions",
    type: "number",
    internal: "length(mapKeys(e.tool_definitions))",
    nullable: true,
  },
  {
    name: "Tool Calls",
    id: "toolCalls",
    type: "number",
    internal: "length(e.tool_calls)",
    nullable: true,
  },
  {
    name: "Is Experiment Item Root Span",
    id: "isExperimentItemRootSpan",
    type: "boolean",
    internal: "e.experiment_item_root_span_id = e.span_id",
  },
] as const satisfies readonly ColumnDefinition[];

// TODO: Remove MutableDeep once consumers accept readonly column definitions.
export const eventsTableCols =
  eventsTableColsDefinition as unknown as MutableDeep<
    typeof eventsTableColsDefinition
  > &
    ColumnDefinition[];

type EventsTableColumnId = (typeof eventsTableColsDefinition)[number]["id"];

export type NumericEventsTableColumnId = Extract<
  (typeof eventsTableColsDefinition)[number],
  { type: "number" }
>["id"];

export const isNumericEventsTableColumnId = (
  column: EventsTableColumnId,
): column is NumericEventsTableColumnId =>
  eventsTableColsDefinition.some(
    (col) => col.id === column && col.type === "number",
  );

// Subset of columns that are allowed to be used as filters in the MCP observations API
const OBSERVATION_MCP_ALLOWED_EVENTS_TABLE_FILTER_COLUMN_IDS = [
  "id",
  "traceId",
  "startTime",
  "endTime",
  "name",
  "type",
  "environment",
  "version",
  "userId",
  "sessionId",
  "traceName",
  "level",
  "statusMessage",
  "promptName",
  "promptVersion",
  "modelId",
  "providedModelName",
  "totalCost",
  "inputTokens",
  "outputTokens",
  "totalTokens",
  "inputCost",
  "outputCost",
  "latency",
  "timeToFirstToken",
  "input",
  "output",
  "metadata",
  "traceTags",
  "hasParentObservation",
] as const satisfies readonly EventsTableColumnId[];

export type ObservationMcpAllowedEventsTableFilterColumn =
  (typeof OBSERVATION_MCP_ALLOWED_EVENTS_TABLE_FILTER_COLUMN_IDS)[number];

export const OBSERVATION_MCP_ALLOWED_EVENTS_TABLE_FILTER_COLUMNS: ReadonlySet<EventsTableColumnId> =
  new Set(OBSERVATION_MCP_ALLOWED_EVENTS_TABLE_FILTER_COLUMN_IDS);
