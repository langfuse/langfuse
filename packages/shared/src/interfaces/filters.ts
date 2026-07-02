import { z } from "zod";

// Make sure to update the InMemoryFilterService if you add new filter types
export const filterOperators = {
  datetime: [">", "<", ">=", "<="],
  string: ["=", "contains", "does not contain", "starts with", "ends with"],
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
  ],
  numberObject: ["=", ">", "<", ">=", "<="],
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
  booleanFilter,
  nullFilter,
  positionInTraceFilter,
]);

/**
 * Nested boolean filter contract (Search/Filter v2).
 *
 * The legacy `FilterState` is a flat `FilterCondition[]` with an implicit AND.
 * A `filterExpression` is a tree: a leaf (`singleFilter`) or a `group` whose
 * children are themselves expressions, combined by `AND`/`OR`. This lets the
 * backend express cross-field OR, bracket grouping, and NOT-of-a-group that the
 * flat contract cannot represent.
 *
 * `filterInput` is the wire union accepted by consumers: either a flat
 * `FilterCondition[]` (back-compat) or a `filterExpression`. Flat arrays are
 * normalized to a top-level AND group via {@link normalizeFilterExpressionInput}
 * so there is a single representation downstream.
 *
 * Tenant isolation is NOT enforced here — it is structural: callers inject the
 * mandatory project/env/time predicates as an outer AND wrapping the user
 * expression (never inside it). {@link getMandatoryFilterExpressionLeafFilters}
 * returns the leaves reachable through AND only, so optimizations that depend on
 * a guaranteed predicate (e.g. trace-id hash pruning) never fire on a leaf that
 * sits under an OR and could be widened away.
 */
export const filterGroupOperator = z.enum(["AND", "OR"]);

type FilterConditionSchema = z.infer<typeof singleFilter>;
type FilterGroupSchema = {
  type: "group";
  operator: z.infer<typeof filterGroupOperator>;
  conditions: FilterExpressionSchema[];
};
type FilterExpressionSchema = FilterConditionSchema | FilterGroupSchema;
type FilterInputSchema =
  | FilterConditionSchema[]
  | FilterExpressionSchema
  | null
  | undefined;

export const filterExpression: z.ZodType<FilterExpressionSchema> = z.lazy(() =>
  z.union([singleFilter, filterGroup]),
);

export const filterGroup: z.ZodType<FilterGroupSchema> = z.lazy(() =>
  z.object({
    type: z.literal("group"),
    operator: filterGroupOperator,
    conditions: z.array(filterExpression).min(1),
  }),
);

/**
 * Bounds on a `filterExpression` tree ("bound the blast"). Depth counts nested
 * groups (a single AND/OR group is depth 1); the condition cap counts LEAF
 * conditions only (group containers don't count), so a flat array of N filters
 * — which normalizes to one wrapping AND group — caps at exactly N. These
 * protect ClickHouse and the recursive emitter/parser from pathological input.
 * They are enforced on {@link filterInput} (the v2 wire contract), so existing
 * flat `z.array(singleFilter)` consumers are unaffected.
 */
export const MAX_FILTER_EXPRESSION_DEPTH = 8;
export const MAX_FILTER_EXPRESSION_NODES = 64;

function measureFilterExpression(expression: FilterExpressionSchema): {
  leaves: number;
  depth: number;
} {
  if (expression.type !== "group") {
    return { leaves: 1, depth: 0 };
  }

  const childMeasures = expression.conditions.map(measureFilterExpression);
  return {
    leaves: childMeasures.reduce((sum, child) => sum + child.leaves, 0),
    depth:
      1 + childMeasures.reduce((max, child) => Math.max(max, child.depth), 0),
  };
}

/**
 * Returns a human-readable diagnostic when an expression exceeds the depth or
 * condition bounds, or `null` when it is within bounds. Pure — reused by both
 * the zod refinement on {@link filterInput} and the server-side compiler.
 */
export function getFilterExpressionBoundsIssue(
  expression?: FilterExpressionSchema,
): string | null {
  if (!expression) {
    return null;
  }

  const { leaves, depth } = measureFilterExpression(expression);

  if (depth > MAX_FILTER_EXPRESSION_DEPTH) {
    return `Filter is nested too deeply (max depth ${MAX_FILTER_EXPRESSION_DEPTH}).`;
  }

  if (leaves > MAX_FILTER_EXPRESSION_NODES) {
    return `Filter has too many conditions (max ${MAX_FILTER_EXPRESSION_NODES}).`;
  }

  return null;
}

