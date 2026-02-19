// This structure is maintained to relate the frontend table definitions with the clickhouse table definitions.
// The frontend only sends the column names to the backend. This needs to be changed in the future to send column IDs.

import { UiColumnMappings } from "../../tableDefinitions";

export const observationsTableTraceUiColumnDefinitions: UiColumnMappings = [
  {
    uiTableName: "Trace Tags",
    uiTableId: "traceTags",
    clickhouseTableName: "traces",
    clickhouseSelect: "t.tags",
  },
  {
    uiTableName: "User ID",
    uiTableId: "userId",
    clickhouseTableName: "traces",
    clickhouseSelect: 't."user_id"',
  },
  {
    uiTableName: "Session ID",
    uiTableId: "sessionId",
    clickhouseTableName: "traces",
    clickhouseSelect: 't."session_id"',
  },
  {
    uiTableName: "Trace Name",
    uiTableId: "traceName",
    clickhouseTableName: "traces",
    clickhouseSelect: 't."name"',
  },
  {
    uiTableName: "Trace Environment",
    uiTableId: "traceEnvironment",
    clickhouseTableName: "traces",
    clickhouseSelect: 't."environment"',
  },
];

export const observationsTableUiColumnDefinitions: UiColumnMappings = [
  ...observationsTableTraceUiColumnDefinitions,
  {
    uiTableName: "Environment",
    uiTableId: "environment",
    clickhouseTableName: "observations",
    clickhouseSelect: 'o."environment"',
  },
  {
    uiTableName: "type",
    uiTableId: "type",
    clickhouseTableName: "observations",
    clickhouseSelect: 'o."type"',
  },
  {
    uiTableName: "ID",
    uiTableId: "id",
    clickhouseTableName: "observations",
    clickhouseSelect: 'o."id"',
  },
  {
    uiTableName: "Type",
    uiTableId: "type",
    clickhouseTableName: "observations",
    clickhouseSelect: 'o."type"',
  },
  {
    uiTableName: "Name",
    uiTableId: "name",
    clickhouseTableName: "observations",
    clickhouseSelect: 'o."name"',
  },
  {
    uiTableName: "Trace ID",
    uiTableId: "traceId",
    clickhouseTableName: "observations",
    clickhouseSelect: 'o."trace_id"',
  },
  {
    uiTableName: "Parent Observation ID",
    uiTableId: "parentObservationId",
    clickhouseTableName: "observations",
    clickhouseSelect: 'o."parent_observation_id"',
  },

  {
    uiTableName: "Start Time",
    uiTableId: "startTime",
    clickhouseTableName: "observations",
    clickhouseSelect: 'o."start_time"',
  },
  {
    uiTableName: "End Time",
    uiTableId: "endTime",
    clickhouseTableName: "observations",
    clickhouseSelect: 'o."end_time"',
  },
  {
    uiTableName: "Time To First Token (s)",
    uiTableId: "timeToFirstToken",
    clickhouseTableName: "observations",
    clickhouseSelect:
      "if(isNull(completion_start_time), NULL,  date_diff('millisecond', start_time, completion_start_time) / 1000)",
    // If we use the default of Decimal64(12), we cannot filter for more than ~40min due to an overflow
    clickhouseTypeOverwrite: "Decimal64(3)",
  },
  {
    uiTableName: "Latency (s)",
    uiTableId: "latency",
    clickhouseTableName: "observations",
    clickhouseSelect:
      "if(isNull(end_time), NULL, date_diff('millisecond', start_time, end_time) / 1000)",
    // If we use the default of Decimal64(12), we cannot filter for more than ~40min due to an overflow
    clickhouseTypeOverwrite: "Decimal64(3)",
  },
  {
    uiTableName: "Tokens per second",
    uiTableId: "tokensPerSecond",
    clickhouseTableName: "observations",
    clickhouseSelect:
      "(arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'output') > 0, usage_details))) / (date_diff('millisecond', start_time, end_time) / 1000))",
  },
  {
    uiTableName: "Input Cost ($)",
    uiTableId: "inputCost",
    clickhouseTableName: "observations",
    clickhouseSelect:
      "arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'input') > 0, cost_details)))",
  },
  {
    uiTableName: "Output Cost ($)",
    uiTableId: "outputCost",
    clickhouseTableName: "observations",
    clickhouseSelect:
      "arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'output') > 0, cost_details)))",
  },
  {
    uiTableName: "Total Cost ($)",
    uiTableId: "totalCost",
    clickhouseTableName: "observations",
    clickhouseSelect:
      "if(mapExists((k, v) -> (k = 'total'), cost_details), cost_details['total'], NULL)",
  },
  {
    uiTableName: "Level",
    uiTableId: "level",
    clickhouseTableName: "observations",
    clickhouseSelect: 'o."level"',
  },
  {
    uiTableName: "Status Message",
    uiTableId: "statusMessage",
    clickhouseTableName: "observations",
    clickhouseSelect: 'o."status_message"',
  },
  {
    uiTableName: "Model",
    uiTableId: "model",
    clickhouseTableName: "observations",
    clickhouseSelect: 'o."provided_model_name"',
  },
  {
    uiTableName: "Model ID",
    uiTableId: "modelId",
    clickhouseTableName: "observations",
    clickhouseSelect: 'o."internal_model_id"',
  },
  {
    uiTableName: "Input Tokens",
    uiTableId: "inputTokens",
    clickhouseTableName: "observations",
    clickhouseSelect:
      "arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'input') > 0, usage_details)))",
    clickhouseTypeOverwrite: "Decimal64(3)",
  },
  {
    uiTableName: "Output Tokens",
    uiTableId: "outputTokens",
    clickhouseTableName: "observations",
    clickhouseSelect:
      "arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'output') > 0, usage_details)))",
    clickhouseTypeOverwrite: "Decimal64(3)",
  },
  {
    uiTableName: "Total Tokens",
    uiTableId: "totalTokens",
    clickhouseTableName: "observations",
    clickhouseSelect:
      "if(mapExists((k, v) -> (k = 'total'), usage_details), usage_details['total'], NULL)",
    clickhouseTypeOverwrite: "Decimal64(3)",
  },
  {
    uiTableName: "Tokens",
    uiTableId: "tokens",
    clickhouseTableName: "observations",
    clickhouseSelect:
      "if(mapExists((k, v) -> (k = 'total'), usage_details), usage_details['total'], NULL)",
    clickhouseTypeOverwrite: "Decimal64(3)",
  },
  {
    uiTableName: "Metadata",
    uiTableId: "metadata",
    clickhouseTableName: "observations",
    clickhouseSelect: 'o."metadata"',
  },
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
    uiTableName: "Version",
    uiTableId: "version",
    clickhouseTableName: "observations",
    clickhouseSelect: 'o."version"',
  },
  {
    uiTableName: "Prompt Name",
    uiTableId: "promptName",
    clickhouseTableName: "observations",
    clickhouseSelect: "o.prompt_name",
  },
  {
    uiTableName: "Prompt Version",
    uiTableId: "promptVersion",
    clickhouseTableName: "observations",
    clickhouseSelect: "o.prompt_version",
  },
  {
    uiTableName: "Available Tools",
    uiTableId: "toolDefinitions",
    clickhouseTableName: "observations",
    clickhouseSelect: "length(mapKeys(o.tool_definitions))",
  },
  {
    uiTableName: "Tool Calls",
    uiTableId: "toolCalls",
    clickhouseTableName: "observations",
    clickhouseSelect: "length(o.tool_calls)",
  },
  {
    uiTableName: "Tool Names",
    uiTableId: "toolNames",
    clickhouseTableName: "observations",
    clickhouseSelect: "mapKeys(o.tool_definitions)",
  },
  {
    uiTableName: "Called Tool Names",
    uiTableId: "calledToolNames",
    clickhouseTableName: "observations",
    clickhouseSelect: "o.tool_call_names",
  },
];
