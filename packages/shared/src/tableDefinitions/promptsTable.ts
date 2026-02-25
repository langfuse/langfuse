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

export function webhookActionFilterOptions(): ColumnDefinition[] {
  return promptsTableCols.filter((col) => col.id === "name");
}

/**
 * Filter options available for trace-based automation triggers.
 * Includes trace fields available at ingestion time and observation-level
 * context (e.g. observation level) populated when an observation triggers the event.
 */
export function traceAutomationFilterOptions(): ColumnDefinition[] {
  return [
    {
      name: "Observation Level",
      id: "level",
      type: "stringOptions",
      internal: '"level"',
      options: [
        { value: "DEBUG" },
        { value: "DEFAULT" },
        { value: "WARNING" },
        { value: "ERROR" },
      ],
    },
    {
      name: "Name",
      id: "name",
      type: "string",
      internal: 't."name"',
    },
    {
      name: "Tags",
      id: "tags",
      type: "arrayOptions",
      internal: 't."tags"',
      options: [], // evaluated at runtime via InMemoryFilterService
    },
    {
      name: "Environment",
      id: "environment",
      type: "string",
      internal: 't."environment"',
    },
    {
      name: "User ID",
      id: "userId",
      type: "string",
      internal: 't."user_id"',
    },
    {
      name: "Release",
      id: "release",
      type: "string",
      internal: 't."release"',
    },
    {
      name: "Version",
      id: "version",
      type: "string",
      internal: 't."version"',
    },
  ];
}
