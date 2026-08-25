import {
  table,
  column,
  partitionKey,
  primaryKey,
  sortKeys,
  SortOrder,
  ColumnDataTypePrimitive as cdt,
  fnCall,
  FnTypePrimitive as ftp,
} from "../semanticModel";

// This doesn't include fields that are only relevant for the DB (e.g., default, codec)
//
// TODO: Add Engine
export const scoresTable = table(
  "scores",
  [
    column("id", cdt.enum.string),
    column("timestamp", cdt.enum.dateTime, false, { precision: 3 }),
    column("project_id", cdt.enum.string),
    column("trace_id", cdt.enum.string),
    column("observation_id", cdt.enum.string, true),
    column("name", cdt.enum.string),
    column("value", cdt.enum.float),
    column("source", cdt.enum.string),
    column("comment", cdt.enum.string, true),
    column("author_user_id", cdt.enum.string, true),
    column("config_id", cdt.enum.string, true),
    column("data_type", cdt.enum.string),
    column("string_value", cdt.enum.string, true),
    column("queue_id", cdt.enum.string, true),
    column("created_at", cdt.enum.dateTime, false, { precision: 3 }),
    column("updated_at", cdt.enum.dateTime, false, { precision: 3 }),
    column("is_deleted", cdt.enum.boolean),
  ],
  partitionKey([fnCall(ftp.enum.toYYYYMM, ["timestamp"])]),
  primaryKey(["project_id", fnCall(ftp.enum.toDate, ["timestamp"]), "name"]),
  sortKeys(
    ["project_id", fnCall(ftp.enum.toDate, ["timestamp"]), "name", "id"],
    SortOrder.enum.asc,
  ),
);
