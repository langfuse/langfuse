/**
 * ClickHouse-specific query-builder extensions for the Kysely dialect.
 *
 * Kysely has no native representation for several ClickHouse constructs, so
 * this file supplies them in three forms:
 *   - Plugins ({@link ArrayJoinPlugin}, {@link LimitByPlugin},
 *     {@link WithFillPlugin}) that attach a custom operation node
 *     (`ArrayJoinNode` / `LimitByNode` / `WithFillNode`) onto the select node
 *     during query transformation; the ClickHouse compiler renders them.
 *   - `$call` helpers ({@link arrayJoin}, {@link limitBy}, {@link withFill},
 *     {@link useFinal}) that apply those plugins while extending the builder's
 *     output row type, so produced aliases are type-checked and misspelled
 *     references are compile errors.
 *   - Typed expression helpers ({@link mapKeys}, {@link metadataValue},
 *     {@link medianExact}, …) that build ClickHouse aggregates, map/array
 *     function calls and `metadata[key]` subscripts as real, parameter-bound
 *     nodes — never raw SQL strings — so they escape and compose like any other
 *     expression.
 */
import type { TupleParam } from "@clickhouse/client";
import {
  AggregateFunctionNode,
  BinaryOperationNode,
  ColumnNode,
  DynamicReferenceBuilder,
  ExpressionWrapper,
  expressionBuilder,
  FromNode,
  FunctionNode,
  IdentifierNode,
  JoinNode,
  OperatorNode,
  ReferenceNode,
  SelectQueryNode,
  TableNode,
  TupleNode,
  ValueNode,
  type Expression,
  type ExpressionBuilder,
  type KyselyPlugin,
  type OperationNode,
  type PluginTransformQueryArgs,
  type PluginTransformResultArgs,
  type RootOperationNode,
  type SelectQueryBuilder,
  type SqlBool,
} from "kysely";

import {
  ArrayIndexNode,
  ArrayJoinNode,
  FinalTableNode,
  LimitByNode,
  MetadataPrefilterNode,
  ParametricAggregateNode,
  TypedParam,
  TupleSubcolumnNode,
  WithFillNode,
  asOperationNode,
  finalTable,
  type ArrayJoinVariant,
  type ClickHouseSelectQueryNode,
  type MetadataPrefilterTarget,
} from "./nodes";
import { FTS_HAS_ALL_TOKENS_MAX_SEARCH_TOKENS } from "../utils/searchText";
import { escapeSqlLikePattern } from "../utils/sqlLike";
import { QueryCompileError } from "./errors";
import { describeRelation } from "./relations";
import { DEDUP_SPECS, type ClickHouseDatabase } from "./schema";
import { ClickHouseOperationNodeTransformer } from "./transformer";

type OperationNodeSource = OperationNode | { toOperationNode(): OperationNode };

function toNode(source: OperationNodeSource): OperationNode {
  if (
    "toOperationNode" in source &&
    typeof source.toOperationNode === "function"
  ) {
    return source.toOperationNode();
  }
  return source as OperationNode;
}

type ArrayJoinItem = {
  expression: OperationNodeSource;
  as: string;
};

/** Plugin that attaches an {@link ArrayJoinNode} onto the select node. */
class ArrayJoinPlugin implements KyselyPlugin {
  constructor(
    private readonly items: ReadonlyArray<ArrayJoinItem>,
    private readonly variant: ArrayJoinVariant = "default",
  ) {}

  transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
    if (args.node.kind !== "SelectQueryNode") return args.node;
    const transformer = new ClickHouseOperationNodeTransformer();
    const node = transformer.transformNode(
      args.node,
    ) as ClickHouseSelectQueryNode;
    // `array join <expression> as <alias>, …`
    const arrayJoinNode = ArrayJoinNode.create(
      this.items.map((item) => ({
        expression: toNode(item.expression),
        alias: IdentifierNode.create(item.as),
      })),
      this.variant,
    );
    return {
      ...node,
      arrayJoins: [...(node.arrayJoins ?? []), arrayJoinNode],
    } as RootOperationNode;
  }

  async transformResult(args: PluginTransformResultArgs) {
    return args.result;
  }
}

type LimitBySpec<DB, TB extends keyof DB> = {
  count: number;
  columns: (
    eb: ExpressionBuilder<DB, TB>,
  ) => ReadonlyArray<Expression<unknown>>;
};

/** Plugin that attaches a {@link LimitByNode} onto the select node. */
class LimitByPlugin implements KyselyPlugin {
  constructor(
    private readonly count: number,
    private readonly columns: ReadonlyArray<Expression<unknown>>,
  ) {}

  transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
    if (args.node.kind !== "SelectQueryNode") return args.node;
    const transformer = new ClickHouseOperationNodeTransformer();
    const node = transformer.transformNode(
      args.node,
    ) as ClickHouseSelectQueryNode;
    return {
      ...node,
      // `limit <count> by <column>, …`
      limitBy: LimitByNode.create(
        ValueNode.createImmediate(this.count),
        this.columns.map(toNode),
      ),
    } as RootOperationNode;
  }

  async transformResult(args: PluginTransformResultArgs) {
    return args.result;
  }
}

// Build a `table.column` reference straight from its parts. Prefer this
// whenever the caller already holds the table and column separately.
function qualifiedColumn(table: string, column: string): OperationNode {
  return ReferenceNode.create(
    ColumnNode.create(column),
    TableNode.create(table),
  );
}

/** ClickHouse `mapKeys(map)`. */
export function mapKeys(
  map: Expression<Record<string, unknown>>,
): ChExpression<string[]> {
  return functionCall("mapKeys", [map]);
}

/** ClickHouse `mapValues(map)`. */
export function mapValues<V>(
  map: Expression<Record<string, V>>,
): ChExpression<V[]> {
  return functionCall("mapValues", [map]);
}

/** ClickHouse `uniq(value)`, an approximate distinct count. */
export function uniq(value: Expression<unknown>): ChExpression<number> {
  return aggregate("uniq", [value]);
}

/** ClickHouse `count()`. Kysely's `eb.fn.countAll()` renders `count(*)`. */
export function count(): ExpressionWrapper<
  ClickHouseDatabase,
  keyof ClickHouseDatabase,
  number
> {
  return new ExpressionWrapper(AggregateFunctionNode.create("count", []));
}

/** ClickHouse `medianExact(expression)`. */
export function medianExact(
  expression: Expression<unknown>,
): ExpressionWrapper<ClickHouseDatabase, keyof ClickHouseDatabase, number> {
  return new ExpressionWrapper(
    AggregateFunctionNode.create("medianExact", [expression.toOperationNode()]),
  );
}

