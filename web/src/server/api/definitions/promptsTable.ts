import { PromptType } from "@/src/features/prompts/server/utils/validation";
import {
  type ColumnDefinition,
  type OptionsDefinition,
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
  tags: Array<OptionsDefinition>;
  labels: Array<OptionsDefinition>;
};

export function promptsTableColsWithOptions(
  options?: PromptOptions,
): ColumnDefinition[] {
  return promptsTableCols.map((col) => {
    if (col.id === "tags") {
      return { ...col, options: options?.tags ?? [] };
    }
    if (col.id === "labels") {
      return { ...col, options: options?.labels ?? [] };
    }
    return col;
  });
}
