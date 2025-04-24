import { UiColumnMappings } from "./types";

export const tracesTableUiColumnDefinitions: UiColumnMappings = [
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
    clickhouseSelect: "aggregated_level",
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
    uiTableName: "Environment",
    uiTableId: "environment",
    clickhouseTableName: "traces",
    clickhouseSelect: "environment",
  },
  {
    uiTableName: "Tags",
    uiTableId: "tags",
    clickhouseTableName: "traces",
    clickhouseSelect: "tags",
  },
  {
    uiTableName: "Warning Level Count",
    uiTableId: "warningCount",
    clickhouseTableName: "observations",
    clickhouseSelect: "warning_count",
  },
  {
    uiTableName: "Error Level Count",
    uiTableId: "errorCount",
    clickhouseTableName: "observations",
    clickhouseSelect: "error_count",
  },
  {
    uiTableName: "Default Level Count",
    uiTableId: "defaultCount",
    clickhouseTableName: "observations",
    clickhouseSelect: "default_count",
  },
  {
    uiTableName: "Debug Level Count",
    uiTableId: "debugCount",
    clickhouseTableName: "observations",
    clickhouseSelect: "debug_count",
  },
  {
    uiTableName: "Input Tokens",
    uiTableId: "inputTokens",
    clickhouseTableName: "observations",
    clickhouseSelect:
      "arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'input') > 0, usage_details)))",
    clickhouseTypeOverwrite: "Decimal64(3)",
  },
  {
    uiTableName: "Output Tokens",
    uiTableId: "outputTokens",
    clickhouseTableName: "observations",
    clickhouseSelect:
      "arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'output') > 0, usage_details)))",
    clickhouseTypeOverwrite: "Decimal64(3)",
  },
  {
    uiTableName: "Total Tokens",
    uiTableId: "totalTokens",
    clickhouseTableName: "observations",
    clickhouseSelect:
      "if(mapExists((k, v) -> (k = 'total'), usage_details), usage_details['total'], NULL)",
    clickhouseTypeOverwrite: "Decimal64(3)",
  },
  {
    uiTableName: "Tokens",
    uiTableId: "tokens",
    clickhouseTableName: "observations",
    clickhouseSelect:
      "if(mapExists((k, v) -> (k = 'total'), usage_details), usage_details['total'], NULL)",
    clickhouseTypeOverwrite: "Decimal64(3)",
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
    uiTableName: "Latency (s)",
    uiTableId: "latency",
    clickhouseTableName: "observations",
    clickhouseSelect: "latency_milliseconds / 1000",
    // If we use the default of Decimal64(12), we cannot filter for more than ~40min due to an overflow
    clickhouseTypeOverwrite: "Decimal64(3)",
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
    clickhouseSelect: "cost_details['total']",
  },
];