type DateDiffUnit = "millisecond" | "second" | "minute" | "hour" | "day";

/** ClickHouse `dateDiff(unit, start, end)`. */
export function dateDiff(
  unit: DateDiffUnit,
  start: Expression<unknown>,
  end: Expression<unknown>,
): ChExpression<number> {
  return new ExpressionWrapper<
    ClickHouseDatabase,
    keyof ClickHouseDatabase,
    number
  >(
    // ClickHouse requires the unit to be a constant, so it is inlined rather
    // than bound. `DateDiffUnit` keeps it to known keywords.
    FunctionNode.create("dateDiff", [
      ValueNode.createImmediate(unit),
      start.toOperationNode(),
      end.toOperationNode(),
    ]),
  );
}

/**
 * `map[key]` subscript. A string key is bound; pass `literal(...)` for a code
 * constant so it is inlined.
 */
export function mapValue<V = number>(
  map: Expression<Record<string, V>>,
  key: string | Expression<string>,
): ChExpression<V> {
  return subscript(map, key, false);
}

/**
 * `map[key]`. A plain `string` key is bound as a query parameter.
 */
function subscript<V>(
  container: Expression<Record<string, V>>,
  key: string | Expression<string>,
  metadataLookup: boolean,
): ChExpression<V> {
  return new ExpressionWrapper<ClickHouseDatabase, keyof ClickHouseDatabase, V>(
    asOperationNode(
      ArrayIndexNode.create(
        container.toOperationNode(),
        typeof key === "string" ? ValueNode.create(key) : key.toOperationNode(),
        metadataLookup,
      ),
    ),
  );
}

/**
 * Sum of the map values whose key contains `needle`, case-insensitively:
 * `arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, needle) > 0, map)))`.
 * The lambda is built as a `->` binary operation; Kysely has no lambda node.
 * Pass a code constant as `literal(...)` so it is inlined.
 */
export function sumMapValuesWhereKeyContains(
  map: Expression<Record<string, unknown>>,
  needle: Expression<string>,
): ChExpression<number> {
  // `positionCaseInsensitive(x.1, needle) > 0`
  const keyMatches = BinaryOperationNode.create(
    FunctionNode.create("positionCaseInsensitive", [
      qualifiedColumn("x", "1"),
      needle.toOperationNode(),
    ]),
    OperatorNode.create(">"),
    ValueNode.createImmediate(0),
  );
  // `x -> <keyMatches>`
  const lambda = BinaryOperationNode.create(
    ColumnNode.create("x"),
    OperatorNode.create("->"),
    keyMatches,
  );
  return new ExpressionWrapper<
    ClickHouseDatabase,
    keyof ClickHouseDatabase,
    number
  >(
    FunctionNode.create("arraySum", [
      FunctionNode.create("mapValues", [
        FunctionNode.create("mapFilter", [lambda, map.toOperationNode()]),
      ]),
    ]),
  );
}

/**
 * A helper's result. Its table scope is every table: Kysely doesn't check an
 * expression's scope where it is used (`ExpressionWrapper<DB, "e", T>` is
 * assignable to `ExpressionWrapper<DB, "t", T>`), so a narrower type would
 * catch nothing. Scope is checked where references are written, so shared
 * expressions take the calling query's `eb` (README, "Using it").
 */
type ChExpression<T> = ExpressionWrapper<
  ClickHouseDatabase,
  keyof ClickHouseDatabase,
  T
>;

function functionCall<T>(
  fn: string,
  args: ReadonlyArray<OperationNodeSource>,
): ChExpression<T> {
  return new ExpressionWrapper(FunctionNode.create(fn, args.map(toNode)));
}

function aggregate<T>(
  fn: string,
  args: ReadonlyArray<OperationNodeSource>,
): ChExpression<T> {
  return new ExpressionWrapper(
    AggregateFunctionNode.create(fn, args.map(toNode)),
  );
}

/**
 * A bound value with an explicit ClickHouse placeholder type.
 *
 * Input: the value in the wire form `type` parses, and the type:
 * `typedValue("1.5", "Decimal64(3)")`.
 *
 * Output: an expression that compiles to `{p1:Decimal64(3)}` with
 * `p1 = "1.5"`, whatever the compared column's registry type.
 *
 * Behavior: for a comparison whose other side has no registry type
 * (`latency`), or whose raw-SQL counterpart binds another type than the
 * registry (`DateTime64(3, 'UTC')` against a `DateTime64(6)` column).
 * Two equal values of one type share a placeholder.
 *
 * Errors: as an element of an IN list or tuple (`[typedValue(…)]`) the
 * compile throws, because one array bind has one type; pass one
 * `typedValue` over the whole array (`typedValue(["a"], "Array(String)")`).
 * `type` goes into the SQL text, so anything but a type name with optional
 * arguments (`String} or 1=1`) throws here, at the call.
 *
 * Edge cases: `value` is sent as is, without the `Date` conversion plain
 * binds get. Routing reads the inner value, so a typed `''` or short
 * metadata string still keeps `events_core`.
 */
export function typedValue<T>(value: unknown, type: string): ChExpression<T> {
  return new ExpressionWrapper(ValueNode.create(new TypedParam(value, type)));
}

/**
 * A constant inlined into the SQL text rather than bound, so code-defined
 * constants (`level = 'ERROR'`, `span_id != ''`) render as literals. Never
 * pass user input; bind it instead.
 */
export function literal<T extends string | number | boolean | null>(
  value: T,
): ChExpression<T> {
  // Kysely doubles single quotes but leaves backslashes, which ClickHouse
  // reads as escapes.
  if (typeof value === "string" && value.includes("\\")) {
    throw new QueryCompileError(
      `literal does not accept backslashes, got ${value}.`,
    );
  }
  return new ExpressionWrapper(ValueNode.createImmediate(value));
}

/**
 * A reference to an alias that is not a schema column, such as a subquery's
 * output (`per_span.name` read as `name`), as an aliasable column reference
 * node. The name is not type-checked.
 */
export function aliasRef<T = unknown>(alias: string): ChExpression<T> {
  return new ExpressionWrapper(
    new DynamicReferenceBuilder(alias).toOperationNode(),
  );
}

/** ClickHouse `if(condition, then, otherwise)`. */
export function ifElse<A, B>(
  condition: Expression<SqlBool>,
  then: Expression<A>,
  otherwise: Expression<B>,
): ChExpression<A | B> {
  return functionCall("if", [condition, then, otherwise]);
}

