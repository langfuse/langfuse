import { PromptType } from "@/src/features/prompts/server/utils/validation";
import {
  type ColumnDefinition,
  type SingleValueOption,
  formatColumnOptions,
} from "@langfuse/shared";

export const promptsTableCols: ColumnDefinition[] = [
  {
    name: "Name",
    id: "name",
    type: "string",
    internal: 'p."name"',
  },
  {
    name: "Version",
    id: "version",
    type: "number",
    internal: 'p."version"',
  },
  {
    name: "Created At",
    id: "createdAt",
    type: "datetime",
    internal: 'p."created_at"',
  },
  {
    name: "Updated At",
    id: "updatedAt",
    type: "datetime",
    internal: 'p."updated_at"',
  },
  {
    name: "Type",
    id: "type",
    type: "stringOptions",
    internal: 'p."type"',
    options: Object.values(PromptType).map((value) => ({ value })),
  },
  {
    name: "Labels",
    id: "labels",
    type: "arrayOptions",
    internal: 'p."labels"',
    options: [], // to be added at runtime
  },
  {
    name: "Tags",
    id: "tags",
    type: "arrayOptions",
    internal: 'p."tags"',
    options: [], // to be added at runtime
  },
];

export type PromptOptions = {
  tags: Array<SingleValueOption>;
  labels: Array<SingleValueOption>;
};

export function promptsTableColsWithOptions(
  options?: PromptOptions,
): ColumnDefinition[] {
  return promptsTableCols.map((col) => {
    if (col.id === "tags") {
      return formatColumnOptions(col, options?.tags ?? []);
    }
    if (col.id === "labels") {
      return formatColumnOptions(col, options?.labels ?? []);
    }
    return col;
  });
}
