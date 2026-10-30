import { z } from "zod";
import { filterOperators, FTS_MATCH_OPERATOR } from "../interfaces/filters";
import { TracingSearchType } from "../interfaces/search";

/**
 * Client-safe filter predicate: a boolean tree over conditions and free-text
 * search, resolved against a registered source (see `sources.ts`). Conditions
 * keep the `FilterState` value variant (`type`), so every `FilterState`
 * condition maps onto exactly one leaf and back.
 */

export type PredicateOperator =
  | (typeof filterOperators)[keyof typeof filterOperators][number]
  | typeof FTS_MATCH_OPERATOR;
/** The closed operator set shared by every condition type. */
export const PREDICATE_OPERATORS: readonly PredicateOperator[] = [
  ...new Set<PredicateOperator>([
    ...Object.values(filterOperators).flat(),
    FTS_MATCH_OPERATOR,
  ]),
];

export type ConditionType = keyof typeof filterOperators;

const unkeyedField = z.object({ id: z.string() });
const keyedField = z.object({ id: z.string(), key: z.string() });

const conditionBase = {
  kind: z.literal("condition"),
  /** Host-owned target reference carried through from `FilterState`. */
  target: z.string().min(1).max(512).optional(),
};

const conditionSchemas = [
  z.object({
    ...conditionBase,
    type: z.literal("datetime"),
    field: unkeyedField,
    op: z.enum(filterOperators.datetime),
    value: z.coerce.date(),
  }),
  z.object({
    ...conditionBase,
    type: z.literal("string"),
    field: unkeyedField,
    op: z.union([
      z.enum(filterOperators.string),
      z.literal(FTS_MATCH_OPERATOR),
    ]),
    value: z.string(),
  }),
  z.object({
    ...conditionBase,
    type: z.literal("number"),
    field: unkeyedField,
    op: z.enum(filterOperators.number),
    value: z.number(),
  }),
  z.object({
    ...conditionBase,
    type: z.literal("stringOptions"),
    field: unkeyedField,
    op: z.enum(filterOperators.stringOptions),
    value: z.array(z.string()).refine((v) => v.length > 0),
  }),
  z.object({
    ...conditionBase,
    type: z.literal("categoryOptions"),
    field: keyedField,
    op: z.enum(filterOperators.categoryOptions),
    value: z.array(z.string()),
  }),
  z
    .object({
      ...conditionBase,
      type: z.literal("arrayOptions"),
      field: unkeyedField,
      op: z.enum(filterOperators.arrayOptions),
      value: z.array(z.string()),
    })
    .refine(
      (c) => c.op === "all of" || c.op === "none of" || c.value.length > 0,
      {
        message:
          "Value array must not be empty unless op is 'all of'/'none of'",
      },
    ),
  z.object({
    ...conditionBase,
    type: z.literal("stringObject"),
    field: keyedField,
    op: z.union([
      z.enum(filterOperators.stringObject),
      z.literal(FTS_MATCH_OPERATOR),
    ]),
    value: z.string(),
  }),
  z.object({
    ...conditionBase,
    type: z.literal("numberObject"),
    field: keyedField,
    op: z.enum(filterOperators.numberObject),
    value: z.number(),
  }),
  z.object({
    ...conditionBase,
    type: z.literal("booleanObject"),
    field: keyedField,
    op: z.enum(filterOperators.booleanObject),
    value: z.boolean(),
  }),
  z.object({
    ...conditionBase,
    type: z.literal("boolean"),
    field: unkeyedField,
    op: z.enum(filterOperators.boolean),
    value: z.boolean(),
  }),
  z.object({
    ...conditionBase,
    type: z.literal("null"),
    field: unkeyedField,
    op: z.enum(filterOperators.null),
  }),
  z
    .object({
      ...conditionBase,
      type: z.literal("positionInTrace"),
      field: z.object({
        id: z.string(),
        key: z.enum(["root", "first", "last", "nthFromEnd", "nthFromStart"]),
      }),
      op: z.enum(filterOperators.positionInTrace),
      value: z.number().optional(),
    })
    .refine(
      (c) =>
        (c.field.key !== "nthFromEnd" && c.field.key !== "nthFromStart") ||
        (c.value !== undefined && c.value >= 1),
      { message: "Position must be >= 1 for nth selection", path: ["value"] },
    ),
] as const;

export const predicateConditionSchema = z.discriminatedUnion(
  "type",
  conditionSchemas,
);
export type PredicateCondition = z.infer<typeof predicateConditionSchema>;

export const predicateSearchSchema = z.object({
  kind: z.literal("search"),
  text: z.string().min(1),
  scopes: z.array(TracingSearchType).min(1),
});
export type PredicateSearch = z.infer<typeof predicateSearchSchema>;

export type PredicateAnd = { kind: "and"; children: Predicate[] };
export type PredicateOr = { kind: "or"; children: Predicate[] };
export type PredicateNot = { kind: "not"; child: Predicate };

export type Predicate =
  | PredicateAnd
  | PredicateOr
  | PredicateNot
  | PredicateCondition
  | PredicateSearch;

export const predicateSchema: z.ZodType<Predicate> = z.lazy(() =>
  z.union([
    z.object({ kind: z.literal("and"), children: z.array(predicateSchema) }),
    z.object({ kind: z.literal("or"), children: z.array(predicateSchema) }),
    z.object({ kind: z.literal("not"), child: predicateSchema }),
    predicateConditionSchema,
    predicateSearchSchema,
  ]),
);
