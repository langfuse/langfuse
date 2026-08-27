import {
  assertExecutionContext,
  UnscopedQueryError,
  type ExecutionContext,
} from "./executionContext";
import type {
  BoundParamNode,
  ColumnRefNode,
  IndexOfNode,
  MetadataAccessNode,
  SubscriptNode,
} from "./metadata";
import {
  isQueryPlan,
  type QueryPlan,
  type SelectExtras,
  type SelectPlan,
  type ViewQueryPlan,
} from "./plan";
import { injectTenancy } from "./tenancy";
import { assertCompatibleAggregations } from "./validate";
import {
  asCompilableSelect,
  type CompilableSelect,
  type HypeExprNode,
  type HypeSelectNode,
  type HypeValueNode,
} from "./walk";

export type CompiledQuery = {
  sql: string;
  params: Record<string, unknown>;
};

const COLUMN_PARAM_NAMES: Record<string, string> = {
  project_id: "projectId",
  data_type: "dataTypes",
  timestamp: "fromTimestamp",
  start_time: "fromTimestamp",
};

class ParamBinder {
  readonly params: Record<string, unknown> = {};

  bind(column: string, value: unknown, clickHouseType: string): string {
    const preferred = COLUMN_PARAM_NAMES[column] ?? toCamel(column);
    let name = preferred;
    let i = 2;
    while (name in this.params && !sameValue(this.params[name], value)) {
      name = `${preferred}${i}`;
      i += 1;
    }
    this.params[name] = value;
    return `{${name}:${clickHouseType}}`;
  }
}

function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left instanceof Date && right instanceof Date) {
    return left.getTime() === right.getTime();
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((item, i) => sameValue(item, right[i]))
    );
  }
  return false;
}

function toCamel(column: string): string {
  return column.replace(/_([a-z])/g, (_m, ch: string) => ch.toUpperCase());
}

const COLUMN_CLICKHOUSE_TYPES: Record<string, string> = {
  project_id: "String",
  environment: "String",
  timestamp: "DateTime64(3)",
  start_time: "DateTime64(3)",
  data_type: "String",
  is_deleted: "UInt8",
  span_id: "String",
  trace_id: "String",
  tags: "Array(String)",
};

function clickHouseTypeFor(column: string, value: unknown): string {
  if (Array.isArray(value)) {
    const innerType = COLUMN_CLICKHOUSE_TYPES[column] ?? "String";
    if (innerType.startsWith("Array(")) return innerType;
    return `Array(${innerType})`;
  }
  if (COLUMN_CLICKHOUSE_TYPES[column]) return COLUMN_CLICKHOUSE_TYPES[column];
  if (value instanceof Date) return "DateTime64(3)";
  if (typeof value === "number") {
    return Number.isInteger(value) ? "Int64" : "Float64";
  }
  if (typeof value === "boolean") return "UInt8";
  return "String";
}

function valueOf(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) =>
      item &&
      typeof item === "object" &&
      "kind" in item &&
      (item as HypeValueNode).kind === "value"
        ? (item as HypeValueNode).value
        : item,
    );
  }
  if (
    value &&
    typeof value === "object" &&
    "kind" in value &&
    (value as HypeValueNode).kind === "value"
  ) {
    return (value as HypeValueNode).value;
  }
  return value;
}

function compileExpr(expr: HypeExprNode, binder: ParamBinder): string {
  switch (expr.kind) {
    case "condition":
      return compileCondition(expr, binder);
    case "raw":
      return expr.expression;
    case "logical": {
      const parts = expr.conditions
        .map((child) => compileExpr(child, binder))
        .filter((part) => part.length > 0);
      return parts.join(` ${expr.operator} `);
    }
    case "sequence": {
      return expr.items
        .map((item, index) => {
          const sql = compileExpr(item.expression, binder);
          if (!sql) return "";
          return index === 0 ? sql : ` ${item.conjunction ?? "AND"} ${sql}`;
        })
        .join("");
    }
    case "group":
      return expr.expression ? `(${compileExpr(expr.expression, binder)})` : "";
    default:
      throw new Error(
        `Unsupported expression kind: ${(expr as { kind: string }).kind}`,
      );
  }
}

