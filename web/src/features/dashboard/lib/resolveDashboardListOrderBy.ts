import type { OrderByState } from "@langfuse/shared";

const DASHBOARD_LIST_COLUMNS = new Set(["name", "createdAt", "updatedAt"]);
const WIDGET_LIST_COLUMNS = new Set([
  "name",
  "createdAt",
  "updatedAt",
  "view",
  "chartType",
]);

const DEFAULT_ORDER_BY = {
  column: "updatedAt",
  order: "DESC",
} as const;

const resolveListOrderBy = (
  orderBy: OrderByState,
  allowedColumns: Set<string>,
): NonNullable<OrderByState> => {
  if (!orderBy || !allowedColumns.has(orderBy.column)) {
    return {
      column: DEFAULT_ORDER_BY.column,
      order: orderBy?.order ?? DEFAULT_ORDER_BY.order,
    };
  }

  return orderBy;
};

export const resolveDashboardListOrderBy = (
  orderBy: OrderByState,
): NonNullable<OrderByState> =>
  resolveListOrderBy(orderBy, DASHBOARD_LIST_COLUMNS);

export const resolveWidgetListOrderBy = (
  orderBy: OrderByState,
): NonNullable<OrderByState> =>
  resolveListOrderBy(orderBy, WIDGET_LIST_COLUMNS);
