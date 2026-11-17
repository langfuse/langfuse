/**
 * Lowers a `Predicate` over the events source (`src/query-ast/`) to Kysely
 * expressions over a query that reads events as `e`, and its free-text
 * `search` to a separate expression. `compileEventsPredicate` /
 * `compileEventsSearch` render either as `{ sql, params, requiresEventsFull }`
 * for the raw-SQL builders: after the project condition, the SQL
 * `FilterList` and `eventSearchCondition` emit for the same filter
 * (`events-predicate.golden.test.ts`).
 *
 * Out of scope: score and comment fields (they need a join or aggregation
 * the host query owns, which a WHERE-only condition cannot express) and
 * `positionInTrace` (a window over the trace, not a row condition) throw.
 * A condition's `target` is host-owned and ignored here.
 */
import { expressionBuilder, type Expression, type SqlBool } from "kysely";

import { InvalidRequestError } from "../../errors/InvalidRequestError";
import { FTS_MATCH_OPERATOR } from "../../interfaces/filters";
import {
  TRACING_SEARCH_TYPE_REQUIRED_MESSAGE,
  TracingSearchType,
} from "../../interfaces/search";
import {
  type Predicate,
  type PredicateCondition,
  type PredicateSearch,
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
  empty,
  endsWith,
  firstMetadataValue,
  has,
  hasAll,
  hasAllTokens,
  hasAny,
  literal,
  lower,
  metadataSubstringPrefilter,
  metadataTokenPrefilter,
  notEmpty,
  position,
  startsWith,
  toFloat64OrNull,
  tokens,
  typedValue,
} from "../query-ast/extensions";
import {
  clickhouseAsciiLower,
  FTS_HAS_ALL_TOKENS_MAX_SEARCH_TOKENS,
  hasFtsSearchToken,
  toJsonUnicodeEscaped,
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

/**
 * The free-text `search` as a condition over `e`, OR-ed over its scopes.
 * Throws `InvalidRequestError` for an empty text, an empty scope list or a
 * scope outside `TracingSearchType`, and `QueryCompileError` when the scopes
 * have no search column in `eventsPredicateSource.searchScopes`.
 */
export const lowerEventsSearch = scopedToEvents(
  (eb, search: PredicateSearch): Condition => {
    const disjuncts = searchDisjuncts(eb, checkSearch(search));
    // Parenthesized also when there is one disjunct.
    return disjuncts.length === 1 ? eb.parens(disjuncts[0]) : eb.or(disjuncts);
  },
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

/** The events select a bridge condition is compiled from. */
const eventsConditionQuery = () =>
  getClickhouseKysely().selectFrom("events as e");

/**
 * `predicate` as SQL over events read as `e` in `projectId`, for the raw-SQL
 * builders: the project condition the tenancy pass injects, then the
 * `FilterList` text for a conjunction of conditions, or `true` for an empty
 * one. Never empty, so callers splice `AND ${sql}`.
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
  let query = eventsConditionQuery();
  for (const part of parts.length === 0 ? [literal(true)] : parts) {
    query = query.where(part);
  }
  return compileClickhouseCondition(query, projectId, paramPrefix());
}

/**
 * `search` as SQL over events read as `e` in `projectId`, for the raw-SQL
 * builders: the project condition the tenancy pass injects, then the
 * parenthesized disjunction `eventSearchCondition` emits after its `AND`.
 * `requiresEventsFull` is the routing pass's verdict.
 * Placeholder names are unique per call.
 */
export function compileEventsSearch(
  search: PredicateSearch,
  projectId: string,
): CompiledEventsCondition {
  const query = eventsConditionQuery().where((eb) =>
    lowerEventsSearch(eb, search),
  );
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
  if (condition.type === "positionInTrace") {
    throw new QueryCompileError(
      "positionInTrace conditions select events by their place in the trace; compile them outside the row predicate.",
    );
  }
  const field = resolvePredicateSourceField(
    eventsPredicateSource,
    condition.field.id,
  );
  if (!field) {
    throw new InvalidRequestError(
      `Column ${condition.field.id} does not match a UI / CH table mapping.`,
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
      `Conditions on '${field.id}' have no events predicate lowering; score and comment conditions compile through their own filters.`,
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
  return lowerFieldCondition(
    eb,
    resolveCondition(condition).lowering,
    condition,
  );
}

/**
 * `condition` as conjuncts over `e`, comparing the value `lowering` gives;
 * `condition.field.id` is not looked up. For a host whose fields have their
 * own lowerings (the dashboard observations view), which checks that a
 * field takes the condition's type and operator. A type the lowering's value
 * kind does not take throws `QueryCompileError`, as do the condition types no
 * lowering takes (`categoryOptions`, `booleanObject`, `positionInTrace`, …).
 */
export const lowerEventsFieldCondition = scopedToEvents(
  (
    eb,
    lowering: EventsFieldLowering,
    condition: PredicateCondition,
  ): Condition[] => lowerFieldCondition(eb, lowering, condition),
);

/**
 * The conjuncts of {@link lowerEventsFieldCondition}: a metadata lowering
 * takes the metadata conditions, any other lowering dispatches on
 * `condition.type`.
 */
function lowerFieldCondition(
  eb: EventsExpressionBuilder,
  lowering: EventsFieldLowering,
  condition: PredicateCondition,
): Condition[] {
  if (lowering.kind === "metadata") {
    return lowerMetadataCondition(eb, condition);
  }
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

/**
 * `condition` on a string field. An empty value under `=`, `contains`,
 * `starts with` or `ends with` matches empty-or-NULL on an
 * `emptyEqualsNull` field. Indexed columns add an ngram or text-token
 * prefilter. `matches` throws unless the field is text-indexed.
 */
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
  array: Expression<Array<string | null>>,
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

type MetadataKeyCondition =
  | ConditionOf<"stringObject">
  | ConditionOf<"numberObject">;

/**
 * Metadata conditions: `stringObject` and numeric `numberObject` on a key,
 * and `null` on the whole map. A key condition requires the key
 * (`has(names, k)`, which a bloom filter on `metadata_names` prunes with) and
 * reads the first entry of a duplicated key, `values[indexOf(names, k)]`.
 */
function lowerMetadataCondition(
  eb: EventsExpressionBuilder,
  condition: PredicateCondition,
): Condition[] {
  if (condition.type === "null") {
    // Absent metadata is an empty names array.
    const names = eb.ref("e.metadata_names");
    return [condition.op === "is null" ? empty(names) : notEmpty(names)];
  }
  const keyed = checkMetadataKeyCondition(condition);
  return keyed.type === "numberObject"
    ? lowerNumericMetadata(eb, keyed)
    : lowerStringMetadata(eb, keyed);
}

/**
 * `condition` as a key condition. Throws `QueryCompileError` for a type the
 * metadata lowering does not take, and `InvalidRequestError` for an empty
 * substring value or a `matches` value without a search token.
 */
function checkMetadataKeyCondition(
  condition: PredicateCondition,
): MetadataKeyCondition {
  if (condition.type === "numberObject") return condition;
  if (condition.type !== "stringObject") {
    throw new QueryCompileError(
      `'${condition.type}' conditions on metadata are not lowered.`,
    );
  }
  const { op, value } = condition;
  if (
    (op === "contains" || op === "starts with" || op === "ends with") &&
    value.length === 0
  ) {
    throw new InvalidRequestError(
      `Empty value is not allowed for metadata '${op}' filters. Use the 'is set' / 'is not set' operators to filter on key presence.`,
    );
  }
  if (op === FTS_MATCH_OPERATOR && !hasFtsSearchToken(value)) {
    throw new InvalidRequestError(FTS_MATCH_TOKEN_ERROR);
  }
  return condition;
}

/**
 * `has(names, k) AND toFloat64OrNull(values[indexOf(names, k)]) <op> v`.
 * A value that does not parse (NULL) matches neither the comparison nor its
 * `not`. `'inf'` and `'1e400'` parse to `inf` and compare as infinity;
 * `'nan'` parses to `nan`, which no comparison matches but `not` does.
 */
function lowerNumericMetadata(
  eb: EventsExpressionBuilder,
  { field, op, value }: ConditionOf<"numberObject">,
): Condition[] {
  const names = eb.ref("e.metadata_names");
  const key = eb.val(field.key);
  const entry = firstMetadataValue(names, eb.ref("e.metadata_values"), key);
  return [
    has(names, key),
    eb(toFloat64OrNull(entry), op, typedValue<number>(value, "Float64")),
  ];
}

/**
 * The conjuncts of a string key condition: `has(names, k)`, an index
 * prefilter where one applies, then the comparison of the key's first entry.
 */
function lowerStringMetadata(
  eb: EventsExpressionBuilder,
  { field, op, value: search }: ConditionOf<"stringObject">,
): Condition[] {
  const names = eb.ref("e.metadata_names");
  const values = eb.ref("e.metadata_values");
  const key = eb.val(field.key);
  const hasKey = has(names, key);
  const entry = firstMetadataValue(names, values, key);
  const bound = eb.val(search);

  switch (op) {
    case "=": {
      const equal = eb(entry, "=", bound);
      return hasFtsSearchToken(search)
        ? [hasKey, metadataTokenPrefilter(values, search, op), equal]
        : [hasKey, equal];
    }
    case "contains":
      return [
        hasKey,
        metadataSubstringPrefilter(values, search, op),
        eb(position(entry, bound), ">", literal(0)),
      ];
    case "does not contain":
      return [hasKey, eb(position(entry, bound), "=", literal(0))];
    case "starts with":
      return [
        hasKey,
        metadataSubstringPrefilter(values, search, op),
        eb.parens(startsWith(entry, bound)),
      ];
    case "ends with":
      return [
        hasKey,
        metadataSubstringPrefilter(values, search, op),
        eb.parens(endsWith(entry, bound)),
      ];
    case "is set":
      return [hasKey];
    case "is not set":
      return [eb.not(eb.parens(hasKey))];
    case FTS_MATCH_OPERATOR:
      return [
        hasKey,
        metadataTokenPrefilter(values, search, op),
        eb(position(entry, bound), ">", literal(0)),
      ];
  }
}

/**
 * `search`, or `InvalidRequestError` for what `predicateSearchSchema` rejects
 * too: an empty text (it would match every row), an empty scope list, or a
 * scope outside `TracingSearchType` (both would match none).
 */
function checkSearch(search: PredicateSearch): PredicateSearch {
  if (search.text.length === 0) {
    throw new InvalidRequestError("Search text must not be empty.");
  }
  if (search.scopes.length === 0) {
    throw new InvalidRequestError(TRACING_SEARCH_TYPE_REQUIRED_MESSAGE);
  }
  const unknown = search.scopes.filter(
    (scope) => !TracingSearchType.safeParse(scope).success,
  );
  if (unknown.length > 0) {
    throw new InvalidRequestError(
      `Unknown search scope ${JSON.stringify(unknown)}.`,
    );
  }
  return search;
}

/** A search text and its `LIKE '%text%'` pattern. */
type SearchText = { text: string; pattern: string };

const searchText = (text: string): SearchText => ({
  text,
  pattern: `%${escapeSqlLikePattern(text)}%`,
});

/** The search disjuncts one search column contributes. */
type SearchMatcher = (
  eb: EventsExpressionBuilder,
  search: SearchText,
) => Condition[];

/** The search lanes in the order their disjuncts are emitted. */
const SEARCH_LANES: readonly TracingSearchType[] = TracingSearchType.options;

/**
 * `column ILIKE pattern`, AND-ed with the text-index prefilter when the text
 * has a search token.
 */
const ioLike = (
  eb: EventsExpressionBuilder,
  column: Expression<string>,
  { text, pattern }: SearchText,
): Condition => {
  const bound = eb.val(pattern);
  const match = eb(column, "ilike", bound);
  return hasFtsSearchToken(text)
    ? eb.and([match, textTokenPrefilter(column, bound)])
    : match;
};

/**
 * An input/output match: `ioLike` for the text, and again for its
 * `\uXXXX`-escaped form when that differs (JSON written with `ensure_ascii`).
 */
const ioMatcher =
  (column: "e.input" | "e.output"): SearchMatcher =>
  (eb, search) => {
    const escaped = searchText(toJsonUnicodeEscaped(search.text));
    return [
      ioLike(eb, eb.ref(column), search),
      ...(escaped.text !== search.text
        ? [ioLike(eb, eb.ref(column), escaped)]
        : []),
    ];
  };

/**
 * Search matchers per search column of `eventsPredicateSource`: ids by exact
 * equality (their bloom filter and the primary key), names by
 * `lower(col) LIKE lower('%text%')` (their ngram index), input and output by
 * `ioMatcher`.
 */
const SEARCH_MATCHERS: Record<string, SearchMatcher> = {
  span_id: (eb, { text }) => [eb("e.span_id", "=", eb.val(text))],
  trace_id: (eb, { text }) => [eb("e.trace_id", "=", eb.val(text))],
  name: (eb, { pattern }) => [ngramLike(eb, eb.ref("e.name"), pattern)],
  trace_name: (eb, { pattern }) => [
    ngramLike(eb, eb.ref("e.trace_name"), pattern),
  ],
  user_id: (eb, { pattern }) => [ngramLike(eb, eb.ref("e.user_id"), pattern)],
  session_id: (eb, { pattern }) => [
    ngramLike(eb, eb.ref("e.session_id"), pattern),
  ],
  input: ioMatcher("e.input"),
  output: ioMatcher("e.output"),
};

/** The matcher of a search column. Throws `QueryCompileError` without one. */
function searchMatcher(column: string): SearchMatcher {
  const matcher = SEARCH_MATCHERS[column];
  if (!matcher) {
    throw new QueryCompileError(`No search matcher for column '${column}'.`);
  }
  return matcher;
}

/**
 * The search disjuncts in `SEARCH_LANES` order, each lane's columns in
 * `eventsPredicateSource.searchScopes` order. Throws `QueryCompileError`
 * when the scopes have no search column.
 */
function searchDisjuncts(
  eb: EventsExpressionBuilder,
  { text, scopes }: PredicateSearch,
): Condition[] {
  const search = searchText(text);
  const disjuncts = SEARCH_LANES.filter((lane) =>
    scopes.includes(lane),
  ).flatMap((lane) =>
    eventsPredicateSource.searchScopes[lane].flatMap((column) =>
      searchMatcher(column)(eb, search),
    ),
  );
  if (disjuncts.length === 0) {
    throw new QueryCompileError(
      `No search column for scopes ${JSON.stringify(scopes)}.`,
    );
  }
  return disjuncts;
}
