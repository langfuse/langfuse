import z from "zod/v4";
import { OrderByState } from "../../../interfaces/orderBy";
import { UiColumnMappings } from "../../../tableDefinitions";
import { logger } from "../../logger";

type OrderByStateNotNull = Exclude<OrderByState, null>;

export function orderByToClickhouseSql(
  orderBy: OrderByState | OrderByState[] = [],
  tableColumns: UiColumnMappings,
): string {
  if (
    !orderBy ||
    (Array.isArray(orderBy) && orderBy.filter(Boolean).length === 0)
  ) {
    return "";
  }

  if (!Array.isArray(orderBy)) {
    orderBy = [orderBy];
  }
  // Initialize an array to hold order by clauses
  const orderByClauses: string[] = [];

  // Loop through each orderBy entry
  for (const ob of orderBy.filter((o): o is OrderByStateNotNull =>
    Boolean(o),
  )) {
    // Get column definition to map column to internal name, e.g. "t.id"
    const col = tableColumns.find(
      (c) => c.uiTableName === ob.column || c.uiTableId === ob.column,
    );

    if (!col) {
      logger.warn("Invalid order by column", ob.column);
      throw new Error("Invalid order by column: " + ob.column);
    }

    // Assert that ob.order is either "asc" or "desc"
    const orderByOrder = z.enum(["ASC", "DESC"]);
    const order = orderByOrder.safeParse(ob.order);
    if (!order.success) {
      logger.warn("Invalid order", ob.order);
      throw new Error("Invalid order: " + ob.order);
    }

    // Append the order by clause to the array
    orderByClauses.push(
      `${col.queryPrefix ? col.queryPrefix + "." : ""}${col.clickhouseSelect} ${order.data}`,
    );
  }

  // Join all order by clauses with a comma and return
  return `ORDER BY ${orderByClauses.join(", ")}`;
}
