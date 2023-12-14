import { type ColumnDefinition } from "@/src/server/api/interfaces/tableDefinition";

export const sessionsViewCols: ColumnDefinition[] = [
  { name: "⭐️", type: "boolean", internal: "s.bookmarked" },
  {
    name: "userId",
    type: "string",
    internal: "array_to_string(t.\"userIds\", ', ')",
  },
  {
    name: "Session duration (s)",
    type: "number",
    internal: 'o."sessionDuration"',
  },
  {
    name: "createdAt",
    type: "datetime",
    internal: 's."created_at"',
  },
];
