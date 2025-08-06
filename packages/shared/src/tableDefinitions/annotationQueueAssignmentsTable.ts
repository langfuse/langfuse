import { ColumnDefinition } from "./types";

export const annotationQueueAssignmentsTableCols: ColumnDefinition[] = [
  {
    name: "User ID",
    id: "userId",
    type: "stringOptions",
    options: [],
    internal: 'u."id"',
  },
];
