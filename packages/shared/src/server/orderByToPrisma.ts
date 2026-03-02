import { z } from "zod/v4";

import { Prisma } from "@prisma/client";

import type { ColumnDefinition } from "../tableDefinitions/types";
import type { OrderByState } from "../interfaces/orderBy";
import { logger } from "./logger";
import { isOceanBase } from "../utils/oceanbase";

/**
 * Convert orderBy to SQL ORDER BY clause
 * @param orderBy orderBy state
 * @param tableColumns column definitions, used to map orderBy column to internal name
 * @returns Prisma.sql
 */
export function orderByToPrismaSql(
  orderBy: OrderByState,
  tableColumns: ColumnDefinition[],
): Prisma.Sql {
  if (!orderBy) {
    return Prisma.sql`ORDER BY t.timestamp DESC`;
  }
  // Get column definition to map column to internal name, e.g. "t.id"
  const col = tableColumns.find(
    // TODO: Only use id instead of name.
    // It's less error-prone & decouples data fetching from the human-readable UI labels
    (c) => c.name === orderBy.column || c.id === orderBy.column,
  );

  if (!col) {
    logger.warn("Invalid filter column", orderBy.column);
    throw new Error("Invalid filter column: " + orderBy.column);
  }

  // Assert that orderBy.order is either "asc" or "desc"
  const orderByOrder = z.enum(["ASC", "DESC"]);
  const order = orderByOrder.safeParse(orderBy.order);
  if (!order.success) {
    logger.warn("Invalid order", orderBy.order);
    throw new Error("Invalid order: " + orderBy.order);
  }

  // Convert double quotes to backticks for OceanBase/MySQL
  let internalColumn = col.internal;
  let nullsClause = "";
  if (isOceanBase()) {
    // Replace double quotes with backticks for OceanBase
    internalColumn = internalColumn.replace(/"([^"]+)"/g, "`$1`");
    // OceanBase/MySQL doesn't support NULLS LAST/FIRST, so we skip it
    // In MySQL/OceanBase, NULL values are sorted first for ASC and last for DESC by default
  } else {
    // PostgreSQL supports NULLS LAST/FIRST
    nullsClause = col.nullable
      ? orderBy.order === "DESC"
        ? "NULLS LAST"
        : "NULLS FIRST"
      : "";
  }
  // Both column and order are safe, can use raw SQL
  return Prisma.raw(
    `ORDER BY ${internalColumn} ${order.data}${nullsClause ? ` ${nullsClause}` : ""}`,
  );
}
