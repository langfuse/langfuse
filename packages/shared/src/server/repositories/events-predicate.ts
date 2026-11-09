/**
 * Lowers a `Predicate` over the events source (`src/query-ast/`) to Kysely
 * expressions over a query that reads events as `e`.
 * `compileEventsPredicate` renders it as `{ sql, params, requiresEventsFull }`
 * for the raw-SQL builders: after the project and soft-delete conditions,
 * the SQL `FilterList` emits for the same filter (`events-predicate.test.ts`).
 *
 * Out of scope: score and comment fields (they need a join or aggregation
 * the host query owns, which a WHERE-only condition cannot express), metadata
 * (absent from `EVENTS_FIELD_LOWERINGS`) and `positionInTrace` (a window
 * over the trace, not a row condition) throw. A condition's `target` is
 * host-owned and ignored here.
 */
import { expressionBuilder, type Expression, type SqlBool } from "kysely";

import { InvalidRequestError } from "../../errors/InvalidRequestError";
import { FTS_MATCH_OPERATOR } from "../../interfaces/filters";
import {
  type Predicate,
  type PredicateCondition,
} from "../../query-ast/predicate";
import {
  eventsPredicateSource,
  resolvePredicateSourceField,
} from "../../query-ast/sources";
import { convertDateToClickhouseDateTime } from "../clickhouse/client";
import { compileClickhouseCondition } from "../query-ast/compile";
import { getClickhouseKysely } from "../query-ast/dialect";
import { QueryCompileError } from "../query-ast/errors";
import type { ClickHouseDatabase } from "../query-ast/schema";
import {
  arrayDistinct,
  arraySlice,
  endsWith,
  hasAll,
  hasAllTokens,
  hasAny,
  literal,
  lower,
  position,
  startsWith,
  tokens,
  typedValue,
} from "../query-ast/extensions";
import {
  clickhouseAsciiLower,
  FTS_HAS_ALL_TOKENS_MAX_SEARCH_TOKENS,
  hasFtsSearchToken,
} from "../utils/searchText";
import { escapeSqlLikePattern } from "../utils/sqlLike";
import { clickhouseCompliantRandomCharacters } from "./clickhouse";
import {
  EVENTS_FIELD_LOWERINGS,
  type EventsFieldLowering,
  type ScalarFieldLowering,
} from "./events-predicate-fields";
import { scopedToEvents, type EventsExpressionBuilder } from "./events-selects";

type Condition = Expression<SqlBool>;

/** A condition type of `PredicateCondition`, narrowed to its value. */
type ConditionOf<T extends PredicateCondition["type"]> = Extract<
  PredicateCondition,
  { type: T }
>;

const DEFAULT_NUMBER_BIND_TYPE = "Decimal64(12)";
const STRING_ARRAY = "Array(String)";
const FTS_MATCH_TOKEN_ERROR = "`matches` requires at least one search token.";

/**
 * `predicate` as a condition over `e`. An empty `and` matches every row, an
 * empty `or` none.
 */
export const lowerEventsPredicate = scopedToEvents(
  (eb, predicate: Predicate): Condition => single(eb, lowerNode(eb, predicate)),
);

const paramPrefix = () => `pred${clickhouseCompliantRandomCharacters()}_`;

/**
 * A builder typed like the one of `selectFrom("events as e")`, for the
 * bridge, which hands each conjunct to its own `where`.
 */
const eventsExpressionBuilder = (): EventsExpressionBuilder =>
  expressionBuilder<{ e: ClickHouseDatabase["events"] }, "e">();

/** A condition's SQL text, binds, and whether it must read `events_full`. */
export type CompiledEventsCondition = {
  sql: string;
  params: Record<string, unknown>;
  requiresEventsFull: boolean;
};

/**
 * `predicate` as SQL over events read as `e` in `projectId`, for the raw-SQL
 * builders: the project and soft-delete conditions the compiler passes
 * inject, then the `FilterList` text for a conjunction of conditions, or
 * `true` for an empty one. Never empty, so callers splice `AND ${sql}`.
 * `requiresEventsFull` is the routing pass's verdict.
 * Placeholder names are unique per call.
 */
