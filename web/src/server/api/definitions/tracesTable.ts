import {
  type OptionsDefinition,
  type ColumnDefinition,
} from "@/src/server/api/interfaces/tableDefinition";

export const tracesTableCols: ColumnDefinition[] = [
  { name: "⭐️", id: "bookmarked", type: "boolean", internal: "t.bookmarked" },
  { name: "ID", id: "id", type: "string", internal: "t.id" },
  {
    name: "Name",
    id: "name",
    type: "stringOptions",
    internal: 't."name"',
    options: [], // to be filled in at runtime
  },
  {
    name: "Timestamp",
    id: "timestamp",
    type: "datetime",
    internal: 't."timestamp"',
  },
  { name: "User ID", id: "userId", type: "string", internal: 't."user_id"' },
  {
    name: "Metadata",
    id: "metadata",
    type: "stringObject",
    internal: 't."metadata"',
  },
  {
    name: "Scores",
    id: "scores_avg",
    type: "numberObject",
    internal: "scores_avg",
  },
  {
    name: "Latency",
    id: "latency",
    type: "number",
    internal: "tl.latency",
  },
  {
    name: "Total Cost",
    id: "totalCost",
    type: "number",
    internal: '"calculatedTotalCost"',
  },
  {
    name: "Version",
    id: "version",
    type: "string",
    internal: 't."version"',
  },
  {
    name: "Release",
    id: "release",
    type: "string",
    internal: 't."release"',
  },
  {
    name: "Tags",
    id: "tags",
    type: "arrayOptions",
    internal: 't."tags"',
    options: [], // to be filled in at runtime
  },
];

export type TraceOptions = {
  scores_avg: Array<string>;
  name: Array<OptionsDefinition>;
  tags: Array<OptionsDefinition>;
};

export function tracesTableColsWithOptions(
  options?: TraceOptions,
): ColumnDefinition[] {
  return tracesTableCols.map((col) => {
    if (col.name === "scores_avg") {
      return { ...col, keyOptions: options?.scores_avg ?? [] };
    }
    if (col.name === "name") {
      return { ...col, options: options?.name ?? [] };
    }
    if (col.name === "tags") {
      return { ...col, options: options?.tags ?? [] };
    }
    return col;
  });
}
