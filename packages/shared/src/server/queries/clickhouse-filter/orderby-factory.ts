import z from "zod";
import { OrderByState } from "../../../interfaces/orderBy";
import { UiColumnMapping } from "../../../tableDefinitions";
import { logger } from "../../logger";

export function orderByToClickhouseSql(
  orderBy: OrderByState,
  tableColumns: UiColumnMapping[],
): string {
  if (!orderBy) {
    return "";
  }
  // Get column definition to map column to internal name, e.g. "t.id"
  const col = tableColumns.find(
    (c) => c.uiTableName === orderBy.column || c.uiTableId === orderBy.column,
  );

  if (!col) {
    logger.warn("Invalid order by column", orderBy.column);
    throw new Error("Invalid order by column: " + orderBy.column);
  }

  // Assert that orderBy.order is either "asc" or "desc"
  const orderByOrder = z.enum(["ASC", "DESC"]);
  const order = orderByOrder.safeParse(orderBy.order);
  if (!order.success) {
    logger.warn("Invalid order", orderBy.order);
    throw new Error("Invalid order: " + orderBy.order);
  }

  // Both column and order are safe, can use raw SQL
  return `ORDER BY ${col.queryPrefix ? col.queryPrefix + "." : ""}${col.clickhouseSelect} ${order.data}`;
}
