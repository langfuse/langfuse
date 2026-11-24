/**
 * The billable-units view (`billableUnitsView` in `../dataModel.ts`) as
 * query-AST expressions: every dimension and measure, keyed by the view's
 * names, and the filter conditions on the columns the view can filter by.
 * Server-only; names, labels and the other view metadata stay in
 * `dataModel.ts`, which the client imports. Entries read the
 * `billable_events` ledger as `b`. A filter on any other column, `metadata`
 * and `*Name` columns included, throws.
 */
import type {
  AliasableExpression,
  Expression,
  ExpressionBuilder,
  SqlBool,
} from "kysely";

import { InvalidRequestError } from "../../../errors/InvalidRequestError";
import { FTS_MATCH_OPERATOR } from "../../../interfaces/filters";
import type { PredicateCondition } from "../../../query-ast/predicate";
import { BILLABLE_UNITS_FILTER_COLUMNS } from "../dataModel";
import { QueryCompileError } from "../../../server/query-ast/errors";
import {
  endsWith,
  literal,
  position,
  startsWith,
  tuple,
  typedValue,
  utcDateTime,
} from "../../../server/query-ast/extensions";
import type { ClickHouseDatabase } from "../../../server/query-ast/schema";

/** The relation a billable-units query reads: the ledger as `b`. */
type BillableUnitsDb = { b: ClickHouseDatabase["billable_events"] };

/** Builder of a query that reads the ledger as `b`. */
export type BillableUnitsBuilder = ExpressionBuilder<BillableUnitsDb, "b">;

/** A row value over `b`. */
type Read<T> = (eb: BillableUnitsBuilder) => AliasableExpression<T>;

/** Dimensions of the view, keyed by name, in view order. */
export const BILLABLE_UNITS_DIMENSIONS = {
  unitType: { expression: (eb) => eb.ref("b.event_type") },
  environment: { expression: (eb) => eb.ref("b.environment") },
} satisfies Record<string, { expression: Read<string> }>;

/**
 * Measures of the view, keyed by name, as the row value the query
 * aggregates. `count` is `tuple(b.event_type, b.event_id)`: the view maps
 * both its aggregations to `uniq` (`aggregationOverrides` in `dataModel.ts`),
 * so it counts distinct units, not ledger rows.
 */
export const BILLABLE_UNITS_MEASURES = {
  count: {
    expression: (eb) => tuple(eb.ref("b.event_type"), eb.ref("b.event_id")),
  },
} satisfies Record<string, { expression: Read<unknown> }>;

/** The registry maps keyed by any string; a name outside them is `undefined`. */
const DIMENSIONS_BY_NAME: Readonly<
  Partial<Record<string, { expression: Read<string> }>>
> = BILLABLE_UNITS_DIMENSIONS;
const MEASURES_BY_NAME: Readonly<
  Partial<Record<string, { expression: Read<unknown> }>>
> = BILLABLE_UNITS_MEASURES;

/** The dimension `name`; the caller has checked the view declares it. */
export function billableUnitsDimension(name: string): Read<string> {
  const entry = Object.hasOwn(DIMENSIONS_BY_NAME, name)
    ? DIMENSIONS_BY_NAME[name]
    : undefined;
  if (!entry) {
    throw new QueryCompileError(
      `Dimension "${name}" has no entry in BILLABLE_UNITS_DIMENSIONS.`,
    );
  }
  return entry.expression;
}

/** The measure `name`; the caller has checked the view declares it. */
export function billableUnitsMeasure(name: string): Read<unknown> {
  const entry = Object.hasOwn(MEASURES_BY_NAME, name)
    ? MEASURES_BY_NAME[name]
    : undefined;
  if (!entry) {
    throw new QueryCompileError(
      `Measure "${name}" has no entry in BILLABLE_UNITS_MEASURES.`,
    );
  }
  return entry.expression;
}

/**
 * The value a filter on `column` compares: `b.ingested_at` or the dimension
 * of that name. Throws `InvalidRequestError` for a column outside
 * {@link BILLABLE_UNITS_FILTER_COLUMNS}.
 */
function billableUnitsFilterValue(column: string): Read<string | Date> {
  const name = BILLABLE_UNITS_FILTER_COLUMNS.find((c) => c === column);
  if (name === undefined) {
    throw new InvalidRequestError(
      `Invalid filter column ${column} for billable units. Must be one of ${BILLABLE_UNITS_FILTER_COLUMNS.join(", ")}`,
    );
  }
  return name === "ingested_at"
    ? (eb) => eb.ref("b.ingested_at")
    : billableUnitsDimension(name);
}

/**
 * `condition` as one condition over `b`, with the string builder's SQL per
 * operator: `b.event_type = {v}`, `position(b.environment, {v}) > 0`,
 * `b.event_type in ({vs})`, `b.ingested_at >= {t}`, `b.environment is null`.
 * Throws `InvalidRequestError` for a column outside
 * {@link BILLABLE_UNITS_FILTER_COLUMNS}; the query builder rejects a filter
 * type the column does not take before this runs.
 */
export function billableUnitsFilterCondition(
  eb: BillableUnitsBuilder,
  condition: PredicateCondition,
): Expression<SqlBool> {
  const column = condition.field.id;
  const value = billableUnitsFilterValue(column);
  if (condition.type === "null") {
    return eb(value(eb), condition.op === "is null" ? "is" : "is not", null);
  }
  if (condition.type === "datetime") {
    return eb(value(eb), condition.op, utcDateTime(new Date(condition.value)));
  }
  if (condition.type === "stringOptions") {
    const list = eb.parens(
      typedValue<string>(condition.value, "Array(String)"),
    );
    return eb(
      billableUnitsDimension(column)(eb),
      condition.op === "any of" ? "in" : "not in",
      list,
    );
  }
  if (condition.type === "string") {
    return stringCondition(eb, billableUnitsDimension(column)(eb), condition);
  }
  throw new QueryCompileError(
    `'${condition.type}' conditions on '${column}' have no billable-units lowering.`,
  );
}

/** A `string` condition on `value`. `matches` needs a text index the ledger lacks. */
function stringCondition(
  eb: BillableUnitsBuilder,
  value: Expression<string>,
  condition: Extract<PredicateCondition, { type: "string" }>,
): Expression<SqlBool> {
  const bound = eb.val(condition.value);
  switch (condition.op) {
    case "=":
      return eb(value, "=", bound);
    case "contains":
      return eb(position(value, bound), ">", literal(0));
    case "does not contain":
      return eb(position(value, bound), "=", literal(0));
    case "starts with":
      return startsWith(value, bound);
    case "ends with":
      return endsWith(value, bound);
    case "is not empty":
      return eb.and([eb(value, "!=", literal("")), eb(value, "is not", null)]);
    case FTS_MATCH_OPERATOR:
      throw new InvalidRequestError(
        `Billable units can't be filtered with '${FTS_MATCH_OPERATOR}'.`,
      );
  }
}
