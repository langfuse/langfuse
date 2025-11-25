import { ColumnDefinition } from "./types";

export const datasetItemFilterColumns: ColumnDefinition[] = [
  {
    name: "Metadata",
    id: "metadata",
    type: "stringObject",
    internal: 'di."metadata"',
  },
];
