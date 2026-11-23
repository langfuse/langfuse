import type { Expression, ExpressionBuilder, SelectQueryBuilder } from "kysely";

import { getClickhouseKysely } from "../query-ast/dialect";
import {
  aliasRef,
  anyValue,
  count,
  dateDiff,
  interval,
  literal,
  mapValue,
  metadataMap,
  metadataValue,
  quantile,
  uniq,
  type IntervalUnit,
} from "../query-ast/extensions";
import { COLUMN_DATA_TYPES } from "../query-ast/schema";
import type { Expr, SelectStatement } from "./ast";
import { CustomerSqlError } from "./errors";
import { CUSTOMER_TABLES, type CustomerColumn } from "./schema";

// The customer query is only known at runtime, so it is built over Kysely's
// untyped builder; the compiler passes, not the TS row types, check it.
type Eb = ExpressionBuilder<any, any>;
type Ex = Expression<any>;
type Builder = SelectQueryBuilder<any, any, any>;

/** The relation alias every customer column lowers onto. */
const REL = "e";

export type TranslateOptions = {
  /** Rows returned when the query has no LIMIT. */
  defaultLimit: number;
  /** Upper bound on LIMIT. */
  maxLimit: number;
  /** Upper bound on OFFSET. */
  maxOffset: number;
  /** Rows before this start time are invisible, e.g. a plan's data retention. */
  minStartTime?: Date;
  /** What `now()` and `today()` evaluate to; defaults to the compile time. */
  now?: Date;
};

export type TranslatedQuery = {
  query: Builder;
  /** Output column names, in select order. */
  columns: string[];
};

const AGGREGATES = new Set([
  "count",
  "countif",
  "sum",
  "avg",
  "avgif",
  "min",
  "max",
  "uniq",
  "any",
  "quantile",
  "median",
]);

/**
 * Scalar functions customers may call, by lower-cased name, with the
 * ClickHouse spelling and accepted argument counts. Every target is also on
 * the query-AST allowlist, which checks the compiled tree again.
 */
const SCALARS: Record<string, { ch: string; arity: [number, number] }> = {
  lower: { ch: "lower", arity: [1, 1] },
  length: { ch: "length", arity: [1, 1] },
  lengthutf8: { ch: "lengthUTF8", arity: [1, 1] },
  coalesce: { ch: "coalesce", arity: [1, 8] },
  ifnull: { ch: "ifNull", arity: [2, 2] },
  nullif: { ch: "nullIf", arity: [2, 2] },
  if: { ch: "if", arity: [3, 3] },
  concat: { ch: "concat", arity: [2, 8] },
  startswith: { ch: "startsWith", arity: [2, 2] },
  endswith: { ch: "endsWith", arity: [2, 2] },
  position: { ch: "position", arity: [2, 2] },
  positioncaseinsensitive: { ch: "positionCaseInsensitive", arity: [2, 2] },
  substring: { ch: "substring", arity: [2, 3] },
  has: { ch: "has", arity: [2, 2] },
  hasany: { ch: "hasAny", arity: [2, 2] },
  hasall: { ch: "hasAll", arity: [2, 2] },
  empty: { ch: "empty", arity: [1, 1] },
  notempty: { ch: "notEmpty", arity: [1, 1] },
  mapkeys: { ch: "mapKeys", arity: [1, 1] },
  mapvalues: { ch: "mapValues", arity: [1, 1] },
  tostring: { ch: "toString", arity: [1, 1] },
  tofloat64: { ch: "toFloat64", arity: [1, 1] },
  todate: { ch: "toDate", arity: [1, 1] },
  tostartofminute: { ch: "toStartOfMinute", arity: [1, 1] },
  tostartofhour: { ch: "toStartOfHour", arity: [1, 1] },
  tostartofday: { ch: "toStartOfDay", arity: [1, 1] },
  tostartofmonth: { ch: "toStartOfMonth", arity: [1, 1] },
  tomonday: { ch: "toMonday", arity: [1, 1] },
  tostartofinterval: { ch: "toStartOfInterval", arity: [2, 2] },
};

const DATE_DIFF_UNITS = new Set([
  "millisecond",
  "second",
  "minute",
  "hour",
  "day",
]);
const INTERVAL_UNITS = new Set(["minute", "hour", "day", "week", "month"]);

/**
 * Lowers a parsed customer statement onto a query-AST select over the
 * logical `events` relation. Column names resolve through
 * {@link CUSTOMER_TABLES}; output aliases may be referenced in WHERE,
 * GROUP BY, HAVING and ORDER BY, and a bare integer in GROUP BY / ORDER BY
 * names a select item by position. Tenancy, events_core/events_full routing
 * and the function allowlist are left to `compileClickhouseQuery`.
 */
