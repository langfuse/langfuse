import { ObservationLevel } from "@prisma/client";
import { ColumnDefinition, OptionsDefinition } from ".";

const tracesOnlyCols: ColumnDefinition[] = [
  {
    name: "⭐️",
    id: "bookmarked",
    type: "boolean",
    internal: "t.bookmarked",
  },
  { name: "ID", id: "id", type: "string", internal: "t.id" },
  {
    name: "Name",
    id: "name",
    type: "stringOptions",
    internal: 't."name"',
    options: [], // to be filled in at runtime
    nullable: true,
  },
  {
    name: "Timestamp",
    id: "timestamp",
    type: "datetime",
    internal: 't."timestamp"',
  },
  {
    name: "User ID",
    id: "userId",
    type: "string",
    internal: 't."user_id"',
    nullable: true,
  },
  {
    name: "Session ID",
    id: "sessionId",
    type: "string",
    internal: 't."session_id"',
    nullable: true,
  },
  {
    name: "Metadata",
    id: "metadata",
    type: "stringObject",
    internal: 't."metadata"',
  },
  {
    name: "Version",
    id: "version",
    type: "string",
    internal: 't."version"',
    nullable: true,
  },
  {
    name: "Release",
    id: "release",
    type: "string",
    internal: 't."release"',
    nullable: true,
  },
  {
    name: "Level",
    id: "level",
    type: "stringOptions",
    internal: '"level"',
    options: Object.values(ObservationLevel).map((value) => ({ value })),
  },
  {
    name: "Tags",
    id: "tags",
    type: "arrayOptions",
    internal: 't."tags"',
    options: [], // to be filled in at runtime
  },
];
export const tracesTableCols: ColumnDefinition[] = [
  ...tracesOnlyCols,
  {
    name: "Input Tokens",
    id: "inputTokens",
    type: "number",
    internal: 'tm."promptTokens"',
    nullable: true,
  },
  {
    name: "Output Tokens",
    id: "outputTokens",
    type: "number",
    internal: 'tm."completionTokens"',
    nullable: true,
  },
  {
    name: "Total Tokens",
    id: "totalTokens",
    type: "number",
    internal: 'tm."totalTokens"',
    nullable: true,
  },
  {
    name: "Usage",
    id: "usage",
    type: "number",
    internal: 'tm."totalTokens"',
    nullable: true,
  },

  {
    name: "Scores",
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
    name: "Input Cost ($)",
    id: "inputCost",
    type: "number",
    internal: '"calculatedInputCost"',
    nullable: true,
  },
  {
    name: "Output Cost ($)",
    id: "outputCost",
    type: "number",
    internal: '"calculatedOutputCost"',
    nullable: true,
  },
  {
    name: "Total Cost ($)",
    id: "totalCost",
    type: "number",
    internal: '"calculatedTotalCost"',
    nullable: true,
  },
];

export const evalTableCols: ColumnDefinition[] = tracesOnlyCols;

export type TraceOptions = {
  scores_avg: Array<string>;
  name: Array<OptionsDefinition>;
  tags: Array<OptionsDefinition>;
};

export function tracesTableColsWithOptions(
  options?: TraceOptions,
  cols: ColumnDefinition[] = tracesTableCols
): ColumnDefinition[] {
  return cols.map((col) => {
    if (col.id === "scores_avg") {
      return { ...col, keyOptions: options?.scores_avg ?? [] };
    }
    if (col.id === "name") {
      return { ...col, options: options?.name ?? [] };
    }
    if (col.id === "tags") {
      return { ...col, options: options?.tags ?? [] };
    }
    return col;
  });
}