export const filterInput = z
  .union([z.array(singleFilter), filterExpression])
  .superRefine((value, ctx) => {
    const issue = getFilterExpressionBoundsIssue(
      normalizeFilterExpressionInput(value),
    );
    if (issue) {
      ctx.addIssue({ code: "custom", message: issue });
    }
  });

export function normalizeFilterExpressionInput(
  filterInputValue?: FilterInputSchema,
): FilterExpressionSchema | undefined {
  if (!filterInputValue) {
    return undefined;
  }

  if (Array.isArray(filterInputValue)) {
    if (filterInputValue.length === 0) {
      return undefined;
    }

    return {
      type: "group",
      operator: "AND",
      conditions: filterInputValue,
    };
  }

  return filterInputValue;
}

export function isFilterGroup(
  filterValue: FilterExpressionSchema,
): filterValue is FilterGroupSchema {
  return filterValue.type === "group";
}

/**
 * All leaf conditions in the tree, regardless of operator. Use for metadata
 * (span attributes, "does this query touch scores?") — never for security
 * decisions, since a leaf may sit under an OR.
 */
export function getFilterExpressionLeafFilters(
  filterValue?: FilterExpressionSchema,
): FilterConditionSchema[] {
  if (!filterValue) {
    return [];
  }

  if (!isFilterGroup(filterValue)) {
    return [filterValue];
  }

  return filterValue.conditions.flatMap((condition) =>
    getFilterExpressionLeafFilters(condition),
  );
}

/**
 * Leaf conditions reachable through AND groups only. As soon as an OR group is
 * encountered, its subtree contributes nothing — an OR branch is not a
 * guaranteed predicate. This is the safe set for query optimizations and for
 * deriving values that must hold for every returned row (e.g. the start-time
 * window, trace-id hash pruning).
 */
export function getMandatoryFilterExpressionLeafFilters(
  filterValue?: FilterExpressionSchema,
): FilterConditionSchema[] {
  if (!filterValue) {
    return [];
  }

  if (!isFilterGroup(filterValue)) {
    return [filterValue];
  }

  // A multi-branch OR contributes no guaranteed predicate. A single-branch OR is
  // semantically just its child (and the SQL emitter unwraps it), so it stays
  // mandatory — keeping this in sync with applyCompiledFilterNode's collapse.
  if (filterValue.operator === "OR" && filterValue.conditions.length !== 1) {
    return [];
  }

  return filterValue.conditions.flatMap((condition) =>
    getMandatoryFilterExpressionLeafFilters(condition),
  );
}

/**
 * Combine multiple {@link FilterInput}s into a single AND, flattening nested
 * top-level AND groups (and flat arrays) so redundant `AND(AND(...))` wrappers
 * never waste the depth budget. Returns a flat `FilterState` when every combined
 * condition is a leaf (so the facet sidebar can still own it), a nested
 * `FilterExpression` when any branch is a group, or `undefined` when nothing
 * remains. Use this anywhere a user filter is AND-conjoined with mandatory
 * predicates (managed-env default, page-scope filters, preserved leaves).
 */
export function combineFilterInputsWithAnd(
  ...inputs: (FilterInputSchema | undefined)[]
):
  | FilterConditionSchema[]
  | FilterGroupSchema
  | FilterConditionSchema
  | undefined {
  const conditions: FilterExpressionSchema[] = [];
  for (const input of inputs) {
    const expression = normalizeFilterExpressionInput(input);
    if (!expression) continue;
    if (expression.type === "group" && expression.operator === "AND") {
      conditions.push(...expression.conditions);
    } else {
      conditions.push(expression);
    }
  }

  if (conditions.length === 0) return undefined;

  // All leaves → a flat FilterState array (sidebar-owned, codec stays delimited).
  if (conditions.every((condition) => condition.type !== "group")) {
    return conditions as FilterConditionSchema[];
  }

  if (conditions.length === 1) return conditions[0];

  return { type: "group", operator: "AND", conditions };
}

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
  booleanFilter,
  nullFilter,
  positionInTraceFilter,
]);

export const eventsTableFilterState = z.array(eventsTableSingleFilter);
