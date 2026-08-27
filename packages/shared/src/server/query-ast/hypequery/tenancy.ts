import { TenantInjectionError } from "./executionContext";
import { PROJECT_ID_COLUMN, TENANT_TABLES } from "./schema";
import type { HypeExprNode, HypeSelectNode } from "./walk";

function cloneExpr(expr: HypeExprNode): HypeExprNode {
  return structuredClone(expr);
}

function projectIdCondition(projectId: string): HypeExprNode {
  return {
    kind: "condition",
    column: PROJECT_ID_COLUMN,
    operator: "eq",
    value: { kind: "value", value: projectId },
  };
}

function prependAnd(
  existing: HypeExprNode | undefined,
  next: HypeExprNode,
): HypeExprNode {
  if (!existing) return next;
  if (existing.kind === "sequence") {
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
  return {
    kind: "sequence",
    items: [
      { expression: next },
      { conjunction: "AND", expression: cloneExpr(existing) },
    ],
  };
}

function exprHasProjectIdEq(expr: HypeExprNode | undefined): boolean {
  if (!expr) return false;
  switch (expr.kind) {
    case "condition":
      return expr.column === PROJECT_ID_COLUMN && expr.operator === "eq";
    case "logical":
      return expr.conditions.some(exprHasProjectIdEq);
    case "sequence":
      return expr.items.some((item) => exprHasProjectIdEq(item.expression));
    case "group":
      return exprHasProjectIdEq(expr.expression);
    case "raw":
      return false;
    default:
      return false;
  }
}

/**
 * Mandatory tenancy pass. Walks every table-sourced SELECT and AND-prepends
 * `project_id = {projectId: String}`. This is the injection that hypequery
 * cannot host as a plugin: its `queryTransforms` array is private and there
 * is no public transformer/plugin API.
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

  if (!hasTenantPredicate(next)) {
    throw new TenantInjectionError(
      `compile() refused an unscoped scan of ${tableName ?? "unknown table"}: missing ${PROJECT_ID_COLUMN} predicate after injection`,
    );
  }

  return next;
}

export function hasTenantPredicate(node: HypeSelectNode): boolean {
  const tableName = node.from?.kind === "table" ? node.from.name : undefined;
  if (!tableName || !TENANT_TABLES.has(tableName)) {
    return true;
  }
  return exprHasProjectIdEq(node.where) || exprHasProjectIdEq(node.prewhere);
}
