import { type ColumnDefinition } from "@/src/server/api/interfaces/tableDefinition";

export const sessionsViewCols: ColumnDefinition[] = [
  { name: "⭐️", id: "bookmarked", type: "boolean", internal: "s.bookmarked" },
  {
    name: "id",
    id: "id",
    type: "string",
    internal: 's."id"',
  },
  {
    name: "userId",
    type: "string",
    internal: "array_to_string(t.\"userIds\", ', ')",
  },
  {
    name: "Session duration (s)",
    id: "sessionDuration",
    type: "number",
    internal: 'o."sessionDuration"',
  },
  {
    name: "createdAt",
    id: "createdAt",
    type: "datetime",
    internal: 's."created_at"',
  },
  {
    name: "countTraces",
    id: "countTraces",
    type: "number",
    internal: 't."countTraces"',
  },
];
