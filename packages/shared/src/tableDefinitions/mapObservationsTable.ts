// This structure is maintained to relate the frontend table definitions with the clickhouse table definitions.
// The frontend only sends the column names to the backend. This needs to be changed in the future to send column IDs.

import { UiColumnMapping } from "./types";

export const observationsTableUiColumnDefinitions: UiColumnMapping[] = [
  {
    uiTableName: "ID",
    clickhouseTableName: "observations",
    clickhouseSelect: 'o."id"',
  },
  {
    uiTableName: "Name",
    clickhouseTableName: "observations",
    clickhouseSelect: 'o."name"',
  },
  {
    uiTableName: "Trace ID",
    clickhouseTableName: "observations",
    clickhouseSelect: 'o."trace_id"',
  },
  {
    uiTableName: "Trace Name",
    clickhouseTableName: "observations",
    clickhouseSelect: 'o."trace_name"',
  },
  {
    uiTableName: "User ID",
    clickhouseTableName: "traces",
    clickhouseSelect: 't."trace_user_id"',
  },
  {
    uiTableName: "Start Time",
    clickhouseTableName: "observations",
    clickhouseSelect: 'o."start_time"',
  },
  {
    uiTableName: "End Time",
    clickhouseTableName: "observations",
    clickhouseSelect: 'o."end_time"',
  },
  {
    uiTableName: "Time To First Token (s)",
    clickhouseTableName: "observations",
    clickhouseSelect:
      "if(isNull(completion_start_time), NULL,  date_diff('seconds', start_time, completion_start_time))}",
  },
  {
    uiTableName: "Latency (s)",
    clickhouseTableName: "observations",
    clickhouseSelect:
      "if(isNull(end_time), NULL, date_diff('seconds', start_time, end_time))",
  },
  {
    uiTableName: "Tokens per second",
    clickhouseTableName: "observations",
    clickhouseSelect:
      " if(isNull(end_time) && mapExists((k, v) -> (k = 'input'), usage_details) != 1, NULL, usage_details['input'] / date_diff('seconds', start_time, end_time)",
  },
  {
    uiTableName: "Input Cost ($)",
    clickhouseTableName: "observations",
    clickhouseSelect:
      "if(mapExists((k, v) -> (k = 'input'), cost_details), cost_details['input'], NULL)",
  },
  {
    uiTableName: "Output Cost ($)",
    clickhouseTableName: "observations",
    clickhouseSelect:
      "if(mapExists((k, v) -> (k = 'output'), cost_details), cost_details['output'], NULL)",
  },
  {
    uiTableName: "Total Cost ($)",
    clickhouseTableName: "observations",
    clickhouseSelect:
      "if(mapExists((k, v) -> (k = 'total'), cost_details), cost_details['total'], NULL)",
  },
  {
    uiTableName: "Level",
    clickhouseTableName: "observations",
    clickhouseSelect: 'o."level"',
  },
  {
    uiTableName: "Status Message",
    clickhouseTableName: "observations",
    clickhouseSelect: 'o."status_message"',
  },
  {
    uiTableName: "Model",
    clickhouseTableName: "observations",
    clickhouseSelect: 'o."model"',
  },
  {
    uiTableName: "Input Tokens",
    clickhouseTableName: "observations",
    clickhouseSelect:
      "if(mapExists((k, v) -> (k = 'input'), usage_details), usage_details['input'], NULL)",
  },
  {
    uiTableName: "Output Tokens",
    clickhouseTableName: "observations",
    clickhouseSelect:
      "if(mapExists((k, v) -> (k = 'output'), usage_details), usage_details['output'], NULL)",
  },
  {
    uiTableName: "Total Tokens",
    clickhouseTableName: "observations",
    clickhouseSelect:
      "if(mapExists((k, v) -> (k = 'total'), usage_details), usage_details['total'], NULL)",
  },
  {
    uiTableName: "Usage",
    clickhouseTableName: "observations",
    clickhouseSelect:
      "if(mapExists((k, v) -> (k = 'total'), usage_details), usage_details['total'], NULL)",
  },
  {
    uiTableName: "Metadata",
    clickhouseTableName: "observations",
    clickhouseSelect: 'o."metadata"',
  },
  {
    uiTableName: "Scores",
    clickhouseTableName: "observations",
    clickhouseSelect: "s_avg.scores_avg",
  },
  {
    uiTableName: "Version",
    clickhouseTableName: "observations",
    clickhouseSelect: 'o."version"',
  },
  {
    uiTableName: "Prompt Name",
    clickhouseTableName: "prompts",
    clickhouseSelect: "p.name",
  },
  {
    uiTableName: "Prompt Version",
    clickhouseTableName: "prompts",
    clickhouseSelect: "p.version",
  },
  {
    uiTableName: "Trace Tags",
    clickhouseTableName: "traces",
    clickhouseSelect: "t.tags",
  },
];
