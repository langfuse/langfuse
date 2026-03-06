import { UiColumnMappings } from "../../tableDefinitions";

export const scoresTableUiColumnDefinitions: UiColumnMappings = [
  {
    uiTableName: "ID",
    uiTableId: "id",
    clickhouseTableName: "scores",
    clickhouseSelect: "id",
  },
  {
    uiTableName: "Timestamp",
    uiTableId: "timestamp",
    clickhouseTableName: "scores",
    clickhouseSelect: "timestamp",
  },
  {
    uiTableName: "Environment",
    uiTableId: "environment",
    clickhouseTableName: "scores",
    clickhouseSelect: "environment",
  },
  {
    uiTableName: "Trace ID",
    uiTableId: "traceId",
    clickhouseTableName: "scores",
    clickhouseSelect: "trace_id",
  },
  {
    uiTableName: "Observation ID",
    uiTableId: "observationId",
    clickhouseTableName: "scores",
    clickhouseSelect: "observation_id",
  },
  {
    uiTableName: "Session ID",
    uiTableId: "sessionId",
    clickhouseTableName: "scores",
    clickhouseSelect: "session_id",
  },
  {
    uiTableName: "Name",
    uiTableId: "name",
    clickhouseTableName: "scores",
    clickhouseSelect: "name",
  },
  {
    uiTableName: "Value",
    uiTableId: "value",
    clickhouseTableName: "scores",
    clickhouseSelect: "value",
  },
  {
    uiTableName: "Source",
    uiTableId: "source",
    clickhouseTableName: "scores",
    clickhouseSelect: "source",
  },
  {
    uiTableName: "Comment",
    uiTableId: "comment",
    clickhouseTableName: "scores",
    clickhouseSelect: "comment",
  },
  {
    uiTableName: "Author User ID",
    uiTableId: "authorUserId",
    clickhouseTableName: "scores",
    clickhouseSelect: "author_user_id",
  },
  {
    uiTableName: "Data Type",
    uiTableId: "dataType",
    clickhouseTableName: "scores",
    clickhouseSelect: "data_type",
  },
  {
    uiTableName: "String Value",
    uiTableId: "stringValue",
    clickhouseTableName: "scores",
    clickhouseSelect: "string_value",
  },
  {
    uiTableName: "Metadata",
    uiTableId: "metadata",
    clickhouseTableName: "scores",
    clickhouseSelect: "metadata",
  },
  {
    uiTableName: "Trace Name",
    uiTableId: "traceName",
    clickhouseTableName: "traces",
    clickhouseSelect: "t.name",
  },
  {
    uiTableName: "User ID",
    uiTableId: "userId",
    clickhouseTableName: "traces",
    clickhouseSelect: "t.user_id",
  },
  {
    uiTableName: "Trace Tags",
    uiTableId: "trace_tags",
    clickhouseTableName: "traces",
    clickhouseSelect: "t.tags",
  },
];

/**
 * v4 column definitions for scores table — trace columns reference the traces
 * CTE built from a flat EventsQueryBuilder. The CTE is joined as alias "e".
 */
export const scoresTableUiColumnDefinitionsFromEvents: UiColumnMappings = [
  // All scores-native columns are identical to v3
  ...scoresTableUiColumnDefinitions.filter(
    (c) => c.clickhouseTableName === "scores",
  ),
  {
    uiTableName: "Trace Name",
    uiTableId: "traceName",
    clickhouseTableName: "traces",
    clickhouseSelect: "name",
    queryPrefix: "e",
  },
  {
    uiTableName: "User ID",
    uiTableId: "userId",
    clickhouseTableName: "traces",
    clickhouseSelect: "user_id",
    queryPrefix: "e",
  },
  {
    uiTableName: "Trace Tags",
    uiTableId: "trace_tags",
    clickhouseTableName: "traces",
    clickhouseSelect: "tags",
    queryPrefix: "e",
  },
];