/** ClickHouse `multiIf(c1, v1, c2, v2, …, otherwise)`. */
export function multiIf<T>(
  branches: ReadonlyArray<readonly [Expression<SqlBool>, Expression<T>]>,
  otherwise: Expression<T>,
): ChExpression<T> {
  return functionCall("multiIf", [...branches.flat(), otherwise]);
}

/** ClickHouse `nullIf(value, other)`. */
export function nullIf<T>(
  value: Expression<T>,
  other: Expression<T>,
): ChExpression<T | null> {
  return functionCall("nullIf", [value, other]);
}

/** ClickHouse `ifNull(value, fallback)`. */
export function ifNull<T>(
  value: Expression<T | null>,
  fallback: Expression<T>,
): ChExpression<T> {
  return functionCall("ifNull", [value, fallback]);
}

/** ClickHouse `toBool(value)`. */
export function toBool(value: Expression<SqlBool>): ChExpression<boolean> {
  return functionCall("toBool", [value]);
}

/** ClickHouse `isNull(value)`. */
export function isNull(value: Expression<unknown>): ChExpression<SqlBool> {
  return functionCall("isNull", [value]);
}

/** ClickHouse `greatest(a, b, …)`. */
export function greatest<T>(...values: Expression<T>[]): ChExpression<T> {
  return functionCall("greatest", values);
}

/** ClickHouse `concat(a, b, …)`. */
export function concat(...values: Expression<string>[]): ChExpression<string> {
  return functionCall("concat", values);
}

/**
 * ClickHouse `startsWith(haystack, prefix)`; NULL for a NULL haystack. A
 * string prefix is bound; pass `literal(...)` for a code constant so it is
 * inlined.
 */
export function startsWith(
  haystack: Expression<string | null>,
  prefix: string | Expression<string>,
): ChExpression<SqlBool> {
  return functionCall("startsWith", [
    haystack,
    typeof prefix === "string" ? ValueNode.create(prefix) : prefix,
  ]);
}

/** ClickHouse `length(array)`. */
export function arrayLength(
  array: Expression<unknown[]>,
): ChExpression<number> {
  return functionCall("length", [array]);
}

/** ClickHouse `arrayConcat(a, b, …)`: the elements of each array in turn. */
export function arrayConcat<T>(
  ...arrays: Expression<T[]>[]
): ChExpression<T[]> {
  return functionCall("arrayConcat", arrays);
}

/** ClickHouse `arraySort(array)`: the elements in ascending order. */
export function arraySort<T>(array: Expression<T[]>): ChExpression<T[]> {
  return functionCall("arraySort", [array]);
}

/** ClickHouse `notEmpty(array)`. */
export function notEmpty(array: Expression<unknown[]>): ChExpression<SqlBool> {
  return functionCall("notEmpty", [array]);
}

/** ClickHouse `empty(array)`. */
export function empty(array: Expression<unknown[]>): ChExpression<SqlBool> {
  return functionCall("empty", [array]);
}

/** ClickHouse `has(array, element)`. */
export function has<T>(
  array: Expression<T[]>,
  element: Expression<T>,
): ChExpression<SqlBool> {
  return functionCall("has", [array, element]);
}

/** ClickHouse `hasAny(a, b)`: the arrays share an element. */
export function hasAny<T>(
  a: Expression<T[]>,
  b: Expression<T[]>,
): ChExpression<SqlBool> {
  return functionCall("hasAny", [a, b]);
}

/** ClickHouse `hasAll(set, subset)`: every element of `subset` is in `set`. */
export function hasAll<T>(
  set: Expression<T[]>,
  subset: Expression<T[]>,
): ChExpression<SqlBool> {
  return functionCall("hasAll", [set, subset]);
}

/** ClickHouse `indexOf(array, element)`: 1-based position, 0 when absent. */
function indexOf<T>(
  array: Expression<T[]>,
  element: Expression<T>,
): ChExpression<number> {
  return functionCall("indexOf", [array, element]);
}

/**
 * ClickHouse `position(haystack, needle)`: 1-based, 0 when absent, NULL for
 * a NULL haystack.
 */
export function position<S extends string | null>(
  haystack: Expression<S>,
  needle: Expression<string>,
): ChExpression<number | Extract<S, null>> {
  return functionCall("position", [haystack, needle]);
}

/** ClickHouse `positionCaseInsensitive(haystack, needle)`. */
export function positionCaseInsensitive(
  haystack: Expression<string>,
  needle: Expression<string>,
): ChExpression<number> {
  return functionCall("positionCaseInsensitive", [haystack, needle]);
}

/** ClickHouse `endsWith(haystack, suffix)`; NULL for a NULL haystack. */
export function endsWith(
  haystack: Expression<string | null>,
  suffix: Expression<string>,
): ChExpression<SqlBool> {
  return functionCall("endsWith", [haystack, suffix]);
}

/** ClickHouse `lower(value)`: lowercases ASCII letters only. */
export function lower(value: Expression<string>): ChExpression<string> {
  return functionCall("lower", [value]);
}

/** ClickHouse `toString(value)`. */
export function toStringValue(
  value: Expression<unknown>,
): ChExpression<string> {
  return functionCall("toString", [value]);
}

/** ClickHouse `toFloat64OrNull(value)`: NULL when `value` is not a number. */
export function toFloat64OrNull(
  value: Expression<string>,
): ChExpression<number | null> {
  return functionCall("toFloat64OrNull", [value]);
}

/** ClickHouse `arrayStringConcat(array)`: the elements joined without a separator. */
function arrayStringConcat(array: Expression<string[]>): ChExpression<string> {
  return functionCall("arrayStringConcat", [array]);
}

/** ClickHouse `arrayDistinct(array)`. */
export function arrayDistinct<T>(array: Expression<T[]>): ChExpression<T[]> {
  return functionCall("arrayDistinct", [array]);
}

/** ClickHouse `arraySlice(array, offset, length)`, `offset` 1-based. */
export function arraySlice<T>(
  array: Expression<T[]>,
  offset: Expression<number>,
  length: Expression<number>,
): ChExpression<T[]> {
  return functionCall("arraySlice", [array, offset, length]);
}

/** ClickHouse `arraySum(array)`. */
export function arraySum(array: Expression<number[]>): ChExpression<number> {
  return functionCall("arraySum", [array]);
}

/** ClickHouse `tokens(text)`: the words of `text`, split on non-alphanumerics. */
export function tokens(text: Expression<string>): ChExpression<string[]> {
  return functionCall("tokens", [text]);
}

