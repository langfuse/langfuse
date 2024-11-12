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
    clickhouseTableName: "observations",
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
      "if(isNull(completion_start_time), NULL,  date_diff('seconds', start_time, completion_start_time))",
  },
  {
    uiTableName: "Latency (s)",
    uiTableId: "latency",
    clickhouseTableName: "observations",
    clickhouseSelect:
      "if(isNull(end_time), NULL, date_diff('seconds', start_time, end_time))",
  },
  {
    uiTableName: "Tokens per second",
    uiTableId: "tokensPerSecond",
    clickhouseTableName: "observations",
    clickhouseSelect:
      "usage_details['input'] / date_diff('seconds', start_time, end_time)",
  },
  {
    uiTableName: "Input Cost ($)",
    uiTableId: "inputCost",
    clickhouseTableName: "observations",
    clickhouseSelect:
      "if(mapExists((k, v) -> (k = 'input'), cost_details), cost_details['input'], NULL)",
  },
  {
    uiTableName: "Output Cost ($)",
    uiTableId: "outputCost",
    clickhouseTableName: "observations",
    clickhouseSelect:
      "if(mapExists((k, v) -> (k = 'output'), cost_details), cost_details['output'], NULL)",
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
      "if(mapExists((k, v) -> (k = 'input'), usage_details), usage_details['input'], NULL)",
  },
  {
    uiTableName: "Output Tokens",
    uiTableId: "outputTokens",
    clickhouseTableName: "observations",
    clickhouseSelect:
      "if(mapExists((k, v) -> (k = 'output'), usage_details), usage_details['output'], NULL)",
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
