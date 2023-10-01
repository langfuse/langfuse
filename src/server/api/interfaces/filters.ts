import { z } from "zod";

export const timeFilter = z.object({
  column: z.string(),
  operator: z.enum(["=", ">", "<", ">=", "<=", "in", "like"]),
  value: z.date(),
  type: z.literal("datetime"),
});
export const stringFilter = z.object({
  column: z.string(),
  operator: z.enum(["=", ">", "<", ">=", "<=", "in", "like"]),
  value: z.string(),
  type: z.literal("string"),
});
export const numberFilter = z.object({
  column: z.string(),
  operator: z.enum(["=", ">", "<", ">=", "<=", "in", "like"]),
  value: z.number(),
  type: z.literal("number"),
});
export const singleFilter = z.discriminatedUnion("type", [
  timeFilter,
  stringFilter,
  numberFilter,
]);
