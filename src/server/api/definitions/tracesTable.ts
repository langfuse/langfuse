import {
  type OptionsDefinition,
  type ColumnDefinition,
} from "@/src/server/api/interfaces/tableDefinition";

export const tracesTableCols: ColumnDefinition[] = [
  { name: "id", type: "string", internal: "t.id" },
  {
    name: "name",
    type: "stringOptions",
    internal: 't."name"',
    options: [], // to be filled in at runtime
  },
  {
    name: "timestamp",
    type: "datetime",
    internal: 't."timestamp"',
  },
  { name: "userId", type: "string", internal: 't."user_id"' },
  {
    name: "metadata",
    type: "stringObject",
    internal: 't."metadata"',
  },
  {
    name: "scores_avg",
    type: "numberObject",
    internal: "scores_avg",
  },
  {
    name: "version",
    type: "string",
    internal: 't."version"',
  },
  {
    name: "release",
    type: "string",
    internal: 't."release"',
  },
];

export type TraceOptions = {
  scores_avg: Array<string>;
  name: Array<OptionsDefinition>;
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
    return col;
  });
}
