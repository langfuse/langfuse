import { z } from "zod";

export const timeFilter = z.object({
  column: z.string(),
  operator: z.enum(["=", ">", "<", ">=", "<="]),
  value: z.date(),
  type: z.literal("datetime"),
});
export const stringFilter = z.object({
  column: z.string(),
  operator: z.enum(["="]),
  value: z.string(),
  type: z.literal("string"),
});
export const numberFilter = z.object({
  column: z.string(),
  operator: z.enum(["=", ">", "<", ">=", "<="]),
  value: z.number(),
  type: z.literal("number"),
});
export const stringOptionsFilter = z.object({
  column: z.string(),
  operator: z.enum(["any of", "none of"]),
  value: z.array(z.string()),
  type: z.literal("stringOptions"),
});
export const singleFilter = z.discriminatedUnion("type", [
  timeFilter,
  stringFilter,
  numberFilter,
  stringOptionsFilter,
]);
