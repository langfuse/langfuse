// ID matches the name on the observations clickhouse table
// internal will be removed from the ColumnDefinition
// clickhouseTable is used to determine which clickhouse table to query

export type UiColumnMapping = {
  uiTableName: string;
  clickhouseTableName: string;
  clickhouseColumnName: string;
};

export const tracesTableUiColumnDefinitions: UiColumnMapping[] = [
  {
    uiTableName: "bookmarked",
    clickhouseTableName: "traces",
    clickhouseColumnName: "bookmarked",
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
    clickhouseColumnName: "user_id",
  },
  {
    uiTableName: "Session ID",
    clickhouseTableName: "traces",
    clickhouseColumnName: "session_id",
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
    uiTableName: "Level",
    clickhouseTableName: "traces",
    clickhouseColumnName: "level",
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
    uiTableName: "Latency",
    clickhouseTableName: "traces",
    clickhouseColumnName: "latency",
  },
  {
    uiTableName: "Input Cost",
    clickhouseTableName: "traces",
    clickhouseColumnName: "calculatedInputCost",
  },
  {
    uiTableName: "Output Cost",
    clickhouseTableName: "traces",
    clickhouseColumnName: "calculatedOutputCost",
  },
  {
    uiTableName: "Total Cost",
    clickhouseTableName: "traces",
    clickhouseColumnName: "calculatedTotalCost",
  },
];
