import { UiColumnMapping } from "./types";

export const dashboardColumnDefinitions: UiColumnMapping[] = [
  {
    uiTableName: "Trace Name",
    uiTableId: "traceName",
    clickhouseTableName: "traces",
    clickhouseSelect: 't."name"',
  },
  {
    uiTableName: "Tags",
    uiTableId: "traceTags",
    clickhouseTableName: "traces",
    clickhouseSelect: 't."tags"',
  },
  {
    uiTableName: "Timestamp",
    uiTableId: "timestamp",
    clickhouseTableName: "traces",
    clickhouseSelect: 't."timestamp"',
  },
  {
    clickhouseTableName: "scores",
    clickhouseSelect: "name",
    uiTableId: "scoreName",
    uiTableName: "Score Name",
  },
  {
    clickhouseTableName: "scores",
    clickhouseSelect: "timestamp",
    uiTableId: "scoreTimestamp",
    uiTableName: "Score Timestamp",
  },
  {
    clickhouseTableName: "scores",
    clickhouseSelect: "source",
    uiTableId: "scoreSource",
    uiTableName: "Score Source",
  },
  {
    clickhouseTableName: "scores",
    clickhouseSelect: "data_type",
    uiTableId: "scoreDataType",
    uiTableName: "Scores Data Type",
  },
  {
    clickhouseTableName: "scores",
    clickhouseSelect: "value",
    uiTableId: "value",
    uiTableName: "value",
  },
  {
    clickhouseTableName: "observations",
    clickhouseSelect: "o.start_time",
    uiTableId: "startTime",
    uiTableName: "Start Time",
  },
  {
    clickhouseTableName: "observations",
    clickhouseSelect: "o.end_time",
    uiTableId: "endTime",
    uiTableName: "End Time",
  },
  {
    clickhouseTableName: "observations",
    clickhouseSelect: "o.type",
    uiTableId: "type",
    uiTableName: "Type",
  },
  {
    clickhouseTableName: "traces",
    clickhouseSelect: "t.user_id",
    uiTableId: "userId",
    uiTableName: "User",
  },
  {
    clickhouseTableName: "traces",
    clickhouseSelect: "t.release",
    uiTableId: "release",
    uiTableName: "Release",
  },
  {
    clickhouseTableName: "traces",
    clickhouseSelect: "t.version",
    uiTableId: "version",
    uiTableName: "Version",
  },
  {
    clickhouseTableName: "observations",
    clickhouseSelect: "provided_model_name",
    uiTableId: "model",
    uiTableName: "Model",
  },
];
