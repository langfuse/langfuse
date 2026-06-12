import z from "zod";

import { InvalidRequestError } from "../../../errors";
import { OrderByState } from "../../../interfaces/orderBy";
import {
  findUiColumnMapping,
  UiColumnMappings,
} from "../../../tableDefinitions";
import { logger } from "../../logger";
import { quoteIdent } from "../schemaUtils";

/**
 * ORDER BY for the GreptimeDB read path (04-read-path.md, P0b) — mirrors
 * `clickhouse-sql/orderby-factory.ts` but:
 *   - quotes bare column identifiers (GreptimeDB reserves timestamp/id/name/level/...); column
 *     mappings whose `clickhouseSelect` is an expression (contains a space/paren/dot) are emitted
 *     verbatim (they are already SQL).
 *   - drops the CH `anyLast(col)` aggregation wrapper: the projection is merged on write
 *     (merge_mode=last_non_null), so a list/detail read selects already-deduped rows and orders on
 *     the plain column. (Genuinely-aggregated queries pass `usedInAggregation` to wrap in `any()`.)
 *
 * CAUTION (P1): `UiColumnMappings.clickhouseSelect` is ClickHouse-dialect — it can hold CH functions
 * and old physical table names (e.g. `dataset_run_items_rmt`). This helper only quotes BARE column
 * names; any expression-valued mapping is emitted verbatim and would leak CH SQL into GreptimeDB. P1
 * must feed this a GreptimeDB-specific column mapping (Greptime column names / Greptime expressions),
 * not the existing CH `tableMappings`. Do not wire it to the CH mappings as-is.
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
  tableColumns: UiColumnMappings,
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
    const column = emitColumn(col.queryPrefix, col.clickhouseSelect);
    return `${usedInAggregation ? `any(${column})` : column} ${order.data}`;
  });

  return `ORDER BY ${clauses.join(", ")}`;
}
