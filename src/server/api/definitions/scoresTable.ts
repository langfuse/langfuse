import { type ColumnDefinition } from "@/src/server/api/interfaces/tableDefinition";

export const scoresTableCols: ColumnDefinition[] = [
  { name: "name", type: "string", internal: 's."name"' },
  { name: "userId", type: "string", internal: 't."user_id"' },
  { name: "timestamp", type: "datetime", internal: 's."timestamp"' },
];
