import { z } from "zod";

export const filterOperators = {
  datetime: [">", "<", ">=", "<="],
  string: ["="],
  stringOptions: ["any of", "none of"],
  number: ["=", ">", "<", ">=", "<="],
  stringObject: ["="],
  numberObject: ["=", ">", "<", ">=", "<="],
} as const;

export const timeFilter = z.object({
  column: z.string(),
  operator: z.enum(filterOperators.datetime),
  value: z.date(),
  type: z.literal("datetime"),
});
export const stringFilter = z.object({
  column: z.string(),
  operator: z.enum(filterOperators.string),
  value: z.string(),
  type: z.literal("string"),
});
export const numberFilter = z.object({
  column: z.string(),
  operator: z.enum(filterOperators.number),
  value: z.number(),
  type: z.literal("number"),
});
export const stringOptionsFilter = z.object({
  column: z.string(),
  operator: z.enum(filterOperators.stringOptions),
  // do not filter on empty arrays, use refine to check this only at runtime (no type checking)
  value: z.array(z.string()).refine((v) => v.length > 0),
  type: z.literal("stringOptions"),
});
export const stringObjectFilter = z.object({
  type: z.literal("stringObject"),
  column: z.string(),
  key: z.string(), // eg metadata --> "environment"
  operator: z.enum(filterOperators.string),
  value: z.string(),
});
export const numberObjectFilter = z.object({
  type: z.literal("numberObject"),
  column: z.string(),
  key: z.string(), // eg scores --> "accuracy"
  operator: z.enum(filterOperators.number),
  value: z.number(),
});
export const singleFilter = z.discriminatedUnion("type", [
  timeFilter,
  stringFilter,
  numberFilter,
  stringOptionsFilter,
  stringObjectFilter,
  numberObjectFilter,
]);
