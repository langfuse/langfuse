// This structure is maintained to relate the frontend table definitions with the clickhouse table definitions.
// The frontend only sends the column names to the backend. This needs to be changed in the future to send column IDs.

import { UiColumnMappings } from "../../tableDefinitions";

export const eventsTableNativeUiColumnDefinitions: UiColumnMappings = [
  {
    uiTableName: "Environment",
    uiTableId: "environment",
    clickhouseTableName: "events_proto",
    clickhouseSelect: 'e."environment"',
  },
  {
    uiTableName: "Type",
    uiTableId: "type",
    clickhouseTableName: "events_proto",
    clickhouseSelect: 'e."type"',
  },
  {
    uiTableName: "ID",
    uiTableId: "id",
    clickhouseTableName: "events_proto",
    clickhouseSelect: 'e."span_id"',
  },
  {
    uiTableName: "Name",
    uiTableId: "name",
    clickhouseTableName: "events_proto",
    clickhouseSelect: 'e."name"',
  },
  {
    uiTableName: "Trace ID",
    uiTableId: "traceId",
    clickhouseTableName: "events_proto",
    clickhouseSelect: 'e."trace_id"',
  },

  {
    uiTableName: "Start Time",
    uiTableId: "startTime",
    clickhouseTableName: "events_proto",
    clickhouseSelect: 'e."start_time"',
  },
  {
    uiTableName: "End Time",
    uiTableId: "endTime",
    clickhouseTableName: "events_proto",
    clickhouseSelect: 'e."end_time"',
  },
  {
    uiTableName: "Time To First Token (s)",
    uiTableId: "timeToFirstToken",
    clickhouseTableName: "events_proto",
    clickhouseSelect:
      "if(isNull(e.completion_start_time), NULL,  date_diff('millisecond', e.start_time, e.completion_start_time) / 1000)",
    // If we use the default of Decimal64(12), we cannot filter for more than ~40min due to an overflow
    clickhouseTypeOverwrite: "Decimal64(3)",
  },
  {
    uiTableName: "Latency (s)",
    uiTableId: "latency",
    clickhouseTableName: "events_proto",
    clickhouseSelect:
      "if(isNull(e.end_time), NULL, date_diff('millisecond', e.start_time, e.end_time) / 1000)",
    // If we use the default of Decimal64(12), we cannot filter for more than ~40min due to an overflow
    clickhouseTypeOverwrite: "Decimal64(3)",
  },
  {
    uiTableName: "Tokens per second",
    uiTableId: "tokensPerSecond",
    clickhouseTableName: "events_proto",
    clickhouseSelect:
      "(arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'output') > 0, usage_details))) / (date_diff('millisecond', start_time, end_time) / 1000))",
  },
  {
    uiTableName: "Input Cost ($)",
    uiTableId: "inputCost",
    clickhouseTableName: "events_proto",
    clickhouseSelect:
      "arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'input') > 0, cost_details)))",
  },
  {
    uiTableName: "Output Cost ($)",
    uiTableId: "outputCost",
    clickhouseTableName: "events_proto",
    clickhouseSelect:
      "arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'output') > 0, cost_details)))",
  },
  {
    uiTableName: "Total Cost ($)",
    uiTableId: "totalCost",
    clickhouseTableName: "events_proto",
    clickhouseSelect:
      "if(mapExists((k, v) -> (k = 'total'), cost_details), cost_details['total'], NULL)",
  },
  {
    uiTableName: "Level",
    uiTableId: "level",
    clickhouseTableName: "events_proto",
    clickhouseSelect: 'e."level"',
  },
  {
    uiTableName: "Status Message",
    uiTableId: "statusMessage",
    clickhouseTableName: "events_proto",
    clickhouseSelect: 'e."status_message"',
  },
  {
    uiTableName: "Model",
    uiTableId: "model",
    clickhouseTableName: "events_proto",
    clickhouseSelect: 'e."provided_model_name"',
  },
  {
    uiTableName: "Provided Model Name",
    uiTableId: "providedModelName",
    clickhouseTableName: "events_proto",
    clickhouseSelect: 'e."provided_model_name"',
  },
  {
    uiTableName: "Model ID",
    uiTableId: "modelId",
    clickhouseTableName: "events_proto",
    clickhouseSelect: 'e."model_id"',
  },
  {
    uiTableName: "Input Tokens",
    uiTableId: "inputTokens",
    clickhouseTableName: "events_proto",
    clickhouseSelect:
      "arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'input') > 0, usage_details)))",
    clickhouseTypeOverwrite: "Decimal64(3)",
  },
  {
    uiTableName: "Output Tokens",
    uiTableId: "outputTokens",
    clickhouseTableName: "events_proto",
    clickhouseSelect:
      "arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'output') > 0, usage_details)))",
    clickhouseTypeOverwrite: "Decimal64(3)",
  },
  {
    uiTableName: "Total Tokens",
    uiTableId: "totalTokens",
    clickhouseTableName: "events_proto",
    clickhouseSelect:
      "if(mapExists((k, v) -> (k = 'total'), usage_details), usage_details['total'], NULL)",
    clickhouseTypeOverwrite: "Decimal64(3)",
  },
  {
    uiTableName: "Tokens",
    uiTableId: "tokens",
    clickhouseTableName: "events_proto",
    clickhouseSelect:
      "if(mapExists((k, v) -> (k = 'total'), usage_details), usage_details['total'], NULL)",
    clickhouseTypeOverwrite: "Decimal64(3)",
  },
  {
    uiTableName: "Metadata",
    uiTableId: "metadata",
    clickhouseTableName: "events_proto",
    clickhouseSelect: 'e."metadata"',
  },
  {
    uiTableName: "Version",
    uiTableId: "version",
    clickhouseTableName: "events_proto",
    clickhouseSelect: 'e."version"',
  },
  {
    uiTableName: "Prompt Name",
    uiTableId: "promptName",
    clickhouseTableName: "events_proto",
    clickhouseSelect: "e.prompt_name",
  },
  {
    uiTableName: "Input",
    uiTableId: "input",
    clickhouseTableName: "events_proto",
    clickhouseSelect: "e.input",
  },
  {
    uiTableName: "Output",
    uiTableId: "output",
    clickhouseTableName: "events_proto",
    clickhouseSelect: "e.output",
  },
  {
    uiTableName: "Session ID",
    uiTableId: "sessionId",
    clickhouseTableName: "events_proto",
    clickhouseSelect: 'e."session_id"',
  },
  {
    uiTableName: "Trace Name",
    uiTableId: "traceName",
    clickhouseTableName: "events_proto",
    clickhouseSelect: 'e."trace_name"',
  },
  {
    uiTableName: "User ID",
    uiTableId: "userId",
    clickhouseTableName: "events_proto",
    clickhouseSelect: 'e."user_id"',
  },
  {
    uiTableName: "Trace Tags",
    uiTableId: "traceTags",
    clickhouseTableName: "events_proto",
    clickhouseSelect: 'e."tags"',
  },
  {
    uiTableName: "Tags",
    uiTableId: "tags",
    clickhouseTableName: "events_proto",
    clickhouseSelect: 'e."tags"',
  },
  {
    uiTableName: "Trace Environment",
    uiTableId: "traceEnvironment",
    clickhouseTableName: "events_proto",
    clickhouseSelect: 'e."environment"',
  },
  {
    uiTableName: "Has Parent Observation",
    uiTableId: "hasParentObservation",
    clickhouseTableName: "events_proto",
    clickhouseSelect: "e.parent_span_id != ''",
  },
  {
    uiTableName: "Parent Observation ID",
    uiTableId: "parentObservationId",
    clickhouseTableName: "events_proto",
    clickhouseSelect: 'e."parent_span_id"',
  },
  {
    uiTableName: "Experiment Dataset ID",
    uiTableId: "experimentDatasetId",
    clickhouseTableName: "events_proto",
    clickhouseSelect: 'e."experiment_dataset_id"',
  },
  {
    uiTableName: "Experiment ID",
    uiTableId: "experimentId",
    clickhouseTableName: "events_proto",
    clickhouseSelect: 'e."experiment_id"',
  },
  {
    uiTableName: "Experiment Name",
    uiTableId: "experimentName",
    clickhouseTableName: "events_proto",
    clickhouseSelect: 'e."experiment_name"',
  },
  {
    uiTableName: "Available Tools",
    uiTableId: "toolDefinitions",
    clickhouseTableName: "events_proto",
    clickhouseSelect: "length(mapKeys(e.tool_definitions))",
  },
  {
    uiTableName: "Tool Calls",
    uiTableId: "toolCalls",
    clickhouseTableName: "events_proto",
    clickhouseSelect: "length(e.tool_calls)",
  },
  {
    uiTableName: "Tool Names",
    uiTableId: "toolNames",
    clickhouseTableName: "events_proto",
    clickhouseSelect: "mapKeys(e.tool_definitions)",
  },
  {
    uiTableName: "Called Tool Names",
    uiTableId: "calledToolNames",
    clickhouseTableName: "events_proto",
    clickhouseSelect: "e.tool_call_names",
  },
];

export const eventsTableUiColumnDefinitions: UiColumnMappings = [
  ...eventsTableNativeUiColumnDefinitions,
  // Scores column duplicated to allow renaming column name. Will be removed once session storage cache is outdated
  // Column names are cached in user sessions - changing them breaks existing filters
  {
    uiTableName: "Scores",
    uiTableId: "scores",
    clickhouseTableName: "scores",
    clickhouseSelect: "s.scores_avg",
  },
  {
    uiTableName: "Scores (numeric)",
    uiTableId: "scores_avg",
    clickhouseTableName: "scores",
    clickhouseSelect: "s.scores_avg",
  },
  {
    uiTableName: "Scores (categorical)",
    uiTableId: "score_categories",
    clickhouseTableName: "scores",
    clickhouseSelect: "s.score_categories",
  },
  {
    uiTableName: "Comment Count",
    uiTableId: "commentCount",
    clickhouseTableName: "comments",
    clickhouseSelect: "", // handled by comment filter helpers
  },
  {
    uiTableName: "Comment Content",
    uiTableId: "commentContent",
    clickhouseTableName: "comments",
    clickhouseSelect: "", // handled by comment filter helpers
  },
];
