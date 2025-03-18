import { UiColumnMappings } from ".";

export const sessionCols: UiColumnMappings = [
  // we do not access the traces scores in ClickHouse. We default back to the trace timestamps.

  {
    uiTableName: "⭐️",
    uiTableId: "bookmarked",
    clickhouseTableName: "traces",
    clickhouseSelect: "bookmarked",
  },
  {
    uiTableName: "Created At",
    uiTableId: "createdAt",
    clickhouseTableName: "traces",
    clickhouseSelect: "min_timestamp",
  },
  {
    uiTableName: "User IDs",
    uiTableId: "userIds",
    clickhouseTableName: "traces",
    clickhouseSelect: "user_ids",
  },
  {
    uiTableName: "Environment",
    uiTableId: "environment",
    clickhouseTableName: "traces",
    clickhouseSelect: "environment",
  },
  {
    uiTableName: "Session Duration",
    uiTableId: "sessionDuration",
    clickhouseTableName: "traces",
    clickhouseSelect: "duration",
    // If we use the default of Decimal64(12), we cannot filter for more than ~40min due to an overflow
    clickhouseTypeOverwrite: "Decimal64(3)",
  },
  {
    uiTableName: "Count Traces",
    uiTableId: "countTraces",
    clickhouseTableName: "traces",
    clickhouseSelect: "trace_count",
  },
  {
    uiTableName: "Session Input Cost",
    uiTableId: "inputCost",
    clickhouseTableName: "traces",
    clickhouseSelect: "session_input_cost",
  },
  {
    uiTableName: "Session Output Cost",
    uiTableId: "outputCost",
    clickhouseTableName: "traces",
    clickhouseSelect: "session_output_cost",
  },
  {
    uiTableName: "Session Total Cost",
    uiTableId: "totalCost",
    clickhouseTableName: "traces",
    clickhouseSelect: "session_total_cost",
  },
  {
    uiTableName: "Input Tokens",
    uiTableId: "inputTokens",
    clickhouseTableName: "traces",
    clickhouseSelect: "session_input_usage",
    clickhouseTypeOverwrite: "Decimal64(3)",
  },
  {
    uiTableName: "Output Tokens",
    uiTableId: "outputTokens",
    clickhouseTableName: "traces",
    clickhouseSelect: "session_output_usage",
    clickhouseTypeOverwrite: "Decimal64(3)",
  },
  {
    uiTableName: "Total Tokens",
    uiTableId: "totalTokens",
    clickhouseTableName: "traces",
    clickhouseSelect: "session_total_usage",
    clickhouseTypeOverwrite: "Decimal64(3)",
  },
  {
    uiTableName: "Usage",
    uiTableId: "totalTokens",
    clickhouseTableName: "traces",
    clickhouseSelect: "session_total_usage",
    clickhouseTypeOverwrite: "Decimal64(3)",
  },
  {
    uiTableName: "Session Total Usage",
    uiTableId: "usage",
    clickhouseTableName: "traces",
    clickhouseSelect: "session_total_usage",
    clickhouseTypeOverwrite: "Decimal64(3)",
  },
  {
    uiTableName: "Session Duration (s)",
    uiTableId: "sessionDuration",
    clickhouseTableName: "traces",
    clickhouseSelect: "duration",
    // If we use the default of Decimal64(12), we cannot filter for more than ~40min due to an overflow
    clickhouseTypeOverwrite: "Decimal64(3)",
  },
  {
    uiTableName: "Traces Count",
    uiTableId: "tracesCount",
    clickhouseTableName: "traces",
    clickhouseSelect: "trace_count",
  },
  {
    uiTableName: "Input Cost ($)",
    uiTableId: "inputCost",
    clickhouseTableName: "traces",
    clickhouseSelect: "session_input_cost",
  },
  {
    uiTableName: "Output Cost ($)",
    uiTableId: "outputCost",
    clickhouseTableName: "traces",
    clickhouseSelect: "session_output_cost",
  },
  {
    uiTableName: "Total Cost ($)",
    uiTableId: "totalCost",
    clickhouseTableName: "traces",
    clickhouseSelect: "session_total_cost",
  },
  {
    uiTableName: "Trace Tags",
    uiTableId: "traceTags",
    clickhouseTableName: "traces",
    clickhouseSelect: "trace_tags",
  },
  {
    uiTableName: "ID",
    uiTableId: "id",
    clickhouseTableName: "traces",
    clickhouseSelect: "session_id",
  },
];
