import type { OrderByState } from "../../../interfaces/orderBy";

type DashboardPrismaOrderBy = Array<
  | { name: "asc" | "desc" }
  | { createdAt: "asc" | "desc" }
  | { updatedAt: "asc" | "desc" }
>;

type DashboardWidgetPrismaOrderBy = Array<
  | { name: "asc" | "desc" }
  | { createdAt: "asc" | "desc" }
  | { updatedAt: "asc" | "desc" }
  | { view: "asc" | "desc" }
  | { chartType: "asc" | "desc" }
>;

const toDirection = (order: "ASC" | "DESC"): "asc" | "desc" =>
  order === "ASC" ? "asc" : "desc";

/**
 * Map dashboard-list orderBy onto Dashboard Prisma fields.
 * The list table shares the `orderBy` URL param with traces, so this must
 * not interpolate an arbitrary column name into Prisma.
 */
export function toDashboardPrismaOrderBy(
  orderBy?: OrderByState | null,
): DashboardPrismaOrderBy {
  if (!orderBy) {
    return [{ updatedAt: "desc" }];
  }

  const direction = toDirection(orderBy.order);

  switch (orderBy.column) {
    case "name":
      return [{ name: direction }];
    case "createdAt":
      return [{ createdAt: direction }];
    case "updatedAt":
      return [{ updatedAt: direction }];
    default:
      return [{ updatedAt: direction }];
  }
}

/**
 * Map widget-list orderBy onto DashboardWidget Prisma fields.
 * Display Mode is a derived UI column, and the list also shares the
 * `orderBy` URL param with traces. Unknown columns fall back to updatedAt.
 */
export function toDashboardWidgetPrismaOrderBy(
  orderBy?: OrderByState | null,
): DashboardWidgetPrismaOrderBy {
  if (!orderBy) {
    return [{ updatedAt: "desc" }];
  }

  const direction = toDirection(orderBy.order);

  switch (orderBy.column) {
    case "name":
      return [{ name: direction }];
    case "createdAt":
      return [{ createdAt: direction }];
    case "updatedAt":
      return [{ updatedAt: direction }];
    case "view":
      return [{ view: direction }];
    case "chartType":
      return [{ chartType: direction }];
    default:
      return [{ updatedAt: direction }];
  }
}
