import { UiColumnMappings } from "./types";

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
