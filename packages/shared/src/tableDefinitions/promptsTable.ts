import { PromptType } from "../features/prompts/types";
import { formatColumnOptions } from "./typeHelpers";
import { ColumnDefinition, SingleValueOption } from "./types";

export const promptsTableCols: ColumnDefinition[] = [
  {
    name: "ID",
    id: "id",
    type: "string",
    internal: 'p."id"',
  },
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
  {
    name: "Config",
    id: "config",
    type: "stringObject",
    internal: 'p."config"',
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

/** Prompt-source automation trigger columns. Labels use arrayOptions so any-of / all-of / none-of are configurable at the source. */
export function webhookActionFilterOptions(
  options?: Pick<PromptOptions, "labels">,
): ColumnDefinition[] {
  return promptsTableCols
    .filter((col) => col.id === "name" || col.id === "labels")
    .map((col) => {
      if (col.id === "labels") {
        return formatColumnOptions(col, options?.labels ?? []);
      }
      return col;
    });
}
