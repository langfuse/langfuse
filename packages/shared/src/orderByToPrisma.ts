import { z } from "zod";

import { Prisma } from "@prisma/client";

import type { ColumnDefinition } from "./tableDefinitions/types";
import type { OrderByState } from "./interfaces/orderBy";

/**
 * Convert orderBy to SQL ORDER BY clause
 * @param orderBy orderBy state
 * @param tableColumns column definitions, used to map orderBy column to internal name
 * @returns Prisma.sql
 */
export function orderByToPrismaSql(
  orderBy: OrderByState,
  tableColumns: ColumnDefinition[]
): Prisma.Sql {
  if (!orderBy) {
    return Prisma.sql`ORDER BY t.timestamp DESC NULLS LAST`;
  }
  // Get column definition to map column to internal name, e.g. "t.id"
  const col = tableColumns.find(
    // TODO: Only use id instead of name.
    // It's less error-prone & decouples data fetching from the human-readable UI labels
    (c) => c.name === orderBy.column || c.id === orderBy.column
  );

  if (!col) {
    console.log("Invalid filter column", orderBy.column);
    throw new Error("Invalid filter column: " + orderBy.column);
  }

  // Assert that orderBy.order is either "asc" or "desc"
  const orderByOrder = z.enum(["ASC", "DESC"]);
  const order = orderByOrder.safeParse(orderBy.order);
  if (!order.success) {
    console.log("Invalid order", orderBy.order);
    throw new Error("Invalid order: " + orderBy.order);
  }

  // Both column and order are safe, can use raw SQL
  return Prisma.raw(
    `ORDER BY ${col.internal} ${order.data} ${orderBy.order === "DESC" ? "NULLS LAST" : "NULLS FIRST"}`
  );
}
