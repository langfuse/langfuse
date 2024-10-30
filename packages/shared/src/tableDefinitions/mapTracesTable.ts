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
    clickhouseSelect: "arrayElement(usage_details, 'input')",
  },
  {
    uiTableName: "Output Tokens",
    clickhouseTableName: "traces",
    clickhouseSelect: "arrayElement(usage_details, 'output')",
  },
  {
    uiTableName: "Total Tokens",
    clickhouseTableName: "traces",
    clickhouseSelect: "arrayElement(usage_details, 'total')",
  },
  {
    uiTableName: "Latency (s)",
    clickhouseTableName: "traces",
    clickhouseSelect: "latency",
  },
  {
    uiTableName: "Input Cost ($)",
    clickhouseTableName: "traces",
    clickhouseSelect: "arrayElement(cost_details, 'input')",
  },
  {
    uiTableName: "Output Cost ($)",
    clickhouseTableName: "traces",
    clickhouseSelect: "arrayElement(cost_details, 'output')",
  },
  {
    uiTableName: "Total Cost ($)",
    clickhouseTableName: "traces",
    clickhouseSelect: "arrayElement(cost_details, 'total')",
  },
];