export function translateCustomerSql(
  stmt: SelectStatement,
  opts: TranslateOptions,
): TranslatedQuery {
  const table = own(CUSTOMER_TABLES, stmt.from.table.toLowerCase());
  if (!table) {
    throw new CustomerSqlError(
      `Unknown table "${stmt.from.table}". Available: ${Object.keys(CUSTOMER_TABLES).join(", ")}.`,
    );
  }
  const ctx = new Context(
    table.columns,
    stmt.from.alias,
    opts.now ?? new Date(),
  );

  // Expand `*` and name every output column, so results have stable keys.
  const items = stmt.columns.flatMap((item): { expr: Expr; alias?: string }[] =>
    item.expr.kind === "star"
      ? table.star.map((name) => ({
          expr: { kind: "column", name, pos: 0 },
          alias: name,
        }))
      : [item],
  );
  const used = new Set<string>();
  const outputs = items.map((item, index) => {
    // A bare name in SELECT must be a column: output aliases are not yet in
    // scope, and an unknown name would reach ClickHouse unqualified.
    if (item.expr.kind === "column" && !own(table.columns, item.expr.name)) {
      throw new CustomerSqlError(`Unknown column "${item.expr.name}".`);
    }
    const alias = item.alias ?? defaultAlias(item.expr, index, used);
    ctx.checkAlias(alias, item.expr);
    if (used.has(alias)) {
      throw new CustomerSqlError(`Duplicate output column "${alias}".`);
    }
    used.add(alias);
    return { expr: item.expr, alias };
  });
  ctx.aliases = new Set(used);

  const position = (e: Expr, clause: string): Expr => {
    if (e.kind !== "number") return e;
    const item = outputs[e.value - 1];
    if (!Number.isInteger(e.value) || !item) {
      throw new CustomerSqlError(
        `${clause} position ${e.value} is out of range.`,
      );
    }
    return { kind: "column", name: item.alias, pos: 0 };
  };

  if (stmt.where && containsAggregate(stmt.where)) {
    throw new CustomerSqlError(
      "Aggregates are not allowed in WHERE; use HAVING.",
    );
  }
  const groupBy = stmt.groupBy.map((e) => position(e, "GROUP BY"));
  if (groupBy.some(containsAggregate)) {
    throw new CustomerSqlError("Aggregates are not allowed in GROUP BY.");
  }

  const limit = stmt.limit ?? opts.defaultLimit;
  if (limit > opts.maxLimit) {
    throw new CustomerSqlError(`LIMIT must be at most ${opts.maxLimit}.`);
  }
  if ((stmt.offset ?? 0) > opts.maxOffset) {
    throw new CustomerSqlError(`OFFSET must be at most ${opts.maxOffset}.`);
  }

  let query: Builder = (getClickhouseKysely() as any).selectFrom(
    `events as ${REL}`,
  );
  query = query.select((eb: Eb) =>
    outputs.map((o) => (ctx.expr(eb, o.expr) as any).as(o.alias)),
  );
  if (stmt.distinct) query = query.distinct();
  if (stmt.where) {
    const where = stmt.where;
    query = query.where((eb: Eb) => ctx.expr(eb, where));
  }
  if (opts.minStartTime) {
    const floor = opts.minStartTime;
    query = query.where((eb: Eb) =>
      eb(eb.ref(`${REL}.start_time`), ">=", floor),
    );
  }
  if (groupBy.length > 0) {
    query = query.groupBy((eb: Eb) => groupBy.map((e) => ctx.expr(eb, e)));
  }
  if (stmt.having) {
    const having = stmt.having;
    query = query.having((eb: Eb) => ctx.expr(eb, having));
  }
  for (const item of stmt.orderBy) {
    const e = position(item.expr, "ORDER BY");
    query = query.orderBy((eb: Eb) => ctx.expr(eb, e), item.direction);
  }
  query = query.limit(limit);
  if (stmt.offset) query = query.offset(stmt.offset);

  return { query, columns: outputs.map((o) => o.alias) };
}

class Context {
  aliases = new Set<string>();

  constructor(
    private readonly columns: Record<string, CustomerColumn>,
    private readonly tableAlias: string | undefined,
    private readonly now: Date,
  ) {}

  /**
   * An output alias may not reuse a customer column name for a different
   * expression, nor any physical column name: ClickHouse lets an alias
   * shadow a column, so `x AS project_id` could change what a filter reads.
   */
  checkAlias(alias: string, expr: Expr): void {
    const sameColumn =
      expr.kind === "column" &&
      expr.name === alias &&
      own(this.columns, alias) !== undefined;
    if (own(this.columns, alias) && !sameColumn) {
      throw new CustomerSqlError(
        `Alias "${alias}" is a column name; choose another alias.`,
      );
    }
    if ((own(COLUMN_DATA_TYPES, alias) && !sameColumn) || alias === REL) {
      throw new CustomerSqlError(`Alias "${alias}" is reserved.`);
    }
  }

