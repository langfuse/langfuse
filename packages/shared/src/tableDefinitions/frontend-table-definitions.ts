// ID matches the name on the observations clickhouse table
// internal will be removed from the ColumnDefinition
// clickhouseTable is used to determine which clickhouse table to query

export type UiColumnMapping = {
  uiTableId: string;
  clickhouseTableName: string;
  clickhouseColumnName: string;
};

export const tracesTableUiColumnDefinitions: UiColumnMapping[] = [
  {
    uiTableId: "bookmarked",
    clickhouseTableName: "traces",
    clickhouseColumnName: "bookmarked",
  },
  {
    uiTableId: "id",
    clickhouseTableName: "traces",
    clickhouseColumnName: "id",
  },
  {
    uiTableId: "name",
    clickhouseTableName: "traces",
    clickhouseColumnName: "name",
  },
  {
    uiTableId: "timestamp",
    clickhouseTableName: "traces",
    clickhouseColumnName: "timestamp",
  },
  {
    uiTableId: "userId",
    clickhouseTableName: "traces",
    clickhouseColumnName: "user_id",
  },
  {
    uiTableId: "sessionId",
    clickhouseTableName: "traces",
    clickhouseColumnName: "session_id",
  },
  {
    uiTableId: "metadata",
    clickhouseTableName: "traces",
    clickhouseColumnName: "metadata",
  },
  {
    uiTableId: "version",
    clickhouseTableName: "traces",
    clickhouseColumnName: "version",
  },
  {
    uiTableId: "release",
    clickhouseTableName: "traces",
    clickhouseColumnName: "release",
  },
  {
    uiTableId: "level",
    clickhouseTableName: "traces",
    clickhouseColumnName: "level",
  },
  {
    uiTableId: "tags",
    clickhouseTableName: "traces",
    clickhouseColumnName: "tags",
  },
  {
    uiTableId: "inputTokens",
    clickhouseTableName: "traces",
    clickhouseColumnName: "promptTokens",
  },
  {
    uiTableId: "outputTokens",
    clickhouseTableName: "traces",
    clickhouseColumnName: "completionTokens",
  },
  {
    uiTableId: "totalTokens",
    clickhouseTableName: "traces",
    clickhouseColumnName: "totalTokens",
  },
  {
    uiTableId: "usage",
    clickhouseTableName: "traces",
    clickhouseColumnName: "totalTokens",
  },
  {
    uiTableId: "scores_avg",
    clickhouseTableName: "traces",
    clickhouseColumnName: "scores_avg",
  },
  {
    uiTableId: "latency",
    clickhouseTableName: "traces",
    clickhouseColumnName: "latency",
  },
  {
    uiTableId: "inputCost",
    clickhouseTableName: "traces",
    clickhouseColumnName: "calculatedInputCost",
  },
  {
    uiTableId: "outputCost",
    clickhouseTableName: "traces",
    clickhouseColumnName: "calculatedOutputCost",
  },
  {
    uiTableId: "totalCost",
    clickhouseTableName: "traces",
    clickhouseColumnName: "calculatedTotalCost",
  },
];
