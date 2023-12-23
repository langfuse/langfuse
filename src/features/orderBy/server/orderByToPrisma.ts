import { type OrderByState } from "@/src/features/orderBy/types";
import { type ColumnDefinition } from "@/src/server/api/interfaces/tableDefinition";
import { Prisma } from "@prisma/client";

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
    return Prisma.sql([`ORDER BY t.timestamp DESC`]);
  }
  // Get column definition to map column to internal name, e.g. "t.id"
  const col = tableColumns.find(
    // TODO: Only use id instead of name.
    // It's less error-prone & decouples data fetching from the human-readable UI labels
    (c) => c.name === orderBy.column || c.id === orderBy.column,
  );
  if (!col) {
    console.log("Invalid filter column", orderBy.column);
    throw new Error("Invalid filter column: " + orderBy.column);
  }

  return Prisma.sql([`ORDER BY ${col.internal} ${orderBy.order}`]);
}
