import { type ColumnDefinition } from "@/src/server/api/interfaces/tableDefinition";

export const tracesTableCols: ColumnDefinition[] = [
  { name: "id", type: "string", internal: "t.id" },
  { name: "userId", type: "string", internal: 't."user_id"' },
  { name: "name", type: "string", internal: 't."name"' },
];
