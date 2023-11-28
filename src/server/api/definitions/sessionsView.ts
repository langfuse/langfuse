import { type ColumnDefinition } from "@/src/server/api/interfaces/tableDefinition";

export const sessionsViewCols: ColumnDefinition[] = [
  { name: "userId", type: "string", internal: 't."user_id"' },
  {
    name: "timestamp",
    type: "datetime",
    internal: 't."timestamp"',
  },
  { name: "userId", type: "string", internal: 't."user_id"' },
];
