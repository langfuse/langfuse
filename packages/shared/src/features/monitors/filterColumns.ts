/** filterColumns.ts owns the monitor-domain rule for which filter columns
 * are valid in a monitor query. Consumed by `./isValidQuery` (server-side
 * validation) and by the monitor form in `web/` (UI column list) so both
 * surfaces agree on the same constraint. */
import { type ColumnDefinition } from "../../tableDefinitions/types";

/** disallowedMonitorFilterColumns lists filter column ids barred from a monitor query; currently none. */
export const disallowedMonitorFilterColumns: readonly string[] = [];

/** getValidMonitorFilterColumns drops columns whose `id` is in
 * `disallowedMonitorFilterColumns`. */
export const getValidMonitorFilterColumns = (
  columns: ColumnDefinition[],
): ColumnDefinition[] =>
  columns.filter((c) => !disallowedMonitorFilterColumns.includes(c.id));
