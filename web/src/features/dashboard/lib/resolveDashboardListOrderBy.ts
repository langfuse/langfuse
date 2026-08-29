import type { OrderByState } from "@langfuse/shared";

const DASHBOARD_LIST_ORDER_BY_COLUMNS = new Set([
  "name",
  "createdAt",
  "updatedAt",
]);

const WIDGET_LIST_ORDER_BY_COLUMNS = new Set([
  "name",
  "createdAt",
  "updatedAt",
  "view",
  "chartType",
]);

function resolveListOrderBy(
  orderBy: OrderByState,
  allowedColumns: ReadonlySet<string>,
): NonNullable<OrderByState> {
  if (
    orderBy &&
    allowedColumns.has(orderBy.column) &&
    (orderBy.order === "ASC" || orderBy.order === "DESC")
  ) {
    return orderBy;
  }

  return { column: "updatedAt", order: "DESC" };
}

/**
 * Tables share the `orderBy` URL param. A traces hop can leave `startTime`
 * (or another foreign column) in the query string; do not send that to
 * `allDashboards` / `dashboardWidgets.all`.
 */
export function resolveDashboardListOrderBy(
  orderBy: OrderByState,
): NonNullable<OrderByState> {
  return resolveListOrderBy(orderBy, DASHBOARD_LIST_ORDER_BY_COLUMNS);
}

export function resolveWidgetListOrderBy(
  orderBy: OrderByState,
): NonNullable<OrderByState> {
  return resolveListOrderBy(orderBy, WIDGET_LIST_ORDER_BY_COLUMNS);
}
