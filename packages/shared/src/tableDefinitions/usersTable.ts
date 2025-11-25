import { ColumnDefinition } from "./types";

export const usersTableCols: ColumnDefinition[] = [
  {
    name: "Timestamp",
    id: "timestamp",
    type: "datetime",
    internal: 't."timestamp"',
  },
  {
    name: "User ID",
    id: "userId",
    type: "stringOptions",
    options: [],
    internal: 'u."id"',
  },
];
