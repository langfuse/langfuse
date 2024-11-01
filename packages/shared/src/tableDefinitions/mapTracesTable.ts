// This structure is maintained to relate the frontend table definitions with the clickhouse table definitions.
// The frontend only sends the column names to the backend. This needs to be changed in the future to send column IDs.

import { UiColumnMapping } from "./types";

export const tracesTableUiColumnDefinitions: UiColumnMapping[] = [
  {
    uiTableName: "bookmarked",
    clickhouseTableName: "traces",
    clickhouseSelect: "bookmarked",
    queryPrefix: "t",
  },
  {
    uiTableName: "Level",
    clickhouseTableName: "observations",
    clickhouseSelect: "level",
  },
  {
    uiTableName: "ID",
    clickhouseTableName: "traces",
    clickhouseSelect: "id",
  },
  {
    uiTableName: "Name",
    clickhouseTableName: "traces",
    clickhouseSelect: "name",
  },
  {
    uiTableName: "Timestamp",
    clickhouseTableName: "traces",
    clickhouseSelect: "timestamp",
  },
  {
    uiTableName: "User ID",
    clickhouseTableName: "traces",
    clickhouseSelect: "user_id",
  },
  {
    uiTableName: "Session ID",
    clickhouseTableName: "traces",
    clickhouseSelect: "session_id",
  },
  {
    uiTableName: "Metadata",
    clickhouseTableName: "traces",
    clickhouseSelect: "metadata",
  },
  {
    uiTableName: "Version",
    clickhouseTableName: "traces",
    clickhouseSelect: "version",
  },
  {
    uiTableName: "Release",
    clickhouseTableName: "traces",
    clickhouseSelect: "release",
  },
  {
    uiTableName: "Tags",
    clickhouseTableName: "traces",
    clickhouseSelect: "tags",
  },
  {
    uiTableName: "Input Tokens",
    clickhouseTableName: "traces",
    clickhouseSelect:
      "if(mapExists((k, v) -> (k = 'input'), usage_details), usage_details['input'], NULL)",
  },
  {
    uiTableName: "Output Tokens",
    clickhouseTableName: "traces",
    clickhouseSelect:
      "if(mapExists((k, v) -> (k = 'output'), usage_details), usage_details['output'], NULL)",
  },
  {
    uiTableName: "Total Tokens",
    clickhouseTableName: "traces",
    clickhouseSelect:
      "if(mapExists((k, v) -> (k = 'total'), usage_details), usage_details['total'], NULL)",
  },
  {
    uiTableName: "Latency (s)",
    clickhouseTableName: "traces",
    clickhouseSelect: "latency",
  },
  {
    uiTableName: "Input Cost ($)",
    clickhouseTableName: "traces",
    clickhouseSelect:
      "if(mapExists((k, v) -> (k = 'input'), cost_details), usage_details['input'], NULL)",
  },
  {
    uiTableName: "Output Cost ($)",
    clickhouseTableName: "traces",
    clickhouseSelect:
      "if(mapExists((k, v) -> (k = 'output'), cost_details), usage_details['output'], NULL)",
  },
  {
    uiTableName: "Total Cost ($)",
    clickhouseTableName: "traces",
    clickhouseSelect:
      "if(mapExists((k, v) -> (k = 'total'), cost_details), usage_details['total'], NULL)",
  },
];
