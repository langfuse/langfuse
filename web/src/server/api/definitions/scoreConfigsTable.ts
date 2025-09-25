import { type ColumnDefinition } from "@langfuse/shared";

export const scoreConfigsFilterCols: ColumnDefinition[] = [
  {
    name: "Archived",
    id: "isArchived",
    type: "boolean",
    internal: 'sc."is_archived"',
  },
];
