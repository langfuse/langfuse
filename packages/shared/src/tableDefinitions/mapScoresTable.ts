import { UiColumnMappings } from "./types";

export const scoresTableUiColumnDefinitions: UiColumnMappings = [
  {
    uiTableName: "ID",
    uiTableId: "id",
    clickhouseTableName: "scores",
    clickhouseSelect: "s.id",
  },
  {
    uiTableName: "Timestamp",
    uiTableId: "timestamp",
    clickhouseTableName: "scores",
    clickhouseSelect: "s.timestamp",
  },
  {
    uiTableName: "Environment",
    uiTableId: "environment",
    clickhouseTableName: "scores",
    clickhouseSelect: "s.environment",
  },
  {
    uiTableName: "Trace ID",
    uiTableId: "traceId",
    clickhouseTableName: "scores",
    clickhouseSelect: "s.trace_id",
  },
  {
    uiTableName: "Observation ID",
    uiTableId: "observationId",
    clickhouseTableName: "scores",
    clickhouseSelect: "s.observation_id",
  },
  {
    uiTableName: "Session ID",
    uiTableId: "sessionId",
    clickhouseTableName: "scores",
    clickhouseSelect: "s.session_id",
  },
  {
    uiTableName: "Name",
    uiTableId: "name",
    clickhouseTableName: "scores",
    clickhouseSelect: "s.name",
  },
  {
    uiTableName: "Value",
    uiTableId: "value",
    clickhouseTableName: "scores",
    clickhouseSelect: "s.value",
  },
  {
    uiTableName: "Source",
    uiTableId: "source",
    clickhouseTableName: "scores",
    clickhouseSelect: "s.source",
  },
  {
    uiTableName: "Comment",
    uiTableId: "comment",
    clickhouseTableName: "scores",
    clickhouseSelect: "s.comment",
  },
  {
    uiTableName: "Author User ID",
    uiTableId: "authorUserId",
    clickhouseTableName: "scores",
    clickhouseSelect: "s.author_user_id",
  },
  {
    uiTableName: "Data Type",
    uiTableId: "dataType",
    clickhouseTableName: "scores",
    clickhouseSelect: "s.data_type",
  },
  {
    uiTableName: "String Value",
    uiTableId: "stringValue",
    clickhouseTableName: "scores",
    clickhouseSelect: "s.string_value",
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