/**
 * ClickHouse `hasAllTokens(text, tokens)`: `text` (a string or an array of
 * strings) contains every token. A text skip index on `text` can prune with it.
 */
export function hasAllTokens(
  text: Expression<string | string[]>,
  searchTokens: Expression<string[]>,
): ChExpression<SqlBool> {
  return functionCall("hasAllTokens", [text, searchTokens]);
}

/**
 * ClickHouse `mapExists((k, v) -> predicate, map)`. `predicate` receives the
 * key and value lambda parameters: `k`, `v` at the top level, `k1`, `v1`, …
 * inside nested lambdas.
 */
export function mapExists<V>(
  predicate: (
    key: Expression<string>,
    value: Expression<V>,
  ) => Expression<SqlBool>,
  map: Expression<Record<string, V>>,
): ChExpression<SqlBool> {
  return functionCall("mapExists", [lambda(["k", "v"], predicate), map]);
}

/**
 * ClickHouse `mapFilter(x -> predicate, map)`: the entries `predicate` keeps.
 * `predicate` receives the entry, a `(key, value)` tuple named like
 * {@link arrayExists} names its parameter; read its parts with
 * `tupleElement(entry, "1")` / `"2"`.
 */
export function mapFilter<V>(
  predicate: (entry: Expression<unknown>) => Expression<SqlBool>,
  map: Expression<Record<string, V>>,
): ChExpression<Record<string, V>> {
  return functionCall("mapFilter", [lambda(["x"], predicate), map]);
}

/**
 * Named element `name` of a tuple-typed value: a lambda parameter
 * (`skill.skillName` in `arrayMap(skill -> …)`), or an `Array(Tuple(…))`
 * column (`e.skills_available.skillName`, the array of that element, as
 * {@link tupleArrayField} reads it). `tuple` must be a lambda parameter or a
 * qualified column reference.
 */
export function tupleElement<T>(
  tuple: Expression<unknown>,
  name: string,
): ChExpression<T> {
  const node = tuple.toOperationNode();
  if (ColumnNode.is(node)) {
    return new ExpressionWrapper(qualifiedColumn(node.column.name, name));
  }
  if (ReferenceNode.is(node)) {
    assertQualifiedColumn(node, "tupleElement");
    return new ExpressionWrapper(tupleSubcolumn(node, name));
  }
  throw new QueryCompileError(
    "tupleElement reads a lambda parameter or a qualified column reference.",
  );
}

/**
 * ClickHouse `arrayExists(x -> predicate, array)`. `predicate` receives the
 * lambda parameter: `x` at the top level, `x1`, `x2`, … inside nested lambdas.
 */
export function arrayExists<T>(
  predicate: (element: Expression<T>) => Expression<SqlBool>,
  array: Expression<T[]>,
): ChExpression<SqlBool> {
  return functionCall("arrayExists", [lambda(["x"], predicate), array]);
}

/** ClickHouse `any(value)`: some value of the group. */
export function anyValue<T>(value: Expression<T>): ChExpression<T> {
  return aggregate("any", [value]);
}

/** ClickHouse `anyIf(value, condition)`: some value among the matching rows. */
export function anyIf<T>(
  value: Expression<T>,
  condition: Expression<SqlBool>,
): ChExpression<T> {
  return aggregate("anyIf", [value, condition]);
}

/** ClickHouse `argMax(value, by)`: `value` of the row with the largest `by`. */
export function argMax<T>(
  value: Expression<T>,
  by: Expression<unknown>,
): ChExpression<T> {
  return aggregate("argMax", [value, by]);
}

/** ClickHouse `countIf(condition)`. */
export function countIf(condition: Expression<SqlBool>): ChExpression<number> {
  return aggregate("countIf", [condition]);
}

/** ClickHouse `uniqIf(value, condition)`, an approximate distinct count. */
export function uniqIf(
  value: Expression<unknown>,
  condition: Expression<SqlBool>,
): ChExpression<number> {
  return aggregate("uniqIf", [value, condition]);
}

/** ClickHouse `avgIf(value, condition)`. */
export function avgIf(
  value: Expression<number>,
  condition: Expression<SqlBool>,
): ChExpression<number> {
  return aggregate("avgIf", [value, condition]);
}

/** ClickHouse `groupArray(value)`. */
export function groupArray<T>(value: Expression<T>): ChExpression<T[]> {
  return aggregate("groupArray", [value]);
}

/** ClickHouse `groupUniqArray(value)`. */
export function groupUniqArray<T>(value: Expression<T>): ChExpression<T[]> {
  return aggregate("groupUniqArray", [value]);
}

/** ClickHouse `groupUniqArrayIf(value, condition)`. */
export function groupUniqArrayIf<T>(
  value: Expression<T>,
  condition: Expression<SqlBool>,
): ChExpression<T[]> {
  return aggregate("groupUniqArrayIf", [value, condition]);
}

/** ClickHouse `groupUniqArrayArray(array)`: the distinct elements of all arrays. */
export function groupUniqArrayArray<T>(
  array: Expression<T[]>,
): ChExpression<T[]> {
  return aggregate("groupUniqArrayArray", [array]);
}

/** ClickHouse `groupUniqArrayArrayIf(array, condition)`. */
export function groupUniqArrayArrayIf<T>(
  array: Expression<T[]>,
  condition: Expression<SqlBool>,
): ChExpression<T[]> {
  return aggregate("groupUniqArrayArrayIf", [array, condition]);
}

/** ClickHouse `sumMap(map)`: per-key sums over the group. */
export function sumMap<V>(
  map: Expression<Record<string, V>>,
): ChExpression<Record<string, V>> {
  return aggregate("sumMap", [map]);
}

/** Aggregates a dashboard measure template may apply to a row value. */
export type TemplateAggregate = "any" | "count" | "sum" | "sumMap";

/** Result type of `fn(value)`: `count` and `sum` give a number, `any` and `sumMap` keep `T`. */
export type TemplateAggregateResult<F extends TemplateAggregate, T> = F extends
  | "count"
  | "sum"
  ? number
  : T;

/** `fn(value)` for a {@link TemplateAggregate}. */
export function templateAggregate<F extends TemplateAggregate, T>(
  fn: F,
  value: Expression<T>,
): ChExpression<TemplateAggregateResult<F, T>> {
  return aggregate(fn, [value]);
}

/** ClickHouse `countEqual(array, value)`: how often `value` occurs in `array`. */
export function countEqual<T>(
  array: Expression<T[]>,
  value: Expression<T>,
): ChExpression<number> {
  return functionCall("countEqual", [array, value]);
}

