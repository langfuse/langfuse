import { TenantInjectionError } from "./executionContext";
import { PROJECT_ID_COLUMN, TENANT_TABLES } from "./schema";
import type { HypeExprNode, HypeSelectNode } from "./walk";

function cloneExpr(expr: HypeExprNode): HypeExprNode {
  return structuredClone(expr);
}

function projectIdCondition(
  projectId: string,
  column: string = PROJECT_ID_COLUMN,
): HypeExprNode {
  return {
    kind: "condition",
    column,
    operator: "eq",
    value: { kind: "value", value: projectId },
  };
}

function containsOr(expr: HypeExprNode): boolean {
  switch (expr.kind) {
    case "logical":
      return expr.operator === "OR" || expr.conditions.some(containsOr);
    case "sequence":
      return expr.items.some(
        (item) => item.conjunction === "OR" || containsOr(item.expression),
      );
    case "group":
      return expr.expression ? containsOr(expr.expression) : false;
    default:
      return false;
  }
}

function prependAnd(
  existing: HypeExprNode | undefined,
  next: HypeExprNode,
): HypeExprNode {
  if (!existing) return next;
  if (existing.kind === "sequence" && !containsOr(existing)) {
    return {
      kind: "sequence",
      items: [
        { expression: next },
        ...existing.items.map((item) => ({
          conjunction: item.conjunction ?? ("AND" as const),
          expression: cloneExpr(item.expression),
        })),
      ],
    };
  }
  const rhs: HypeExprNode = containsOr(existing)
    ? { kind: "group", expression: cloneExpr(existing) }
    : cloneExpr(existing);
  return {
    kind: "sequence",
    items: [{ expression: next }, { conjunction: "AND", expression: rhs }],
  };
}

function isProjectIdColumn(column: string): boolean {
  return (
    column === PROJECT_ID_COLUMN || column.endsWith(`.${PROJECT_ID_COLUMN}`)
  );
}

function exprHasProjectIdEq(
  expr: HypeExprNode | undefined,
  column?: string,
): boolean {
  if (!expr) return false;
  switch (expr.kind) {
    case "condition":
      if (expr.operator !== "eq") return false;
      return column ? expr.column === column : isProjectIdColumn(expr.column);
    case "logical":
      return expr.conditions.some((child) => exprHasProjectIdEq(child, column));
    case "sequence":
      return expr.items.some((item) =>
        exprHasProjectIdEq(item.expression, column),
      );
    case "group":
      return exprHasProjectIdEq(expr.expression, column);
    case "raw":
      return false;
    default:
      return false;
  }
}

function tenantJoinQualifiers(node: HypeSelectNode): string[] {
  return (node.joins ?? [])
    .filter((join) => TENANT_TABLES.has(join.table))
    .map((join) => join.alias ?? join.table);
}

/**
 * Mandatory tenancy pass. Walks every table-sourced SELECT and AND-prepends
 * `project_id = {projectId: String}` onto the FROM table and every joined
 * tenant table. This is the injection that hypequery cannot host as a
 * plugin: its `queryTransforms` array is private and there is no public
 * transformer/plugin API.
 */
export function injectTenancy(
  node: HypeSelectNode,
  projectId: string,
): HypeSelectNode {
  const next: HypeSelectNode = structuredClone(node);
  const from = next.from;
  const tableName = from?.kind === "table" ? from.name : undefined;

  if (tableName && TENANT_TABLES.has(tableName)) {
    next.where = prependAnd(next.where, projectIdCondition(projectId));
  }

  for (const join of next.joins ?? []) {
    if (!TENANT_TABLES.has(join.table)) continue;
    const qualifier = join.alias ?? join.table;
    next.where = prependAnd(
      next.where,
      projectIdCondition(projectId, `${qualifier}.${PROJECT_ID_COLUMN}`),
    );
  }

  if (!hasTenantPredicate(next)) {
    throw new TenantInjectionError(
      `compile() refused an unscoped scan of ${tableName ?? "unknown table"}: missing ${PROJECT_ID_COLUMN} predicate after injection`,
    );
  }

  return next;
}

export function hasTenantPredicate(node: HypeSelectNode): boolean {
  const tableName = node.from?.kind === "table" ? node.from.name : undefined;
  const fromIsTenant = Boolean(tableName && TENANT_TABLES.has(tableName));
  const joinQualifiers = tenantJoinQualifiers(node);

  if (!fromIsTenant && joinQualifiers.length === 0) {
    return true;
  }

  if (
    fromIsTenant &&
    !exprHasProjectIdEq(node.where) &&
    !exprHasProjectIdEq(node.prewhere)
  ) {
    return false;
  }

  return joinQualifiers.every(
    (qualifier) =>
      exprHasProjectIdEq(node.where, `${qualifier}.${PROJECT_ID_COLUMN}`) ||
      exprHasProjectIdEq(node.prewhere, `${qualifier}.${PROJECT_ID_COLUMN}`),
  );
}
