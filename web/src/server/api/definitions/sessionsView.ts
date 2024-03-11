import { type ColumnDefinition } from "@/src/server/api/interfaces/tableDefinition";

export const sessionsViewCols: ColumnDefinition[] = [
  { name: "⭐️", id: "bookmarked", type: "boolean", internal: "s.bookmarked" },
  {
    name: "Id",
    id: "id",
    type: "string",
    internal: 's."id"',
  },
  {
    name: "User Id",
    id: "userIds",
    type: "string",
    internal: 't."userIds"',
  },
  {
    name: "Session duration (s)",
    id: "sessionDuration",
    type: "number",
    internal: 'o."sessionDuration"',
  },
  {
    name: "created At",
    id: "createdAt",
    type: "datetime",
    internal: 's."created_at"',
  },
  {
    name: "count Traces",
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
