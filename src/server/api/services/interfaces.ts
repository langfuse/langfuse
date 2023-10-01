import { z } from "zod";

// Filters
export const timeFilter = z.object({
  column: z.string(),
  operator: z.enum(["=", ">", "<", ">=", "<=", "in", "like"]),
  value: z.date(),
  type: z.literal("datetime"),
});
export const singleFilter = z.discriminatedUnion("type", [
  timeFilter,
  z.object({
    column: z.string(),
    operator: z.enum(["=", ">", "<", ">=", "<=", "in", "like"]),
    value: z.string(),
    type: z.literal("string"),
  }),
  z.object({
    column: z.string(),
    operator: z.enum(["=", ">", "<", ">=", "<=", "in", "like"]),
    value: z.number(),
    type: z.literal("number"),
  }),
]);

export type Column = {
  name: string;
  type: string;
  internal: string;
};

export type TableDefinitions = {
  [tableName: string]: {
    table: string;
    columns: Column[];
  };
};
