import z from "zod";

import { InvalidRequestError } from "../../../errors";
import { OrderByState } from "../../../interfaces/orderBy";
import { findUiColumnMapping } from "../../../tableDefinitions";
import { logger } from "../../logger";
import { quoteIdent } from "../schemaUtils";
import { type GreptimeColumnMappings } from "./columnMappings";

/**
 * ORDER BY for the GreptimeDB read path (04-read-path.md, P0b/P1) — mirrors
 * `clickhouse-sql/orderby-factory.ts` but:
 *   - resolves columns against a `GreptimeColumnMappings` and emits `greptimeSelect` (a GreptimeDB
 *     column ref / expression), NOT the CH-dialect `clickhouseSelect` (which carries CH functions and
 *     old physical table names and would leak into GreptimeDB SQL — the original P1 caution).
 *   - quotes bare column identifiers (GreptimeDB reserves timestamp/id/name/level/...); an
 *     expression-valued mapping (contains a space/paren/dot) is emitted verbatim (it is already SQL).
 *   - drops the CH `anyLast(col)` aggregation wrapper: the projection is merged on write
 *     (merge_mode=last_non_null), so a list/detail read selects already-deduped rows and orders on
 *     the plain column. (Genuinely-aggregated queries pass `usedInAggregation` to wrap in `any()`.)
 */

const isBareIdentifier = (s: string) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(s);

const emitColumn = (
  queryPrefix: string | undefined,
  select: string,
): string => {
  const prefix = queryPrefix ? `${queryPrefix}.` : "";
  return isBareIdentifier(select) ? `${prefix}${quoteIdent(select)}` : select;
};

export function greptimeOrderBySql(
  orderBy: OrderByState | OrderByState[] = [],
  tableColumns: GreptimeColumnMappings,
  usedInAggregation = false,
): string {
  const list = (Array.isArray(orderBy) ? orderBy : [orderBy]).filter(
    (o): o is Exclude<OrderByState, null> => Boolean(o),
  );
  if (list.length === 0) return "";

  const clauses = list.map((ob) => {
    const col = findUiColumnMapping(tableColumns, ob.column);
    if (!col) {
      logger.warn(`Invalid order by column: ${ob.column}`);
      throw new InvalidRequestError("Invalid order by column: " + ob.column);
    }
    const order = z.enum(["ASC", "DESC"]).safeParse(ob.order);
    if (!order.success) {
      throw new Error("Invalid order: " + ob.order);
    }
    const column = emitColumn(col.queryPrefix, col.greptimeSelect);
    return `${usedInAggregation ? `any(${column})` : column} ${order.data}`;
  });

  return `ORDER BY ${clauses.join(", ")}`;
}
