import { ColumnDefinition } from "./types";

export const datasetItemFilterColumns: ColumnDefinition[] = [
  {
    name: "Status",
    id: "status",
    type: "stringOptions",
    internal: "di.status::text",
    options: [{ value: "ACTIVE" }, { value: "ARCHIVED" }],
  },
  {
    name: "Metadata",
    id: "metadata",
    type: "stringObject",
    internal: 'di."metadata"',
  },
];
