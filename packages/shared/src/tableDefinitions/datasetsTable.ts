import { type ColumnDefinition } from "./types";

export const datasetsTableCols: ColumnDefinition[] = [
  {
    name: "ID",
    id: "id",
    type: "string",
    internal: 'd."id"',
  },
  {
    name: "Name",
    id: "name",
    type: "string",
    internal: 'd."name"',
  },
  {
    name: "Description",
    id: "description",
    type: "string",
    internal: 'd."description"',
    nullable: true,
  },
  {
    name: "Created At",
    id: "createdAt",
    type: "datetime",
    internal: 'd."created_at"',
  },
  {
    name: "Updated At",
    id: "updatedAt",
    type: "datetime",
    internal: 'd."updated_at"',
  },
  {
    name: "Metadata",
    id: "metadata",
    type: "stringObject",
    internal: 'd."metadata"',
    nullable: true,
  },
];
