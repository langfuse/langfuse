import { UiColumnMapping } from "./types";

export const tracesTableUiColumnDefinitions: UiColumnMapping[] = [
  {
    uiTableName: "⭐️",
    uiTableId: "bookmarked",
    clickhouseTableName: "traces",
    clickhouseSelect: "bookmarked",
    queryPrefix: "t",
  },
  {
    uiTableName: "Level",
    uiTableId: "level",
    clickhouseTableName: "observations",
    clickhouseSelect: "level",
  },
  {
    uiTableName: "ID",
    uiTableId: "id",
    clickhouseTableName: "traces",
    clickhouseSelect: "id",
  },
  {
    uiTableName: "Name",
    uiTableId: "name",
    clickhouseTableName: "traces",
    clickhouseSelect: "name",
  },
  {
    uiTableName: "Timestamp",
    uiTableId: "timestamp",
    clickhouseTableName: "traces",
    clickhouseSelect: "timestamp",
  },
  {
    uiTableName: "User ID",
    uiTableId: "userId",
    clickhouseTableName: "traces",
    clickhouseSelect: "user_id",
  },
  {
    uiTableName: "Session ID",
    uiTableId: "sessionId",
    clickhouseTableName: "traces",
    clickhouseSelect: "session_id",
  },
  {
    uiTableName: "Metadata",
    uiTableId: "metadata",
    clickhouseTableName: "traces",
    clickhouseSelect: "metadata",
  },
  {
    uiTableName: "Version",
    uiTableId: "version",
    clickhouseTableName: "traces",
    clickhouseSelect: "version",
  },
  {
    uiTableName: "Release",
    uiTableId: "release",
    clickhouseTableName: "traces",
    clickhouseSelect: "release",
  },
  {
    uiTableName: "Tags",
    uiTableId: "tags",
    clickhouseTableName: "traces",
    clickhouseSelect: "tags",
  },
  {
    uiTableName: "Input Tokens",
    uiTableId: "inputTokens",
    clickhouseTableName: "traces",
    clickhouseSelect:
      "if(mapExists((k, v) -> (k = 'input'), usage_details), usage_details['input'], NULL)",
  },
  {
    uiTableName: "Output Tokens",
    uiTableId: "outputTokens",
    clickhouseTableName: "traces",
    clickhouseSelect:
      "if(mapExists((k, v) -> (k = 'output'), usage_details), usage_details['output'], NULL)",
  },
  {
    uiTableName: "Total Tokens",
    uiTableId: "totalTokens",
    clickhouseTableName: "traces",
    clickhouseSelect:
      "if(mapExists((k, v) -> (k = 'total'), usage_details), usage_details['total'], NULL)",
  },
  {
    uiTableName: "Usage",
    uiTableId: "totalTokens",
    clickhouseTableName: "traces",
    clickhouseSelect:
      "if(mapExists((k, v) -> (k = 'total'), usage_details), usage_details['total'], NULL)",
  },
  {
    uiTableName: "Scores",
    uiTableId: "scores",
    clickhouseTableName: "scores",
    clickhouseSelect: "s.scores_avg",
  },
  {
    uiTableName: "Latency (s)",
    uiTableId: "latency",
    clickhouseTableName: "traces",
    clickhouseSelect: "latency",
  },
  {
    uiTableName: "Input Cost ($)",
    uiTableId: "inputCost",
    clickhouseTableName: "traces",
    clickhouseSelect:
      "if(mapExists((k, v) -> (k = 'input'), cost_details), usage_details['input'], NULL)",
  },
  {
    uiTableName: "Output Cost ($)",
    uiTableId: "outputCost",
    clickhouseTableName: "traces",
    clickhouseSelect:
      "if(mapExists((k, v) -> (k = 'output'), cost_details), usage_details['output'], NULL)",
  },
  {
    uiTableName: "Total Cost ($)",
    uiTableId: "totalCost",
    clickhouseTableName: "traces",
    clickhouseSelect:
      "if(mapExists((k, v) -> (k = 'total'), cost_details), usage_details['total'], NULL)",
  },
];
