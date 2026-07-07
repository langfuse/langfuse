import { formatColumnOptions } from "./typeHelpers";
import { ColumnDefinition, SingleValueOption } from "./types";

export const skillsTableCols: ColumnDefinition[] = [
  {
    name: "ID",
    id: "id",
    type: "string",
    internal: 's."id"',
  },
  {
    name: "Name",
    id: "name",
    type: "string",
    internal: 's."name"',
  },
  {
    name: "Version",
    id: "version",
    type: "number",
    internal: 's."version"',
  },
  {
    name: "Created At",
    id: "createdAt",
    type: "datetime",
    internal: 's."created_at"',
  },
  {
    name: "Updated At",
    id: "updatedAt",
    type: "datetime",
    internal: 's."updated_at"',
  },
  {
    name: "Labels",
    id: "labels",
    type: "arrayOptions",
    internal: 's."labels"',
    options: [], // to be added at runtime
  },
  {
    name: "Tags",
    id: "tags",
    type: "arrayOptions",
    internal: 's."tags"',
    options: [], // to be added at runtime
  },
];

export type SkillOptions = {
  tags: Array<SingleValueOption>;
  labels: Array<SingleValueOption>;
};

export function skillsTableColsWithOptions(
  options?: SkillOptions,
): ColumnDefinition[] {
  return skillsTableCols.map((col) => {
    if (col.id === "tags") {
      return formatColumnOptions(col, options?.tags ?? []);
    }
    if (col.id === "labels") {
      return formatColumnOptions(col, options?.labels ?? []);
    }
    return col;
  });
}
