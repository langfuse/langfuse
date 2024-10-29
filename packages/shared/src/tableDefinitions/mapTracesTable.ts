// This structure is maintained to relate the frontend table definitions with the clickhouse table definitions.
// The frontend only sends the column names to the backend. This needs to be changed in the future to send column IDs.

import { UiColumnMapping } from "./types";

export const tracesTableUiColumnDefinitions: UiColumnMapping[] = [
  {
    uiTableName: "bookmarked",
    clickhouseTableName: "traces",
    clickhouseColumnName: "bookmarked",
  },
  {
    uiTableName: "Level",
    clickhouseTableName: "observations",
    clickhouseColumnName: "level",
  },
  {
    uiTableName: "ID",
    clickhouseTableName: "traces",
    clickhouseColumnName: "id",
  },
  {
    uiTableName: "Name",
    clickhouseTableName: "traces",
    clickhouseColumnName: "name",
  },
  {
    uiTableName: "Timestamp",
    clickhouseTableName: "traces",
    clickhouseColumnName: "timestamp",
  },
  {
    uiTableName: "User ID",
    clickhouseTableName: "traces",
    clickhouseColumnName: "userId",
  },
  {
    uiTableName: "Session ID",
    clickhouseTableName: "traces",
    clickhouseColumnName: "sessionId",
  },
  {
    uiTableName: "Metadata",
    clickhouseTableName: "traces",
    clickhouseColumnName: "metadata",
  },
  {
    uiTableName: "Version",
    clickhouseTableName: "traces",
    clickhouseColumnName: "version",
  },
  {
    uiTableName: "Release",
    clickhouseTableName: "traces",
    clickhouseColumnName: "release",
  },
  {
    uiTableName: "Tags",
    clickhouseTableName: "traces",
    clickhouseColumnName: "tags",
  },
  {
    uiTableName: "Input Tokens",
    clickhouseTableName: "traces",
    clickhouseColumnName: "promptTokens",
  },
  {
    uiTableName: "Output Tokens",
    clickhouseTableName: "traces",
    clickhouseColumnName: "completionTokens",
  },
  {
    uiTableName: "Total Tokens",
    clickhouseTableName: "traces",
    clickhouseColumnName: "totalTokens",
  },
  {
    uiTableName: "Usage",
    clickhouseTableName: "traces",
    clickhouseColumnName: "totalTokens",
  },
  {
    uiTableName: "Latency (s)",
    clickhouseTableName: "traces",
    clickhouseColumnName: "latency",
  },
  {
    uiTableName: "Input Cost ($)",
    clickhouseTableName: "traces",
    clickhouseColumnName: "calculatedInputCost",
  },
  {
    uiTableName: "Output Cost ($)",
    clickhouseTableName: "traces",
    clickhouseColumnName: "calculatedOutputCost",
  },
  {
    uiTableName: "Total Cost ($)",
    clickhouseTableName: "traces",
    clickhouseColumnName: "calculatedTotalCost",
  },
];