/** ClickHouse `toNullable(value)`. */
export function toNullable<T>(value: Expression<T>): ChExpression<T | null> {
  return functionCall("toNullable", [value]);
}

/**
 * A typed NULL: `CAST(NULL, 'Nullable(Int64)')`, the same expression as
 * `CAST(NULL AS Nullable(Int64))`.
 */
export function typedNull(type: "Nullable(Int64)"): ChExpression<null> {
  return functionCall("CAST", [
    ValueNode.createImmediate(null),
    ValueNode.createImmediate(type),
  ]);
}

/**
 * ClickHouse `formatDateTime(value, format)`. Pass the format as
 * `literal(...)`: ClickHouse requires a constant.
 */
export function formatDateTime(
  value: Expression<Date>,
  format: Expression<string>,
): ChExpression<string> {
  return functionCall("formatDateTime", [value, format]);
}

/**
 * One named element of every tuple in an `Array(Tuple(…))` column, as an
 * array: `q.skills_available` and `skillName` → `q.skills_available.skillName`.
 * `column` must be a qualified column reference (`eb.ref("q.col")`); anything
 * else throws, since only a column has subcolumns.
 */
export function tupleArrayField<R, K extends keyof R & string>(
  column: Expression<R[]>,
  field: K,
): ChExpression<Array<R[K]>> {
  const node = column.toOperationNode();
  assertQualifiedColumn(node, "tupleArrayField");
  return new ExpressionWrapper(tupleSubcolumn(node, field));
}

/** `q.col.field` over the qualified column reference `q.col`. */
function tupleSubcolumn(column: ReferenceNode, field: string): OperationNode {
  return asOperationNode(
    TupleSubcolumnNode.create(column, IdentifierNode.create(field)),
  );
}

/** Throws unless `node` is `q.<column>` with a plain qualifier `q`. */
function assertQualifiedColumn(
  node: OperationNode,
  helper: string,
): asserts node is ReferenceNode & { column: ColumnNode; table: TableNode } {
  if (
    ReferenceNode.is(node) &&
    ColumnNode.is(node.column) &&
    node.table !== undefined &&
    node.table.table.schema === undefined
  ) {
    return;
  }
  throw new QueryCompileError(
    `${helper} reads a subcolumn of a qualified column: pass eb.ref("<alias>.<column>"), got ${describeReference(node)}.`,
  );
}

/** A reference as written (`col`, `q.col`, `s.q.*`); any other node by its kind. */
function describeReference(node: OperationNode): string {
  if (!ReferenceNode.is(node)) return node.kind;
  const table = node.table?.table;
  return [
    table?.schema?.name,
    table?.identifier.name,
    ColumnNode.is(node.column) ? node.column.column.name : "*",
  ]
    .filter((part) => part !== undefined)
    .join(".");
}

/**
 * ClickHouse `leftUTF8(expression, length)`. The length is inlined as an
 * integer literal; it must be a positive integer.
 */
export function leftUTF8(
  expression: Expression<string>,
  length: number,
): ChExpression<string> {
  if (!Number.isInteger(length) || length < 1) {
    throw new QueryCompileError(
      `leftUTF8 length must be a positive integer, got ${length}.`,
    );
  }
  return functionCall("leftUTF8", [
    expression,
    ValueNode.createImmediate(length),
  ]);
}

/** ClickHouse `length(expression)`: byte length of a String. */
export function byteLength(
  expression: Expression<string>,
): ChExpression<number> {
  return functionCall("length", [expression]);
}

/** ClickHouse `xxHash32(expression)`. */
export function xxHash32(expression: Expression<string>): ChExpression<number> {
  return functionCall("xxHash32", [expression]);
}

/** ClickHouse `toJSONString(expression)`. */
export function toJSONString(
  expression: Expression<unknown>,
): ChExpression<string> {
  return functionCall("toJSONString", [expression]);
}

function dateArg(value: Expression<Date> | Date): OperationNodeSource {
  return value instanceof Date ? ValueNode.create(value) : value;
}

/** ClickHouse `toDate(value)`; a JS `Date` is bound. */
export function toDate(value: Expression<Date> | Date): ChExpression<Date> {
  return functionCall("toDate", [dateArg(value)]);
}

/** ClickHouse `toStartOfMinute(value)`; a JS `Date` is bound. */
export function toStartOfMinute(
  value: Expression<Date> | Date,
): ChExpression<Date> {
  return functionCall("toStartOfMinute", [dateArg(value)]);
}

/** ClickHouse `toStartOfHour(value)`; a JS `Date` is bound. */
export function toStartOfHour(
  value: Expression<Date> | Date,
): ChExpression<Date> {
  return functionCall("toStartOfHour", [dateArg(value)]);
}

/** ClickHouse `toMonday(value)`, the Monday of its week; a JS `Date` is bound. */
export function toMonday(value: Expression<Date> | Date): ChExpression<Date> {
  return functionCall("toMonday", [dateArg(value)]);
}

/** ClickHouse `toStartOfMonth(value)`; a JS `Date` is bound. */
export function toStartOfMonth(
  value: Expression<Date> | Date,
): ChExpression<Date> {
  return functionCall("toStartOfMonth", [dateArg(value)]);
}

/** Units of {@link interval}, by the ClickHouse function that builds one. */
const INTERVAL_FUNCTIONS = {
  minute: "toIntervalMinute",
  hour: "toIntervalHour",
  day: "toIntervalDay",
  week: "toIntervalWeek",
  month: "toIntervalMonth",
} as const;

/** A unit {@link interval} takes: `minute`, `hour`, `day`, `week` or `month`. */
export type IntervalUnit = keyof typeof INTERVAL_FUNCTIONS;

/** A ClickHouse `Interval` value, as {@link interval} builds it. */
export type IntervalValue = {
  readonly interval: IntervalUnit;
};

/**
 * `count` `unit`s: `interval(5, "minute")` → `toIntervalMinute(5)`, which
 * ClickHouse reads as `INTERVAL 5 MINUTE`. `count` is inlined and must be a
 * positive integer.
 */
export function interval(
  count: number,
  unit: IntervalUnit,
): ChExpression<IntervalValue> {
  if (!Number.isInteger(count) || count < 1) {
    throw new QueryCompileError(
      `interval count must be a positive integer, got ${count}.`,
    );
  }
  return functionCall(INTERVAL_FUNCTIONS[unit], [
    ValueNode.createImmediate(count),
  ]);
}