function compileCondition(
  expr: Extract<HypeExprNode, { kind: "condition" }>,
  binder: ParamBinder,
): string {
  const { column, operator } = expr;
  if (operator === "isNull") return `${column} IS NULL`;
  if (operator === "isNotNull") return `${column} IS NOT NULL`;

  const value = valueOf(expr.value);

  if (operator === "in" || operator === "notIn") {
    if (!Array.isArray(value) || value.length === 0) {
      return operator === "in" ? "1 = 0" : "1 = 1";
    }
    const placeholder = binder.bind(
      column,
      value,
      clickHouseTypeFor(column, value),
    );
    return `${column} ${operator === "in" ? "IN" : "NOT IN"} (${placeholder})`;
  }

  if (operator === "inSubquery" || operator === "globalInSubquery") {
    if (typeof value !== "string") {
      throw new Error(
        `${operator} requires a SQL string, not a nested query node`,
      );
    }
    const kw = operator === "inSubquery" ? "IN" : "GLOBAL IN";
    return `${column} ${kw} (${value})`;
  }

  const bindColumn = column.includes(".")
    ? column.slice(column.lastIndexOf(".") + 1)
    : column;
  const placeholder = binder.bind(
    bindColumn,
    value,
    clickHouseTypeFor(bindColumn, value),
  );
  const sqlOp = sqlOperator(operator);
  return `${column} ${sqlOp} ${placeholder}`;
}

function sqlOperator(operator: string): string {
  switch (operator) {
    case "eq":
      return "=";
    case "neq":
      return "!=";
    case "gt":
      return ">";
    case "gte":
      return ">=";
    case "lt":
      return "<";
    case "lte":
      return "<=";
    case "like":
      return "LIKE";
    default:
      throw new Error(`Unsupported operator: ${operator}`);
  }
}

function compileColumnRef(column: ColumnRefNode): string {
  return column.table ? `${column.table}.${column.name}` : column.name;
}

function compileBoundParam(param: BoundParamNode, binder: ParamBinder): string {
  return binder.bind(param.name, param.value, param.clickHouseType);
}

function compileIndexOf(node: IndexOfNode, binder: ParamBinder): string {
  return `indexOf(${compileColumnRef(node.haystack)}, ${compileBoundParam(node.needle, binder)})`;
}

function compileSubscript(node: SubscriptNode, binder: ParamBinder): string {
  return `${compileColumnRef(node.array)}[${compileIndexOf(node.index, binder)}]`;
}

function compileMetadataAccess(
  node: MetadataAccessNode,
  binder: ParamBinder,
): string {
  return compileSubscript(node.subscript, binder);
}

function qualifyColumn(column: string, qualifier: string): string {
  return column.includes(".") ? column : `${qualifier}.${column}`;
}

function compileSelectNode(
  node: HypeSelectNode,
  tableName: string,
  binder: ParamBinder,
  extras?: SelectExtras,
): string {
  const parts: string[] = [];
  const distinct = node.distinct ? "DISTINCT " : "";
  const selections = [
    ...(node.select && node.select.length > 0
      ? node.select.map((item) => item.selection)
      : extras?.metadataSelect
        ? []
        : ["*"]),
  ];
  if (extras?.metadataSelect) {
    selections.push(
      `${compileMetadataAccess(extras.metadataSelect.access, binder)} AS ${extras.metadataSelect.alias}`,
    );
  }
  parts.push(
    `SELECT ${distinct}${selections.length > 0 ? selections.join(", ") : "*"}`,
  );

  const fromName = node.from?.kind === "table" ? node.from.name : tableName;
  const final = node.from?.kind === "table" && node.from.final ? " FINAL" : "";
  const alias = extras?.tableAlias ? ` AS ${extras.tableAlias}` : "";
  parts.push(`FROM ${fromName}${alias}${final}`);

  if (node.arrayJoins?.length) {
    for (const arrayJoin of node.arrayJoins) {
      parts.push(`${arrayJoin.type} JOIN ${arrayJoin.expression}`);
    }
  }

  if (node.joins?.length) {
    const fromQualifier = extras?.tableAlias ?? fromName;
    for (const join of node.joins) {
      const tableClause = join.alias
        ? `${join.table} AS ${join.alias}`
        : join.table;
      const rightQualifier = join.alias ?? join.table;
      parts.push(
        `${join.type} JOIN ${tableClause} ON ${qualifyColumn(join.leftColumn, fromQualifier)} = ${qualifyColumn(join.rightColumn, rightQualifier)}`,
      );
    }
  }

  if (node.prewhere) {
    parts.push(`PREWHERE ${compileExpr(node.prewhere, binder)}`);
  }

  const whereParts: string[] = [];
  if (node.where) {
    whereParts.push(compileExpr(node.where, binder));
  }
  if (extras?.metadataWhere) {
    whereParts.push(
      `${compileMetadataAccess(extras.metadataWhere.access, binder)} ${sqlOperator(extras.metadataWhere.operator)} ${compileBoundParam(extras.metadataWhere.value, binder)}`,
    );
  }
  if (whereParts.length > 0) {
    parts.push(`WHERE ${whereParts.join(" AND ")}`);
  }

  if (node.groupBy?.length) {
    const groupBy = `GROUP BY ${node.groupBy.map((item) => item.expression).join(", ")}`;
    parts.push(node.withTotals ? `${groupBy} WITH TOTALS` : groupBy);
  }

  const havingParts: string[] = [];
  if (node.having?.length) {
    havingParts.push(...node.having.map((item) => item.expression));
  }
  if (extras?.metadataHaving) {
    havingParts.push(
      `${compileMetadataAccess(extras.metadataHaving.access, binder)} ${sqlOperator(extras.metadataHaving.operator)} ${compileBoundParam(extras.metadataHaving.value, binder)}`,
    );
  }
  if (havingParts.length > 0) {
    parts.push(`HAVING ${havingParts.join(" AND ")}`);
  }

  if (node.orderBy?.length) {
    parts.push(
      `ORDER BY ${node.orderBy.map((item) => `${item.column} ${item.direction}`).join(", ")}`,
    );
  }
  if (node.limitBy) {
    parts.push(`LIMIT ${node.limitBy.limit} BY ${node.limitBy.by.join(", ")}`);
  }
  if (node.limit !== undefined) {
    const offset = node.offset ? ` OFFSET ${node.offset}` : "";
    parts.push(`LIMIT ${node.limit}${offset}`);
  }
  return parts.join("\n");
}

