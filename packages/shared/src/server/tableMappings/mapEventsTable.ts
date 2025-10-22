// This structure is maintained to relate the frontend table definitions with the clickhouse table definitions.
// The frontend only sends the column names to the backend. This needs to be changed in the future to send column IDs.

import { UiColumnMappings } from "../../tableDefinitions";

// TODO
// Leaving these here for temporary compatibility with legacy traces UI (this may require fixing search condition)
// user_id should be moved to the main list, and the rest removed.
export const eventsTableLegacyTraceUiColumnDefinitions: UiColumnMappings = [
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

export const eventsTableUiColumnDefinitions: UiColumnMappings = [
  ...eventsTableLegacyTraceUiColumnDefinitions,
  {
    uiTableName: "Environment",
    uiTableId: "environment",
    clickhouseTableName: "events",
    clickhouseSelect: 'e."environment"',
  },
  {
    uiTableName: "type",
    uiTableId: "type",
    clickhouseTableName: "events",
    clickhouseSelect: 'e."type"',
  },
  {
    uiTableName: "ID",
    uiTableId: "id",
    clickhouseTableName: "events",
    clickhouseSelect: 'e."span_id"',
  },
  {
    uiTableName: "Type",
    uiTableId: "type",
    clickhouseTableName: "events",
    clickhouseSelect: 'e."type"',
  },
  {
    uiTableName: "Name",
    uiTableId: "name",
    clickhouseTableName: "events",
    clickhouseSelect: 'e."name"',
  },
  {
    uiTableName: "Trace ID",
    uiTableId: "traceId",
    clickhouseTableName: "events",
    clickhouseSelect: 'e."trace_id"',
  },

  {
    uiTableName: "Start Time",
    uiTableId: "startTime",
    clickhouseTableName: "events",
    clickhouseSelect: 'e."start_time"',
  },
  {
    uiTableName: "End Time",
    uiTableId: "endTime",
    clickhouseTableName: "events",
    clickhouseSelect: 'e."end_time"',
  },
  {
    uiTableName: "Time To First Token (s)",
    uiTableId: "timeToFirstToken",
    clickhouseTableName: "events",
    clickhouseSelect:
      "if(isNull(completion_start_time), NULL,  date_diff('millisecond', start_time, completion_start_time) / 1000)",
    // If we use the default of Decimal64(12), we cannot filter for more than ~40min due to an overflow
    clickhouseTypeOverwrite: "Decimal64(3)",
  },
  {
    uiTableName: "Latency (s)",
    uiTableId: "latency",
    clickhouseTableName: "events",
    clickhouseSelect:
      "if(isNull(end_time), NULL, date_diff('millisecond', start_time, end_time) / 1000)",
    // If we use the default of Decimal64(12), we cannot filter for more than ~40min due to an overflow
    clickhouseTypeOverwrite: "Decimal64(3)",
  },
  {
    uiTableName: "Tokens per second",
    uiTableId: "tokensPerSecond",
    clickhouseTableName: "events",
    clickhouseSelect:
      "(arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'output') > 0, usage_details))) / (date_diff('millisecond', start_time, end_time) / 1000))",
  },
  {
    uiTableName: "Input Cost ($)",
    uiTableId: "inputCost",
    clickhouseTableName: "events",
    clickhouseSelect:
      "arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'input') > 0, cost_details)))",
  },
  {
    uiTableName: "Output Cost ($)",
    uiTableId: "outputCost",
    clickhouseTableName: "events",
    clickhouseSelect:
      "arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'output') > 0, cost_details)))",
  },
  {
    uiTableName: "Total Cost ($)",
    uiTableId: "totalCost",
    clickhouseTableName: "events",
    clickhouseSelect:
      "if(mapExists((k, v) -> (k = 'total'), cost_details), cost_details['total'], NULL)",
  },
  {
    uiTableName: "Level",
    uiTableId: "level",
    clickhouseTableName: "events",
    clickhouseSelect: 'e."level"',
  },
  {
    uiTableName: "Status Message",
    uiTableId: "statusMessage",
    clickhouseTableName: "events",
    clickhouseSelect: 'e."status_message"',
  },
  {
    uiTableName: "Model",
    uiTableId: "model",
    clickhouseTableName: "events",
    clickhouseSelect: 'e."provided_model_name"',
  },
  {
    uiTableName: "Model ID",
    uiTableId: "modelId",
    clickhouseTableName: "events",
    clickhouseSelect: 'e."model_id"',
  },
  {
    uiTableName: "Input Tokens",
    uiTableId: "inputTokens",
    clickhouseTableName: "events",
    clickhouseSelect:
      "arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'input') > 0, usage_details)))",
    clickhouseTypeOverwrite: "Decimal64(3)",
  },
  {
    uiTableName: "Output Tokens",
    uiTableId: "outputTokens",
    clickhouseTableName: "events",
    clickhouseSelect:
      "arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'output') > 0, usage_details)))",
    clickhouseTypeOverwrite: "Decimal64(3)",
  },
  {
    uiTableName: "Total Tokens",
    uiTableId: "totalTokens",
    clickhouseTableName: "events",
    clickhouseSelect:
      "if(mapExists((k, v) -> (k = 'total'), usage_details), usage_details['total'], NULL)",
    clickhouseTypeOverwrite: "Decimal64(3)",
  },
  {
    uiTableName: "Tokens",
    uiTableId: "tokens",
    clickhouseTableName: "events",
    clickhouseSelect:
      "if(mapExists((k, v) -> (k = 'total'), usage_details), usage_details['total'], NULL)",
    clickhouseTypeOverwrite: "Decimal64(3)",
  },
  {
    uiTableName: "Metadata",
    uiTableId: "metadata",
    clickhouseTableName: "events",
    clickhouseSelect: 'e."metadata"',
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
    uiTableId: "scores",
    clickhouseTableName: "scores",
    clickhouseSelect: "s.scores_avg",
  },
  {
    uiTableName: "Scores (categorical)",
    uiTableId: "scores",
    clickhouseTableName: "scores",
    clickhouseSelect: "s.score_categories",
  },
  {
    uiTableName: "Version",
    uiTableId: "version",
    clickhouseTableName: "events",
    clickhouseSelect: 'e."version"',
  },
  {
    uiTableName: "Prompt Name",
    uiTableId: "promptName",
    clickhouseTableName: "events",
    clickhouseSelect: "o.prompt_name",
  },
  {
    uiTableName: "Prompt Version",
    uiTableId: "promptVersion",
    clickhouseTableName: "events",
    clickhouseSelect: "o.prompt_version",
  },
];