/**
 * ClickHouse `toStartOfInterval(value, step)`, the start of the `step`-long
 * bucket `value` falls in. A JS `Date` binds as `DateTime64(3)`, not as the
 * type of the column it is bucketed beside; to bind another type, pass
 * `typedValue(...)`.
 */
export function toStartOfInterval(
  value: Expression<Date> | Date,
  step: Expression<IntervalValue>,
): ChExpression<Date> {
  return functionCall("toStartOfInterval", [dateArg(value), step]);
}

/** ClickHouse `toFloat64(value)`. */
export function toFloat64(value: Expression<unknown>): ChExpression<number> {
  return functionCall("toFloat64", [value]);
}

/**
 * ClickHouse `arrayJoin(array)` in a select list: one row per element, the
 * element as the value. Distinct from the ARRAY JOIN clause
 * ({@link arrayJoin}).
 */
export function arrayJoinElements<T>(array: Expression<T[]>): ChExpression<T> {
  return functionCall("arrayJoin", [array]);
}

/**
 * `fn(parameters)(value)` with the parameters inlined, as ClickHouse requires
 * them to be constants.
 */
function parametricAggregate<T>(
  fn: string,
  parameters: ReadonlyArray<number>,
  value: Expression<unknown>,
): ChExpression<T> {
  return new ExpressionWrapper(
    asOperationNode(
      ParametricAggregateNode.create(
        IdentifierNode.create(fn),
        parameters.map((parameter) => ValueNode.createImmediate(parameter)),
        [value.toOperationNode()],
      ),
    ),
  );
}

/**
 * ClickHouse `quantile(level)(value)`, an approximate quantile. `level` is
 * inlined and must be in [0, 1].
 */
export function quantile(
  level: number,
  value: Expression<unknown>,
): ChExpression<number> {
  if (!(level >= 0 && level <= 1)) {
    throw new QueryCompileError(
      `quantile level must be in [0, 1], got ${level}.`,
    );
  }
  return parametricAggregate("quantile", [level], value);
}

/**
 * ClickHouse `histogram(bins)(value)`: up to `bins` adaptive buckets of a
 * Float64 value, as an array of `(lower, upper, height)` tuples. `bins` is
 * inlined and must be a positive integer.
 */
export function histogram(
  bins: number,
  value: Expression<number>,
): ChExpression<Array<[number, number, number]>> {
  if (!Number.isInteger(bins) || bins < 1) {
    throw new QueryCompileError(
      `histogram bins must be a positive integer, got ${bins}.`,
    );
  }
  return parametricAggregate("histogram", [bins], value);
}

/** ClickHouse `tuple(a, b, …)`. */
export function tuple<T extends unknown[]>(
  ...values: { [K in keyof T]: Expression<T[K]> }
): ChExpression<T> {
  return functionCall("tuple", values);
}

/** ClickHouse `arrayReverse(array)`. */
function arrayReverse<T>(array: Expression<T[]>): ChExpression<T[]> {
  return functionCall("arrayReverse", [array]);
}

/** ClickHouse `mapFromArrays(keys, values)`. */
export function mapFromArrays<V>(
  keys: Expression<string[]>,
  values: Expression<V[]>,
): ChExpression<Record<string, V>> {
  return functionCall("mapFromArrays", [keys, values]);
}

/**
 * Events metadata as a map: `mapFromArrays(arrayReverse(names),
 * arrayReverse(values))`. Both arrays are reversed so that, for a key stored
 * twice, the last entry wins.
 */
export function metadataMap(
  names: Expression<string[]>,
  values: Expression<string[]>,
): ChExpression<Record<string, string>> {
  return mapFromArrays(arrayReverse(names), arrayReverse(values));
}

// Nesting depth of lambda bodies under construction. Each nesting level
// names its lambda parameter differently, so an inner lambda never shadows
// an outer one. Zero outside any lambda.
// Module state is safe here: `body` runs synchronously inside `lambda`, and
// JavaScript never interleaves another synchronous call with it, so concurrent
// requests cannot observe each other's depth.
let lambdaDepth = 0;

/**
 * A plain identifier not ending in a digit, so a numeric suffix stays apart:
 * a lambda parameter's nesting depth, a condition placeholder's counter.
 */
export const PARAM_NAME = /^[A-Za-z_]([A-Za-z0-9_]*[A-Za-z_])?$/;

/**
 * `p -> body(p)` for one base, `(a, b) -> body(a, b)` for several; each
 * parameter is named its base plus the nesting depth past zero: `(k, v)` at
 * the top level, `(k1, v1)` one level down. `body` takes `Expression<never>`
 * parameters so a callback typed for its own parameter types fits.
 */
function lambda<U>(
  bases: readonly [string, ...string[]],
  body: (...params: Expression<never>[]) => Expression<U>,
): OperationNode {
  const suffix = lambdaDepth === 0 ? "" : `${lambdaDepth}`;
  const params = bases.map((base) => ColumnNode.create(`${base}${suffix}`));
  lambdaDepth++;
  let bodyNode: OperationNode;
  try {
    bodyNode = body(
      ...params.map(
        // Value type `never` fits any callback parameter type
        // (`Expression<string>`, …); table set `never`: no table column.
        (param) =>
          new ExpressionWrapper<ClickHouseDatabase, never, never>(param),
      ),
    ).toOperationNode();
  } finally {
    lambdaDepth--;
  }
  return BinaryOperationNode.create(
    params.length === 1 ? params[0] : TupleNode.create(params),
    OperatorNode.create("->"),
    bodyNode,
  );
}

/**
 * ClickHouse `arrayMap(v -> body, array)`. `body` receives the lambda
 * parameter: `v` (or `param`) at the top level, `v1`, `v2`, … inside nested
 * calls. The lambda is built as a `->` binary operation; Kysely has no lambda
 * node. Throws on a `param` ending in a digit: `v1` at the top level would be
 * shadowed by the default `v` one level down (`v` + `1`).
 */
export function arrayMap<T, U>(
  body: (element: Expression<T>) => Expression<U>,
  array: Expression<T[]>,
  param = "v",
): ChExpression<U[]> {
  if (!PARAM_NAME.test(param)) {
    throw new QueryCompileError(
      `Lambda parameter "${param}" must be a plain identifier that does not end in a digit.`,
    );
  }
  return functionCall("arrayMap", [lambda([param], body), array]);
}

/**
 * `(a, b, …) IN {p:Array(Tuple(…))}`: a column tuple against a list of
 * `TupleParam`s, bound as a single array parameter.
 */
