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
    clickhouseSelect: "t.user_id",
  },
  {
    uiTableName: "Trace Name",
    uiTableId: "traceName",
    clickhouseTableName: "traces",
    clickhouseSelect: "t.name",
  },
  {
    uiTableName: "Trace Environment",
    uiTableId: "traceEnvironment",
    clickhouseTableName: "traces",
    clickhouseSelect: "t.environment",
  },
];

export const observationsTableUiColumnDefinitions: UiColumnMappings = [
  ...observationsTableTraceUiColumnDefinitions,
  {
    uiTableName: "Environment",
    uiTableId: "environment",
    clickhouseTableName: "observations",
    clickhouseSelect: "o.environment",
  },
  {
    uiTableName: "type",
    uiTableId: "type",
    clickhouseTableName: "observations",
    clickhouseSelect: "o.type",
  },
  {
    uiTableName: "ID",
    uiTableId: "id",
    clickhouseTableName: "observations",
    clickhouseSelect: "o.id",
  },
  {
    uiTableName: "Type",
    uiTableId: "type",
    clickhouseTableName: "observations",
    clickhouseSelect: "o.type",
  },
  {
    uiTableName: "Name",
    uiTableId: "name",
    clickhouseTableName: "observations",
    clickhouseSelect: "o.name",
  },
  {
    uiTableName: "Trace ID",
    uiTableId: "traceId",
    clickhouseTableName: "observations",
    clickhouseSelect: "o.trace_id",
  },

  {
    uiTableName: "Start Time",
    uiTableId: "startTime",
    clickhouseTableName: "observations",
    clickhouseSelect: "o.start_time",
  },
  {
    uiTableName: "End Time",
    uiTableId: "endTime",
    clickhouseTableName: "observations",
    clickhouseSelect: "o.end_time",
  },
  {
    uiTableName: "Time To First Token (s)",
    uiTableId: "timeToFirstToken",
    clickhouseTableName: "observations",
    clickhouseSelect:
      "CASE WHEN completion_start_time IS NULL THEN NULL ELSE (UNIX_TIMESTAMP(completion_start_time) - UNIX_TIMESTAMP(start_time)) END",
    // If we use the default of Decimal64(12), we cannot filter for more than ~40min due to an overflow
    clickhouseTypeOverwrite: "",
  },
  {
    uiTableName: "Latency (s)",
    uiTableId: "latency",
    clickhouseTableName: "observations",
    clickhouseSelect:
      "CASE WHEN end_time IS NULL THEN NULL ELSE (UNIX_TIMESTAMP(end_time) - UNIX_TIMESTAMP(start_time)) END",
    // If we use the default of Decimal64(12), we cannot filter for more than ~40min due to an overflow
    clickhouseTypeOverwrite: "",
  },
  {
    uiTableName: "Tokens per second",
    uiTableId: "tokensPerSecond",
    clickhouseTableName: "observations",
    clickhouseSelect:
      "COALESCE(CASE WHEN (UNIX_TIMESTAMP(end_time) - UNIX_TIMESTAMP(start_time)) = 0 THEN NULL ELSE (COALESCE(JSON_VALUE(usage_details, '$.output'), 0) / (UNIX_TIMESTAMP(end_time) - UNIX_TIMESTAMP(start_time))) END, 0)",
  },
  {
    uiTableName: "Input Cost ($)",
    uiTableId: "inputCost",
    clickhouseTableName: "observations",
    clickhouseSelect: "COALESCE(JSON_VALUE(cost_details, '$.input'), 0)",
  },
  {
    uiTableName: "Output Cost ($)",
    uiTableId: "outputCost",
    clickhouseTableName: "observations",
    clickhouseSelect: "COALESCE(JSON_VALUE(cost_details, '$.output'), 0)",
  },
  {
    uiTableName: "Total Cost ($)",
    uiTableId: "totalCost",
    clickhouseTableName: "observations",
    clickhouseSelect: "JSON_VALUE(cost_details, '$.total')",
  },
  {
    uiTableName: "Level",
    uiTableId: "level",
    clickhouseTableName: "observations",
    clickhouseSelect: "o.level",
  },
  {
    uiTableName: "Status Message",
    uiTableId: "statusMessage",
    clickhouseTableName: "observations",
    clickhouseSelect: "o.status_message",
  },
  {
    uiTableName: "Model",
    uiTableId: "model",
    clickhouseTableName: "observations",
    clickhouseSelect: "o.provided_model_name",
  },
  {
    uiTableName: "Model ID",
    uiTableId: "modelId",
    clickhouseTableName: "observations",
    clickhouseSelect: "o.internal_model_id",
  },
  {
    uiTableName: "Input Tokens",
    uiTableId: "inputTokens",
    clickhouseTableName: "observations",
    clickhouseSelect: "COALESCE(JSON_VALUE(usage_details, '$.input'), 0)",
    clickhouseTypeOverwrite: "",
  },
  {
    uiTableName: "Output Tokens",
    uiTableId: "outputTokens",
    clickhouseTableName: "observations",
    clickhouseSelect: "COALESCE(JSON_VALUE(usage_details, '$.output'), 0)",
    clickhouseTypeOverwrite: "",
  },
  {
    uiTableName: "Total Tokens",
    uiTableId: "totalTokens",
    clickhouseTableName: "observations",
    clickhouseSelect: "JSON_VALUE(usage_details, '$.total')",
    clickhouseTypeOverwrite: "",
  },
  {
    uiTableName: "Tokens",
    uiTableId: "tokens",
    clickhouseTableName: "observations",
    clickhouseSelect: "JSON_VALUE(usage_details, '$.total')",
    clickhouseTypeOverwrite: "",
  },
  {
    uiTableName: "Metadata",
    uiTableId: "metadata",
    clickhouseTableName: "observations",
    clickhouseSelect: "o.metadata",
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
    clickhouseTableName: "observations",
    clickhouseSelect: "o.version",
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
];