  expr(eb: Eb, e: Expr): Ex {
    switch (e.kind) {
      case "column":
        return this.column(eb, e);
      case "string":
        return eb.val(e.value);
      case "number":
        return eb.val(e.value);
      case "boolean":
        return eb.val(e.value);
      case "null":
        return literal(null);
      case "star":
        throw new CustomerSqlError("* is only allowed in SELECT and count(*).");
      case "interval":
        return interval(e.count, intervalUnit(e.unit));
      case "unary":
        return e.op === "NOT"
          ? eb.not(this.expr(eb, e.operand))
          : eb.neg(this.expr(eb, e.operand));
      case "binary":
        return this.binary(eb, e);
      case "isNull":
        return eb(this.expr(eb, e.operand), e.negated ? "is not" : "is", null);
      case "in": {
        const values = e.values.map((v) => {
          if (v.kind !== "string" && v.kind !== "number") {
            throw new CustomerSqlError("IN lists may only contain literals.");
          }
          return v.value;
        });
        return eb(
          this.expr(eb, e.operand),
          e.negated ? "not in" : "in",
          values,
        );
      }
      case "like": {
        const op = `${e.negated ? "not " : ""}${e.caseInsensitive ? "ilike" : "like"}`;
        return eb(
          this.expr(eb, e.operand),
          op as "like",
          this.expr(eb, e.pattern),
        );
      }
      case "between": {
        const operand = this.expr(eb, e.operand);
        const range = eb.and([
          eb(operand, ">=", this.expr(eb, e.low)),
          eb(operand, "<=", this.expr(eb, e.high)),
        ]);
        return e.negated ? eb.not(range) : range;
      }
      case "subscript":
        return this.subscript(eb, e.target, e.key);
      case "call":
        return this.call(eb, e);
    }
  }

  private column(eb: Eb, e: Extract<Expr, { kind: "column" }>): Ex {
    if (e.qualifier !== undefined && e.qualifier !== this.tableAlias) {
      throw new CustomerSqlError(`Unknown table or alias "${e.qualifier}".`);
    }
    const def = own(this.columns, e.name);
    if (!def) {
      if (!e.qualifier && this.aliases.has(e.name)) return aliasRef(e.name);
      throw new CustomerSqlError(`Unknown column "${e.name}".`);
    }
    const ref = (physical: string) => eb.ref(`${REL}.${physical}`);
    switch (def.kind) {
      case "column":
      case "map":
        return ref(def.physical);
      case "metadata":
        return metadataMap(ref("metadata_names"), ref("metadata_values"));
      case "latency":
        return dateDiff("millisecond", ref(def.from), ref(def.to));
    }
  }

  private subscript(eb: Eb, target: Expr, key: Expr): Ex {
    if (key.kind !== "string") {
      throw new CustomerSqlError("Map keys must be string literals.");
    }
    const def =
      target.kind === "column" &&
      (target.qualifier === undefined || target.qualifier === this.tableAlias)
        ? own(this.columns, target.name)
        : undefined;
    if (def?.kind === "metadata") {
      return metadataValue(
        eb.ref(`${REL}.metadata_names`),
        eb.ref(`${REL}.metadata_values`),
        key.value,
      );
    }
    if (def?.kind === "map") {
      return mapValue(eb.ref(`${REL}.${def.physical}`), key.value);
    }
    throw new CustomerSqlError(
      "Only metadata, usage_details and cost_details support ['key'] access.",
    );
  }

  private binary(eb: Eb, e: Extract<Expr, { kind: "binary" }>): Ex {
    if (e.op === "AND" || e.op === "OR") {
      const parts = [this.expr(eb, e.left), this.expr(eb, e.right)];
      return e.op === "AND" ? eb.and(parts) : eb.or(parts);
    }
    const left = this.expr(eb, e.left);
    // `x = NULL` is never true in SQL; customers mean IS NULL.
    if (e.right.kind === "null" && (e.op === "=" || e.op === "!=")) {
      return eb(left, e.op === "=" ? "is" : "is not", null);
    }
    return eb(left, e.op, this.expr(eb, e.right));
  }