export function tupleIn(
  columns: Expression<unknown>,
  tuples: ReadonlyArray<TupleParam>,
): ChExpression<SqlBool> {
  return new ExpressionWrapper(
    BinaryOperationNode.create(
      columns.toOperationNode(),
      OperatorNode.create("in"),
      ValueNode.create(tuples),
    ),
  );
}

/** `expression != ''`, with the empty string inlined rather than bound. */
function nonEmpty(expression: Expression<string>): ChExpression<SqlBool> {
  return new ExpressionWrapper(
    BinaryOperationNode.create(
      expression.toOperationNode(),
      OperatorNode.create("!="),
      ValueNode.createImmediate(""),
    ),
  );
}

/** ClickHouse `argMaxIf(value, by, condition)`. */
export function argMaxIf<T>(
  value: Expression<T>,
  by: Expression<unknown>,
  condition: Expression<SqlBool>,
): ChExpression<T> {
  return new ExpressionWrapper(
    AggregateFunctionNode.create("argMaxIf", [
      value.toOperationNode(),
      by.toOperationNode(),
      condition.toOperationNode(),
    ]),
  );
}

/**
 * The latest non-empty `value` by `by` across the group:
 * `argMaxIf(value, by, value != '')`.
 */
export function latestNonEmpty(
  value: Expression<string>,
  by: Expression<unknown>,
): ChExpression<string> {
  return argMaxIf(value, by, nonEmpty(value));
}

/**
 * Lower `metadata[key]` to a subscript of {@link metadataMap} over the events
 * `metadata_names` / `metadata_values` columns, so the last entry of a
 * duplicated key wins. Keys follow {@link mapValue}: a string is bound, a
 * `literal(...)` is inlined. `names` / `values` must be one relation's
 * `metadata_names` / `metadata_values` refs; anything else throws.
 */
export function metadataValue(
  names: Expression<string[]>,
  values: Expression<string[]>,
  key: string | Expression<string>,
): ChExpression<string> {
  assertMetadataColumns("metadataValue", names, values);
  return subscript<string>(metadataMap(names, values), key, true);
}

/**
 * The first entry of `key` in the events metadata, `values[indexOf(names,
 * key)]`, `''` without the key. A metadata lookup for events routing like
 * {@link metadataValue}, with the same argument rules.
 */
export function firstMetadataValue(
  names: Expression<string[]>,
  values: Expression<string[]>,
  key: Expression<string>,
): ChExpression<string> {
  assertMetadataColumns("firstMetadataValue", names, values);
  return new ExpressionWrapper(
    asOperationNode(
      ArrayIndexNode.create(
        values.toOperationNode(),
        indexOf(names, key).toOperationNode(),
        true,
      ),
    ),
  );
}

/**
 * The text-index prefilter of a metadata `=` or `matches` on `search`:
 * `hasAllTokens(values, arraySlice(arrayDistinct(tokens(search)), 1, 64))`.
 * Marked with that comparison: events routing keeps it on `events_core`
 * only beside a sibling `=` that stays there. `values` must be one
 * relation's `metadata_values` ref.
 */
export function metadataTokenPrefilter(
  values: Expression<string[]>,
  search: string,
  operator: "=" | "matches",
): ChExpression<SqlBool> {
  const searchTokens = arraySlice(
    arrayDistinct(tokens(new ExpressionWrapper(ValueNode.create(search)))),
    literal(1),
    literal(FTS_HAS_ALL_TOKENS_MAX_SEARCH_TOKENS),
  );
  return metadataPrefilter(values, "hasAllTokens", [values, searchTokens], {
    operator,
    value: search,
  });
}

/**
 * The ngram-index prefilter of a metadata substring comparison on `search`:
 * `like(arrayStringConcat(values), '%search%')`, the pattern escaped and
 * bound. Marked like {@link metadataTokenPrefilter}, kept on `events_core`
 * only beside a sibling `starts with` that stays there.
 */
export function metadataSubstringPrefilter(
  values: Expression<string[]>,
  search: string,
  operator: "contains" | "starts with" | "ends with",
): ChExpression<SqlBool> {
  const pattern = ValueNode.create(`%${escapeSqlLikePattern(search)}%`);
  return metadataPrefilter(
    values,
    "like",
    [arrayStringConcat(values), pattern],
    { operator, value: search },
  );
}

/**
 * `fn(args)`, marked as the prefilter of `target`. `values` must be
 * `q.metadata_values` ({@link assertMetadataValuesColumn}).
 */
function metadataPrefilter(
  values: Expression<string[]>,
  fn: string,
  args: ReadonlyArray<OperationNodeSource>,
  target: MetadataPrefilterTarget,
): ChExpression<SqlBool> {
  assertMetadataValuesColumn(values);
  return new ExpressionWrapper(
    MetadataPrefilterNode.create(
      FunctionNode.create(fn, args.map(toNode)),
      target,
    ),
  );
}

/**
 * Throws unless `values` is `q.metadata_values`: routing does not walk a
 * vouched prefilter, so its arguments may read nothing else.
 */
function assertMetadataValuesColumn(values: Expression<string[]>): void {
  if (qualifierOf(values.toOperationNode(), "metadata_values") === undefined) {
    throw new QueryCompileError(
      'Metadata prefilters read the metadata values of one relation: pass eb.ref("e.metadata_values").',
    );
  }
}

/**
 * Throws unless `names` / `values` are `q.metadata_names` / `q.metadata_values`
 * of one qualifier `q`. The routing pass trusts the lookup's marker and does
 * not walk these arguments, so they may read nothing else.
 */
function assertMetadataColumns(
  helper: string,
  names: Expression<string[]>,
  values: Expression<string[]>,
): void {
  const namesOf = qualifierOf(names.toOperationNode(), "metadata_names");
  const valuesOf = qualifierOf(values.toOperationNode(), "metadata_values");
  if (namesOf === undefined || namesOf !== valuesOf) {
    throw new QueryCompileError(
      `${helper} reads the metadata columns of one relation: pass eb.ref("e.metadata_names") and eb.ref("e.metadata_values").`,
    );
  }
}

/** `e` for the reference `e.<column>`; undefined for anything else. */
function qualifierOf(node: OperationNode, column: string): string | undefined {
  if (
    !ReferenceNode.is(node) ||
    !ColumnNode.is(node.column) ||
    node.column.column.name !== column
  ) {
    return undefined;
  }
  return node.table?.table.identifier.name;
}

