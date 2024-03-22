import {
  type OptionsDefinition,
  type ColumnDefinition,
} from "@/src/server/api/interfaces/tableDefinition";

export const tracesTableCols: ColumnDefinition[] = [
  { name: "⭐️", id: "bookmarked", type: "boolean", internal: "t.bookmarked" },
  { name: "id", id: "id", type: "string", internal: "t.id" },
  {
    name: "name",
    id: "name",
    type: "stringOptions",
    internal: 't."name"',
    options: [], // to be filled in at runtime
  },
  {
    name: "timestamp",
    id: "timestamp",
    type: "datetime",
    internal: 't."timestamp"',
  },
  { name: "userId", id: "userId", type: "string", internal: 't."user_id"' },
  {
    name: "metadata",
    id: "metadata",
    type: "stringObject",
    internal: 't."metadata"',
  },
  {
    name: "scores_avg",
    id: "scores_avg",
    type: "numberObject",
    internal: "scores_avg",
  },
  {
    name: "Latency (s)",
    id: "latency",
    type: "number",
    internal: "tl.latency",
  },
  {
    name: "Cost ($)",
    id: "totalCost",
    type: "number",
    internal: '"calculatedTotalCost"',
  },
  {
    name: "version",
    id: "version",
    type: "string",
    internal: 't."version"',
  },
  {
    name: "release",
    id: "release",
    type: "string",
    internal: 't."release"',
  },
  {
    name: "tags",
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