export function compileEventsPredicate(
  predicate: Predicate,
  projectId: string,
): CompiledEventsCondition {
  const parts = lowerNode(eventsExpressionBuilder(), predicate);
  // One `where` per conjunct chains them with AND and no enclosing
  // parentheses, like `FilterList`. An empty conjunction still needs a WHERE
  // for `compileClickhouseCondition` to add the project scoping to.
  let query = getClickhouseKysely().selectFrom("events as e");
  for (const part of parts.length === 0 ? [literal(true)] : parts) {
    query = query.where(part);
  }
  return compileClickhouseCondition(query, projectId, paramPrefix());
}

/**
 * The conjuncts `node` lowers to: one per condition of a conjunction,
 * flattened, so `and(a, b)` yields the conjuncts `a` and `b`. Every
 * condition lowers to exactly one conjunct.
 */
function lowerNode(eb: EventsExpressionBuilder, node: Predicate): Condition[] {
  switch (node.kind) {
    case "and":
      return node.children.flatMap((child) => lowerNode(eb, child));
    case "or":
      return node.children.length === 0
        ? [literal(false)]
        : [
            eb.or(
              node.children.map((child) => single(eb, lowerNode(eb, child))),
            ),
          ];
    case "not":
      // SQL three-valued logic: rows where the inner condition is NULL are
      // dropped, not matched.
      return [eb.not(eb.parens(single(eb, lowerNode(eb, node.child))))];
    case "condition":
      return lowerCondition(eb, node);
  }
}

/** One condition from conjuncts: `true` for none, parenthesized for several. */
function single(eb: EventsExpressionBuilder, parts: Condition[]): Condition {
  if (parts.length === 0) return literal(true);
  if (parts.length === 1) return parts[0];
  return eb.and(parts);
}

/**
 * The registry field and lowering of `condition`. Throws
 * `InvalidRequestError` for an unknown field or an operator the field does
 * not take (`null` conditions apply to every field, as in `FilterList`), and
 * `QueryCompileError` for a field or type compiled elsewhere.
 */
function resolveCondition(condition: PredicateCondition): {
  lowering: EventsFieldLowering;
} {
  const field = resolvePredicateSourceField(
    eventsPredicateSource,
    condition.field.id,
  );
  if (!field) {
    throw new InvalidRequestError(
      `Column ${condition.field.id} does not match a UI / CH table mapping.`,
    );
  }
  if (condition.type === "positionInTrace") {
    throw new QueryCompileError(
      "positionInTrace conditions select events by their place in the trace; compile them outside the row predicate.",
    );
  }
  if (
    condition.type !== "null" &&
    !field.operators[condition.type]?.includes(condition.op)
  ) {
    throw new InvalidRequestError(
      `Invalid filter '${condition.type}' '${condition.op}' for column '${condition.field.id}'.`,
    );
  }
  const lowering = EVENTS_FIELD_LOWERINGS[field.id];
  if (!lowering) {
    throw new QueryCompileError(
      `Conditions on '${field.id}' have no events predicate lowering; score and comment conditions compile through their own filters, and metadata has no lowering in EVENTS_FIELD_LOWERINGS.`,
    );
  }
  return { lowering };
}

const loweringKindError = (condition: PredicateCondition) =>
  new QueryCompileError(
    `'${condition.type}' conditions on '${condition.field.id}' need a lowering of another value kind.`,
  );

