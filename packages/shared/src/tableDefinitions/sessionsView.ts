import {
  type OptionsDefinition,
  type ColumnDefinition,
} from "../tableDefinitions/types";

export const sessionsViewCols: ColumnDefinition[] = [
  { name: "⭐️", id: "bookmarked", type: "boolean", internal: "s.bookmarked" },
  {
    name: "ID",
    id: "id",
    type: "string",
    internal: 's."id"',
  },
  {
    name: "User IDs",
    id: "userIds",
    type: "arrayOptions",
    internal: 't."userIds"',
    options: [], // to be filled in at runtime
  },
  {
    name: "Session Duration (s)",
    id: "sessionDuration",
    type: "number",
    internal: 'o."sessionDuration"',
  },
  {
    name: "Created At",
    id: "createdAt",
    type: "datetime",
    internal: 's."created_at"',
  },
  {
    name: "Traces Count",
    id: "countTraces",
    type: "number",
    internal: 't."countTraces"',
  },
  {
    name: "Input Cost ($)",
    id: "inputCost",
    type: "number",
    internal: 'o."inputCost"',
  },
  {
    name: "Output Cost ($)",
    id: "outputCost",
    type: "number",
    internal: 'o."outputCost"',
  },
  {
    name: "Total Cost ($)",
    id: "totalCost",
    type: "number",
    internal: 'o."totalCost"',
  },
  {
    name: "Input Tokens",
    id: "inputTokens",
    type: "number",
    internal: 'o."promptTokens"',
  },
  {
    name: "Output Tokens",
    id: "outputTokens",
    type: "number",
    internal: 'o."completionTokens"',
  },
  {
    name: "Total Tokens",
    id: "totalTokens",
    type: "number",
    internal: 'o."totalTokens"',
  },
  {
    name: "Usage",
    id: "usage",
    type: "number",
    internal: 'o."totalTokens"',
  },
];

export type SessionOptions = {
  userIds: Array<OptionsDefinition>;
};

export function sessionsTableColsWithOptions(
  options?: SessionOptions
): ColumnDefinition[] {
  return sessionsViewCols.map((col) => {
    if (col.id === "userIds") {
      return { ...col, options: options?.userIds ?? [] };
    }
    return col;
  });
}
