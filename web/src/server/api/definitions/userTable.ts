import { type ColumnDefinition } from "@langfuse/shared";

export const userTableFilters: ColumnDefinition[] = [
  {
    name: "Timestamp",
    id: "timestamp",
    type: "datetime",
    internal: 't."timestamp"',
  },
];
