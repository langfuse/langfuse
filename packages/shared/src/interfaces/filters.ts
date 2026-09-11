import { z } from "zod";

// Make sure to update the InMemoryFilterService if you add new filter types
export const filterOperators = {
  datetime: [">", "<", ">=", "<="],
  string: [
    "=",
    "contains",
    "does not contain",
    "starts with",
    "ends with",
    "is not empty",
  ],
  stringOptions: ["any of", "none of"],
  categoryOptions: ["any of", "none of"],
  arrayOptions: ["any of", "none of", "all of"],
  number: ["=", ">", "<", ">=", "<="],
  stringObject: [
    "=",
    "contains",
    "does not contain",
    "starts with",
    "ends with",
    "is set",
    "is not set",
  ],
  numberObject: ["=", ">", "<", ">=", "<="],
  booleanObject: ["=", "<>"],
  boolean: ["=", "<>"],
  null: ["is null", "is not null"],
  positionInTrace: ["="],
} as const;

export const FTS_MATCH_OPERATOR = "matches" as const;
export type FtsMatchOperator = typeof FTS_MATCH_OPERATOR;

export const timeFilter = z.object({
  column: z.string(),
  operator: z.enum(filterOperators.datetime),
  value: z.coerce.date(), // coerce required to parse stringified dates from the db in evals
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
export const arrayOptionsFilter = z
  .object({
    column: z.string(),
    operator: z.enum(filterOperators.arrayOptions),
    value: z.array(z.string()),
    type: z.literal("arrayOptions"),
  })
  .refine(
    (data) =>
      data.operator === "all of" ||
      data.operator === "none of" ||
      data.value.length > 0,
    {
      message:
        "Value array must not be empty unless operator is 'all of' or 'none of' (which represent waiting for selection)",
    },
  );
// Substring operators with an empty value skip the ngram prefilter and degrade
// to a full-scan key-existence check over the whole time window; reject them so
// callers use the `is set` / `is not set` presence operators instead. Applied as
// a wrapper (not a fixed schema) because Zod v4 forbids `.omit()` on a refined
// object, and some callers reshape the base before the guard can apply.
const EMPTY_VALUE_REJECTED_STRING_OBJECT_OPERATORS = new Set<string>([
  "contains",
  "starts with",
  "ends with",
]);
export const guardStringObjectValue = <T extends z.ZodObject<any>>(schema: T) =>
  schema.superRefine((data, ctx) => {
    const { operator, value } = data as { operator: string; value: string };
    if (
      EMPTY_VALUE_REJECTED_STRING_OBJECT_OPERATORS.has(operator) &&
      value.length === 0
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "Empty value is not allowed for 'contains', 'starts with', or 'ends with'. Use 'is set' / 'is not set' to filter on key presence.",
        path: ["value"],
      });
    }
  });

export const stringObjectFilterBase = z.object({
  type: z.literal("stringObject"),
  column: z.string(),
  key: z.string(), // eg metadata --> "environment"
  operator: z.enum(filterOperators.stringObject),
  value: z.string(),
});
export const stringObjectFilter = guardStringObjectValue(
  stringObjectFilterBase,
);

// Metadata `contains ""` / `starts with ""` / `ends with ""` was the historical
// way to express key presence before `is set` / `is not set` existed. The value
// guard now rejects it, so rewrite persisted filter state (eval configs, saved
// views) to the equivalent `is set` when reading it back, keeping legacy filters
// working instead of throwing on parse.
export const coerceLegacyEmptyMetadataFilters = (filters: unknown): unknown => {
  if (!Array.isArray(filters)) return filters;
  return filters.map((filter) => {
    if (
      filter &&
      typeof filter === "object" &&
      (filter as { type?: unknown }).type === "stringObject" &&
      (filter as { value?: unknown }).value === "" &&
      EMPTY_VALUE_REJECTED_STRING_OBJECT_OPERATORS.has(
        (filter as { operator?: unknown }).operator as string,
      )
    ) {
      return { ...(filter as object), operator: "is set" };
    }
    return filter;
  });
};
export const numberObjectFilter = z.object({
  type: z.literal("numberObject"),
  column: z.string(),
  key: z.string(), // eg scores --> "accuracy"
  operator: z.enum(filterOperators.number),
  value: z.number(),
});
export const booleanObjectFilter = z.object({
  type: z.literal("booleanObject"),
  column: z.string(),
  key: z.string(), // eg scores --> "is_hallucination"
  operator: z.enum(filterOperators.booleanObject),
  value: z.boolean(),
});
export const booleanFilter = z.object({
  type: z.literal("boolean"),
  column: z.string(),
  operator: z.enum(filterOperators.boolean),
  value: z.boolean(),
});
export const nullFilter = z.object({
  type: z.literal("null"),
  column: z.string(),
  operator: z.enum(filterOperators.null),
  value: z.literal(""),
});
export const positionInTraceFilter = z
  .object({
    type: z.literal("positionInTrace"),
    column: z.string(),
    operator: z.literal("="),
    key: z.enum(["root", "first", "last", "nthFromEnd", "nthFromStart"]),
    value: z.number().optional(),
  })
  .superRefine((data, ctx) => {
    const needsValue = data.key === "nthFromEnd" || data.key === "nthFromStart";
    if (needsValue && (!data.value || data.value < 1)) {
      ctx.addIssue({
        code: "custom",
        message: "Position must be >= 1 for nth selection",
        path: ["value"],
      });
    }
  });
export const categoryOptionsFilter = z.object({
  type: z.literal("categoryOptions"),
  column: z.string(),
  key: z.string(),
  operator: z.enum(filterOperators.categoryOptions),
  value: z.array(z.string()),
});
export const singleFilter = z.discriminatedUnion("type", [
  timeFilter,
  stringFilter,
  numberFilter,
  stringOptionsFilter,
  categoryOptionsFilter,
  arrayOptionsFilter,
  stringObjectFilter,
  numberObjectFilter,
  booleanObjectFilter,
  booleanFilter,
  nullFilter,
  positionInTraceFilter,
]);

const eventsTableStringOperator = z.union([
  z.enum(filterOperators.string),
  z.literal(FTS_MATCH_OPERATOR),
]);

const eventsTableStringObjectOperator = z.union([
  z.enum(filterOperators.stringObject),
  z.literal(FTS_MATCH_OPERATOR),
]);

export const eventsTableStringFilter = stringFilter.extend({
  operator: eventsTableStringOperator,
});

export const eventsTableStringObjectFilterBase = stringObjectFilterBase.extend({
  operator: eventsTableStringObjectOperator,
});
export const eventsTableStringObjectFilter = guardStringObjectValue(
  eventsTableStringObjectFilterBase,
);

export const eventsTableSingleFilter = z.discriminatedUnion("type", [
  timeFilter,
  eventsTableStringFilter,
  numberFilter,
  stringOptionsFilter,
  categoryOptionsFilter,
  arrayOptionsFilter,
  eventsTableStringObjectFilter,
  numberObjectFilter,
  booleanObjectFilter,
  booleanFilter,
  nullFilter,
  positionInTraceFilter,
]);

export const eventsTableFilterState = z.array(eventsTableSingleFilter);
