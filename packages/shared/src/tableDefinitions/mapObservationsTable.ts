// This structure is maintained to relate the frontend table definitions with the clickhouse table definitions.
// The frontend only sends the column names to the backend. This needs to be changed in the future to send column IDs.

import { UiColumnMapping } from "./types";

export const observationsTableTraceUiColumnDefinitions: UiColumnMapping[] = [
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
];

export const observationsTableUiColumnDefinitions: UiColumnMapping[] = [
  ...observationsTableTraceUiColumnDefinitions,
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
      "if(isNull(completion_start_time), NULL,  date_diff('milliseconds', start_time, completion_start_time) / 1000)",
    // If we use the default of Decimal64(12), we cannot filter for more than ~40min due to an overflow
    clickhouseTypeOverwrite: "Decimal64(3)",
  },
  {
    uiTableName: "Latency (s)",
    uiTableId: "latency",
    clickhouseTableName: "observations",
    clickhouseSelect:
      "if(isNull(end_time), NULL, date_diff('milliseconds', start_time, end_time) / 1000)",
    // If we use the default of Decimal64(12), we cannot filter for more than ~40min due to an overflow
    clickhouseTypeOverwrite: "Decimal64(3)",
  },
  {
    uiTableName: "Tokens per second",
    uiTableId: "tokensPerSecond",
    clickhouseTableName: "observations",
    clickhouseSelect:
      "(arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'output') > 0, usage_details))) / (date_diff('milliseconds', start_time, end_time) / 1000))",
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
    uiTableName: "Input Tokens",
    uiTableId: "inputTokens",
    clickhouseTableName: "observations",
    clickhouseSelect:
      "arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'input') > 0, usage_details)))",
  },
  {
    uiTableName: "Output Tokens",
    uiTableId: "outputTokens",
    clickhouseTableName: "observations",
    clickhouseSelect:
      "arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'output') > 0, usage_details)))",
  },
  {
    uiTableName: "Total Tokens",
    uiTableId: "totalTokens",
    clickhouseTableName: "observations",
    clickhouseSelect:
      "if(mapExists((k, v) -> (k = 'total'), usage_details), usage_details['total'], NULL)",
  },
  {
    uiTableName: "Usage",
    uiTableId: "usage",
    clickhouseTableName: "observations",
    clickhouseSelect:
      "if(mapExists((k, v) -> (k = 'total'), usage_details), usage_details['total'], NULL)",
  },
  {
    uiTableName: "Metadata",
    uiTableId: "metadata",
    clickhouseTableName: "observations",
    clickhouseSelect: 'o."metadata"',
  },
  {
    uiTableName: "Scores",
    uiTableId: "scores",
    clickhouseTableName: "observations",
    clickhouseSelect: "s_avg.scores_avg",
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
];