// Extract the element type `T` from an array-typed `Expression<T[]>`. `arrayJoin`
// uses it to give each produced alias the array's *element* type in the
// builder's output row (ARRAY JOIN yields one row per element, so a
// `mapValues(...)` expression of `V[]` surfaces the alias as `V`, not `V[]`).
// Resolves to `never` for a non-array expression.
type ElementOf<E> =
  E extends Expression<infer A>
    ? A extends ReadonlyArray<infer T>
      ? T
      : never
    : never;

/**
 * ARRAY JOIN clause as a `$call` step:
 * `qb.$call(arrayJoin((eb) => ({ alias: mapKeys(eb.ref("e.col")) })))`.
 * `items` receives the builder's expression builder, so its column references
 * are checked against the query's tables. Each entry's alias is added to the
 * builder's output row type, so consumers of the result (e.g. an outer query
 * selecting from a CTE body) can reference the produced columns and typos on
 * the alias name are compile errors. The element value type is opaque
 * (Kysely's Expression hides its type arg), so aliases surface as `unknown`.
 * The alias must still be projected in a `select` to appear in the emitted
 * SQL. Distinct from the `arrayJoin()` SELECT function.
 */
export function arrayJoin<
  DB,
  TB extends keyof DB,
  Items extends { [K in keyof Items]: Expression<ReadonlyArray<unknown>> },
>(
  items: (eb: ExpressionBuilder<DB, TB>) => Items,
  variant: ArrayJoinVariant = "default",
) {
  return <O>(
    qb: SelectQueryBuilder<DB, TB, O>,
  ): SelectQueryBuilder<
    DB,
    TB,
    O & { [K in keyof Items]: ElementOf<Items[K]> }
  > => {
    const produced: Record<string, Expression<unknown>> = items(
      expressionBuilder(qb),
    );
    const list: ArrayJoinItem[] = Object.entries(produced).map(
      ([as, expression]) => ({ expression, as }),
    );
    return qb.withPlugin(
      new ArrayJoinPlugin(list, variant),
    ) as unknown as SelectQueryBuilder<
      DB,
      TB,
      O & { [K in keyof Items]: ElementOf<Items[K]> }
    >;
  };
}

/**
 * LIMIT BY clause as a `$call` step:
 * `qb.$call(limitBy({ count: 1, columns: (eb) => [eb.ref("e.span_id")] }))`.
 * `columns` receives the builder's expression builder, so its references are
 * checked against the query's tables.
 */
export function limitBy<DB, TB extends keyof DB>(spec: LimitBySpec<DB, TB>) {
  return <O>(
    qb: SelectQueryBuilder<DB, TB, O>,
  ): SelectQueryBuilder<DB, TB, O> =>
    qb.withPlugin(
      new LimitByPlugin(spec.count, spec.columns(expressionBuilder(qb))),
    );
}

/** Plugin that attaches a {@link WithFillNode} onto the select node. */
class WithFillPlugin implements KyselyPlugin {
  constructor(private readonly node: WithFillNode) {}

  transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
    if (!SelectQueryNode.is(args.node)) return args.node;
    const node: ClickHouseSelectQueryNode = {
      ...new ClickHouseOperationNodeTransformer().transformNode(args.node),
      withFill: this.node,
    };
    return node;
  }

  async transformResult(args: PluginTransformResultArgs) {
    return args.result;
  }
}

/**
 * WITH FILL on the last ORDER BY item as a `$call` step:
 * `qb.orderBy(…).$call(withFill({ from: toDate(a), to: toDate(b), step: interval(1, "day") }))`
 * → `order by … with fill from toDate(a) to toDate(b) step toIntervalDay(1)`.
 * Compiling it without an ORDER BY throws.
 */
export function withFill(spec: {
  from: Expression<unknown>;
  to: Expression<unknown>;
  step: Expression<IntervalValue>;
}) {
  const node = WithFillNode.create(
    spec.from.toOperationNode(),
    spec.to.toOperationNode(),
    spec.step.toOperationNode(),
  );
  return <DB, TB extends keyof DB, O>(
    qb: SelectQueryBuilder<DB, TB, O>,
  ): SelectQueryBuilder<DB, TB, O> => qb.withPlugin(new WithFillPlugin(node));
}

function wrapFinal(
  node: OperationNode,
  tables: ReadonlySet<string>,
): OperationNode {
  if (FinalTableNode.is(node)) return node;
  const name = describeRelation(node).table?.table.identifier.name;
  return name && tables.has(name) ? finalTable(node) : node;
}

/**
 * Plugin that marks named physical tables for `FINAL`. Walks this select's
 * FROM/JOIN table expressions only — apply it on the builder that owns the
 * scores (or other ReplacingMergeTree) relation, including a CTE body.
 */
class FinalPlugin implements KyselyPlugin {
  constructor(private readonly tables: ReadonlySet<string>) {}

  transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
    if (args.node.kind !== "SelectQueryNode") return args.node;
    const transformer = new ClickHouseOperationNodeTransformer();
    const node = transformer.transformNode(
      args.node,
    ) as ClickHouseSelectQueryNode;
    const froms = (node.from?.froms ?? []).map((from) =>
      wrapFinal(from, this.tables),
    );
    // `join <table> final on <caller on>`, the ON kept as-is.
    const joins = (node.joins ?? []).map((join) => {
      const table = wrapFinal(join.table, this.tables);
      if (table === join.table) return join;
      return join.on
        ? JoinNode.createWithOn(join.joinType, table, join.on.on)
        : JoinNode.create(join.joinType, table);
    });
    return {
      ...node,
      // cloneWithFroms appends; replacing the list avoids
      // `FROM scores AS s, scores AS s FINAL`.
      ...(node.from ? { from: FromNode.create(froms) } : {}),
      ...(joins.length ? { joins } : {}),
    } as RootOperationNode;
  }

  async transformResult(args: PluginTransformResultArgs) {
    return args.result;
  }
}

/**
 * `FROM <table> FINAL` / `JOIN <table> AS alias FINAL` as a `$call` step:
 * `qb.$call(useFinal(["scores"]))`. Tables declared `dedup: none` (immutable
 * at read time, including the events relations) cannot take FINAL.
 */
export function useFinal(tables: ReadonlyArray<keyof ClickHouseDatabase>) {
  for (const table of tables) {
    if (DEDUP_SPECS[table]?.strategy === "none") {
      throw new QueryCompileError(
        `Cannot apply FINAL to ${table}: declared immutable (dedup strategy none).`,
      );
    }
  }
  const names = new Set<string>(tables);
  return <DB, TB extends keyof DB, O>(
    qb: SelectQueryBuilder<DB, TB, O>,
  ): SelectQueryBuilder<DB, TB, O> => qb.withPlugin(new FinalPlugin(names));
}