function compileSelectPlan(
  plan: SelectPlan,
  ctx: ExecutionContext,
  binder: ParamBinder,
): string {
  const injected = injectTenancy(plan.builder.getQueryNode(), ctx.projectId);
  assertCompatibleAggregations(injected);
  return compileSelectNode(
    injected,
    plan.builder.getTableName(),
    binder,
    plan.extras,
  );
}

function compileViewQuery(
  plan: ViewQueryPlan,
  ctx: ExecutionContext,
  binder: ParamBinder,
): string {
  const innerSql = compilePlan(plan.view.source, ctx, binder);
  const parts = [
    `WITH ${plan.view.name} AS (\n${innerSql}\n)`,
    `SELECT ${plan.select.join(", ")}`,
    `FROM ${plan.view.name}`,
  ];
  if (plan.where?.length) {
    const clauses = plan.where.map((filter) => {
      const placeholder = binder.bind(
        filter.column,
        filter.value,
        clickHouseTypeFor(filter.column, filter.value),
      );
      return `${filter.column} ${sqlOperator(filter.operator)} ${placeholder}`;
    });
    parts.push(`WHERE ${clauses.join(" AND ")}`);
  }
  return parts.join("\n");
}

function compilePlan(
  plan: QueryPlan,
  ctx: ExecutionContext,
  binder: ParamBinder,
): string {
  if (plan.kind === "select") {
    return compileSelectPlan(plan, ctx, binder);
  }
  if (plan.kind === "union-all") {
    return plan.arms
      .map((arm) => compileSelectPlan(arm, ctx, binder))
      .join("\nUNION ALL\n");
  }
  return compileViewQuery(plan, ctx, binder);
}

/**
 * The mandatory compile choke point. Every query this arm ships to ClickHouse
 * must pass through here with an {@link ExecutionContext}. There is no
 * hypequery transformer plugin to hang this on, so injection lives in this
 * wrapper — `builder.toSQL()` still bypasses it (see compile.test.ts).
 */
export function compile(
  query:
    | QueryPlan
    | CompilableSelect
    | {
        getQueryNode(): unknown;
        getTableName(): string;
        toSQL(): string;
      },
  ctx: ExecutionContext,
): CompiledQuery {
  assertExecutionContext(ctx);
  const plan: QueryPlan = isQueryPlan(query)
    ? query
    : { kind: "select", builder: asCompilableSelect(query) };
  const binder = new ParamBinder();
  return { sql: compilePlan(plan, ctx, binder), params: binder.params };
}

/**
 * Intentional negative: compiling without a project id must throw. Exported
 * so tests can name the same error the production choke point throws.
 */
export { UnscopedQueryError };
