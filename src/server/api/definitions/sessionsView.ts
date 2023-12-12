import { type ColumnDefinition } from "@/src/server/api/interfaces/tableDefinition";

export const sessionsViewCols: ColumnDefinition[] = [
  { name: "⭐️", type: "boolean", internal: "s.bookmarked" },
  { name: "userId", type: "string", internal: 't."user_id"' },
  {
    name: "createdAt",
    type: "datetime",
    internal: 's."created_at"',
  },
  { name: "Trace Name", type: "string", internal: 't."name"' },
  {
    name: "Session duration (s)",
    type: "number",
    internal: 'o."sessionDuration"/1000',
  },
];