function lowerCondition(
  eb: EventsExpressionBuilder,
  condition: PredicateCondition,
): Condition[] {
  const { lowering } = resolveCondition(condition);
  switch (condition.type) {
    case "string":
      return lowerString(eb, textLowering(lowering, condition), condition);
    case "stringOptions":
      return [lowerStringOptions(eb, lowering, condition)];
    case "arrayOptions":
      if (lowering.kind !== "array") throw loweringKindError(condition);
      return [lowerArrayOptions(eb, lowering.value(eb), condition)];
    case "number":
      return [
        eb(
          lowering.value(eb),
          condition.op,
          typedValue(
            condition.value.toString(),
            lowering.numberBindType ?? DEFAULT_NUMBER_BIND_TYPE,
          ),
        ),
      ];
    case "datetime":
      // Precision 3 is the value's: a `Date` holds milliseconds. ClickHouse
      // compares it exactly against the `DateTime64(6)` columns.
      return [
        eb(
          lowering.value(eb),
          condition.op,
          typedValue(
            convertDateToClickhouseDateTime(new Date(condition.value)),
            "DateTime64(3, 'UTC')",
          ),
        ),
      ];
    case "boolean":
      return [
        eb(
          lowering.value(eb),
          condition.op,
          typedValue(condition.value, "Boolean"),
        ),
      ];
    case "null":
      return [lowerNull(eb, lowering, condition)];
    case "categoryOptions":
    case "stringObject":
    case "numberObject":
    case "booleanObject":
    case "positionInTrace":
      throw new QueryCompileError(
        `'${condition.type}' conditions on '${condition.field.id}' are not lowered.`,
      );
  }
}

/** `(value = '' OR value IS NULL)` */
const isEmptyOrNull = (
  eb: EventsExpressionBuilder,
  value: Expression<unknown>,
) => eb.or([eb(value, "=", literal("")), eb(value, "is", null)]);

/**
 * `hasAllTokens(lower(text), arraySlice(arrayDistinct(tokens(lower(search))), 1, 64))`:
 * the text-index prefilter of an input/output match.
 */
const textTokenPrefilter = (
  text: Expression<string>,
  search: Expression<string>,
) =>
  hasAllTokens(
    lower(text),
    arraySlice(
      arrayDistinct(tokens(lower(search))),
      literal(1),
      literal(FTS_HAS_ALL_TOKENS_MAX_SEARCH_TOKENS),
    ),
  );

/** `lower(value) LIKE lower(pattern)`: the ngram-index prefilter. */
const ngramLike = (
  eb: EventsExpressionBuilder,
  value: Expression<string>,
  pattern: string,
) => eb(lower(value), "like", lower(eb.val(pattern)));

/**
 * `({p:Array(String)})`, the operand of `IN`. Typed as one string, as Kysely
 * types a one-column subquery operand.
 */
const inList = (eb: EventsExpressionBuilder, values: string[]) =>
  eb.parens(typedValue<string>(values, STRING_ARRAY));

type TextLowering = Extract<
  ScalarFieldLowering,
  { kind: "string" | "nullableString" }
>;

/**
 * `lowering` of a string-valued field. Throws `QueryCompileError` when the
 * source field takes string conditions its lowering's value kind does not.
 */
function textLowering(
  lowering: ScalarFieldLowering,
  condition: PredicateCondition,
): TextLowering {
  if (lowering.kind === "string" || lowering.kind === "nullableString") {
    return lowering;
  }
  throw loweringKindError(condition);
}