  private call(eb: Eb, e: Extract<Expr, { kind: "call" }>): Ex {
    const name = e.name.toLowerCase();
    const args = () => e.args.map((a) => this.expr(eb, a));
    const arity = (min: number, max = min) => {
      if (e.args.length < min || e.args.length > max) {
        throw new CustomerSqlError(
          `${e.name}() takes ${min === max ? min : `${min} to ${max}`} argument(s).`,
        );
      }
    };
    if (e.params && name !== "quantile") {
      throw new CustomerSqlError(`${e.name}() takes no parameters.`);
    }
    if (AGGREGATES.has(name) && e.args.some(containsAggregate)) {
      throw new CustomerSqlError("Aggregates cannot be nested.");
    }
    if (e.distinct && name !== "count") {
      throw new CustomerSqlError("DISTINCT is only supported in count().");
    }
    switch (name) {
      case "count":
        if (
          e.args.length === 0 ||
          (e.args.length === 1 && e.args[0].kind === "star")
        ) {
          if (e.distinct)
            throw new CustomerSqlError("count(DISTINCT *) is not supported.");
          return count();
        }
        arity(1);
        return e.distinct ? uniq(args()[0]) : eb.fn.count(args()[0]);
      case "sum":
      case "avg":
      case "min":
      case "max":
        arity(1);
        return eb.fn[name as "sum"](args()[0]);
      case "countif":
        arity(1);
        return eb.fn("countIf", args());
      case "avgif":
        arity(2);
        return eb.fn("avgIf", args());
      case "uniq":
        arity(1);
        return uniq(args()[0]);
      case "any":
        arity(1);
        return anyValue(args()[0]);
      case "median":
        arity(1);
        return quantile(0.5, args()[0]);
      case "quantile": {
        const level = e.params?.[0];
        if (e.params?.length !== 1 || level?.kind !== "number") {
          throw new CustomerSqlError(
            "Write quantile(level)(expr), e.g. quantile(0.95)(latency_ms).",
          );
        }
        arity(1);
        return quantile(level.value, args()[0]);
      }
      case "now":
        arity(0);
        return eb.val(this.now);
      case "today": {
        arity(0);
        const day = new Date(this.now);
        day.setUTCHours(0, 0, 0, 0);
        return eb.val(day);
      }
      case "datediff": {
        arity(3);
        const unit = e.args[0];
        if (unit.kind !== "string" || !DATE_DIFF_UNITS.has(unit.value)) {
          throw new CustomerSqlError(
            `dateDiff unit must be one of ${[...DATE_DIFF_UNITS].join(", ")}.`,
          );
        }
        return dateDiff(
          unit.value as "second",
          this.expr(eb, e.args[1]),
          this.expr(eb, e.args[2]),
        );
      }
    }
    const scalar = own(SCALARS, name);
    if (!scalar) {
      throw new CustomerSqlError(
        `Unknown or unsupported function "${e.name}".`,
      );
    }
    arity(...scalar.arity);
    return eb.fn(scalar.ch, args());
  }
}

/** `record[key]` for own keys only, so `constructor` or `__proto__` resolve to nothing. */
function own<V>(record: Record<string, V>, key: string): V | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

function intervalUnit(unit: string): IntervalUnit {
  const singular = unit.endsWith("s") ? unit.slice(0, -1) : unit;
  if (!INTERVAL_UNITS.has(singular)) {
    throw new CustomerSqlError(
      `INTERVAL unit must be one of ${[...INTERVAL_UNITS].join(", ")}.`,
    );
  }
  return singular as IntervalUnit;
}

function containsAggregate(e: Expr): boolean {
  switch (e.kind) {
    case "call":
      return (
        AGGREGATES.has(e.name.toLowerCase()) || e.args.some(containsAggregate)
      );
    case "unary":
      return containsAggregate(e.operand);
    case "binary":
      return containsAggregate(e.left) || containsAggregate(e.right);
    case "isNull":
      return containsAggregate(e.operand);
    case "in":
      return containsAggregate(e.operand);
    case "like":
      return containsAggregate(e.operand) || containsAggregate(e.pattern);
    case "between":
      return [e.operand, e.low, e.high].some(containsAggregate);
    case "subscript":
      return containsAggregate(e.target);
    default:
      return false;
  }
}

function defaultAlias(e: Expr, index: number, used: Set<string>): string {
  // A plain column keeps its own name, which `checkAlias` accepts.
  if (e.kind === "column" && !used.has(e.name)) return e.name;
  const taken = (a: string) =>
    used.has(a) || own(COLUMN_DATA_TYPES, a) !== undefined || a === REL;
  const base = aliasBase(e, index);
  let alias = base;
  for (let n = 2; taken(alias); n++) alias = `${base}_${n}`;
  return alias;
}

function aliasBase(e: Expr, index: number): string {
  if (e.kind === "column") return e.name;
  if (e.kind === "call") return e.name.toLowerCase();
  if (
    e.kind === "subscript" &&
    e.target.kind === "column" &&
    e.key.kind === "string"
  ) {
    return `${e.target.name}_${e.key.value.replace(/[^A-Za-z0-9_]/g, "_")}`;
  }
  return `col_${index + 1}`;
}
