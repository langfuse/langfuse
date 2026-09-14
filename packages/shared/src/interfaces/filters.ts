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
// A substring operator with an empty value skips the ngram prefilter and
// degrades to a full-scan key-existence check over the whole time window — the
// same semantics the `is set` presence operator now expresses cleanly. Empty
// substrings are the legacy spelling of presence, so callers coerce them to
// `is set` (see `coerceLegacyEmptyMetadataFilters`) rather than reject them.
const LEGACY_EMPTY_SUBSTRING_STRING_OBJECT_OPERATORS = new Set<string>([
  "contains",
  "starts with",
  "ends with",
]);

export const stringObjectFilter = z.object({
  type: z.literal("stringObject"),
  column: z.string(),
  key: z.string(), // eg metadata --> "environment"
  operator: z.enum(filterOperators.stringObject),
  value: z.string(),
});

// Metadata `contains ""` / `starts with ""` / `ends with ""` was the historical
// way to express key presence before `is set` / `is not set` existed. Rewrite
// that shape to the equivalent `is set` at every parse boundary — fresh API
// input and persisted reads alike — so it never reaches the SQL layer as an
// empty substring and never throws on parse.
export const coerceLegacyEmptyMetadataFilters = (filters: unknown): unknown => {
  if (!Array.isArray(filters)) return filters;
  return filters.map((filter) => {
    if (
      filter &&
      typeof filter === "object" &&
      (filter as { type?: unknown }).type === "stringObject" &&
      (filter as { value?: unknown }).value === "" &&
      LEGACY_EMPTY_SUBSTRING_STRING_OBJECT_OPERATORS.has(
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

// Single choke point for parsing arrays of filters. `z.preprocess` runs the
// legacy-empty-substring coercion before validation, so both fresh API/tRPC
// input and persisted reads route through one place instead of remembering to
// wrap each call site. Prefer this over a bare `z.array(singleFilter)`.
// The cast pins the input type to `SingleFilter[]`. Without it `z.preprocess`
// infers `unknown` input (the coercer takes `unknown`), which would surface as
// `unknown` on tRPC mutation variables and form values that consume `z.input`.
// A legacy `contains ""` filter is itself a valid `singleFilter`, so the coerced
// shape is fully within this input type.
export const singleFilterList = z.preprocess(
  coerceLegacyEmptyMetadataFilters,
  z.array(singleFilter),
) as z.ZodType<z.output<typeof singleFilter>[], z.input<typeof singleFilter>[]>;

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

export const eventsTableStringObjectFilter = stringObjectFilter.extend({
  operator: eventsTableStringObjectOperator,
});

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