function lowerString(
  eb: EventsExpressionBuilder,
  lowering: TextLowering,
  condition: ConditionOf<"string">,
): Condition[] {
  const { op, value: search } = condition;
  const value = lowering.value(eb);
  // Index facts and the non-null value they read; only string columns have
  // them.
  const indexed = lowering.kind === "string" ? lowering : undefined;
  const bound = eb.val(search);
  if (
    lowering.emptyEqualsNull &&
    search === "" &&
    (op === "=" ||
      op === "contains" ||
      op === "starts with" ||
      op === "ends with")
  ) {
    return [isEmptyOrNull(eb, value)];
  }
  // Substring operators prefilter on the ngram index for a non-empty value.
  const withNgram = (pattern: string, exact: Condition): Condition =>
    indexed?.ngramIndexed && search.length > 0
      ? eb.and([ngramLike(eb, indexed.value(eb), pattern), exact])
      : exact;
  const escaped = escapeSqlLikePattern(search);

  switch (op) {
    case "=": {
      const exact = eb(value, "=", bound);
      if (indexed?.textIndexed) {
        return [
          hasFtsSearchToken(search)
            ? eb.and([exact, textTokenPrefilter(indexed.value(eb), bound)])
            : exact,
        ];
      }
      return [
        indexed?.ngramIndexed
          ? eb.and([eb(lower(indexed.value(eb)), "=", lower(bound)), exact])
          : exact,
      ];
    }
    case "contains":
      return [
        withNgram(`%${escaped}%`, eb(position(value, bound), ">", literal(0))),
      ];
    case "does not contain": {
      const absent = eb(position(value, bound), "=", literal(0));
      // '' counts as NULL, so an empty value must not match.
      return [
        lowering.emptyEqualsNull
          ? eb.and([eb(value, "!=", literal("")), absent])
          : absent,
      ];
    }
    case "starts with":
      return [withNgram(`${escaped}%`, startsWith(value, bound))];
    case "ends with":
      return [withNgram(`%${escaped}`, endsWith(value, bound))];
    case "is not empty":
      return [
        eb.and([eb(value, "!=", literal("")), eb(value, "is not", null)]),
      ];
    case FTS_MATCH_OPERATOR: {
      if (!hasFtsSearchToken(search)) {
        throw new InvalidRequestError(FTS_MATCH_TOKEN_ERROR);
      }
      // The source admits `matches` on text-indexed fields only.
      if (!indexed?.textIndexed) throw loweringKindError(condition);
      const text = indexed.value(eb);
      return [
        eb.and([
          eb(position(lower(text), lower(bound)), ">", literal(0)),
          textTokenPrefilter(text, bound),
        ]),
      ];
    }
  }
}

function lowerStringOptions(
  eb: EventsExpressionBuilder,
  lowering: ScalarFieldLowering,
  { op, value: values }: ConditionOf<"stringOptions">,
): Condition {
  const value = lowering.value(eb);
  const list = inList(eb, values);
  const hasEmpty = lowering.emptyEqualsNull && values.includes("");
  if (op === "any of") {
    const listed = eb(value, "in", list);
    const matched =
      lowering.kind === "string" && lowering.ngramIndexed && values.length > 0
        ? eb.and([
            eb(
              lower(lowering.value(eb)),
              "in",
              inList(eb, values.map(clickhouseAsciiLower)),
            ),
            listed,
          ])
        : listed;
    // '' counts as NULL, so listing '' also matches NULL.
    return hasEmpty ? eb.or([matched, eb(value, "is", null)]) : matched;
  }
  const notInList = eb(value, "not in", list);
  if (!lowering.emptyEqualsNull) return notInList;
  // '' counts as NULL: exclude both, or only '' when '' is not listed.
  return eb.and([
    notInList,
    hasEmpty ? eb(value, "is not", null) : eb(value, "!=", literal("")),
  ]);
}

function lowerArrayOptions(
  eb: EventsExpressionBuilder,
  array: Expression<string[]>,
  { op, value: values }: ConditionOf<"arrayOptions">,
): Condition {
  const list = typedValue<string[]>(values, STRING_ARRAY);
  switch (op) {
    case "any of":
      return eb(hasAny(list, array), "=", literal(true));
    case "none of":
      return eb(hasAny(list, array), "=", literal(false));
    case "all of":
      return eb(hasAll(array, list), "=", literal(true));
  }
}

function lowerNull(
  eb: EventsExpressionBuilder,
  lowering: ScalarFieldLowering,
  { op }: ConditionOf<"null">,
): Condition {
  const value = lowering.value(eb);
  if (lowering.emptyEqualsNull) {
    return op === "is null"
      ? isEmptyOrNull(eb, value)
      : eb.and([eb(value, "!=", literal("")), eb(value, "is not", null)]);
  }
  return eb(value, op === "is null" ? "is" : "is not", null);
}
