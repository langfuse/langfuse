import { type ColumnDefinition } from "@/src/server/api/interfaces/tableDefinition";

export const sessionsViewCols: ColumnDefinition[] = [
  { name: "⭐️", id: "bookmarked", type: "boolean", internal: "s.bookmarked" },
  {
    name: "ID",
    id: "id",
    type: "string",
    internal: 's."id"',
  },
  {
    name: "User ID",
    id: "userId",
    type: "string",
    internal: "array_to_string(t.\"userIds\", ', ')",
  },
  {
    name: "Session Duration",
    id: "sessionDuration",
    type: "number",
    internal: 'o."sessionDuration"',
  },
  {
    name: "Created At",
    id: "createdAt",
    type: "datetime",
    internal: 's."created_at"',
  },
  {
    name: "Traces",
    id: "countTraces",
    type: "number",
    internal: 't."countTraces"',
  },
  {
    name: "Total Cost",
    id: "totalCost",
    type: "number",
    internal: 'o."totalCost"',
  },
];
