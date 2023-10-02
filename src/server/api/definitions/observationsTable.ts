import { type ColumnDefinition } from "@/src/server/api/interfaces/tableDefinition";

export const observationsTableCols: ColumnDefinition[] = [
  { name: "name", type: "string", internal: 'o."name"' },
  { name: "userId", type: "string", internal: 't."user_id"' },
  { name: "traceId", type: "string", internal: 't."id"' },
  { name: "model", type: "string", internal: 'o."model"' },
  { name: "traceName", type: "string", internal: 't."name"' },
];
