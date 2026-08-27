import { TypeIncompatibleTransformationError } from "./executionContext";
import { langfuseClickHouseSchema } from "./schema";
import type { HypeSelectNode } from "./walk";

const NUMERIC_TYPE = /^(U?Int\d+|Float\d+|Decimal)/;
const NUMERIC_AGG =
  /^(SUM|AVG|stddevSamp|varSamp)\s*\(\s*([A-Za-z_][A-Za-z0-9_.]*)\s*\)/i;

/**
 * Runtime validation pass for aggregations hypequery's types do not reject.
 * `sum()` is typed as `SelectableColumn` (any selected column, including
 * String). Schema is TypeScript-only in hypequery (`state.base` is `{}` at
 * runtime), so this pass uses our traced schema.
 */
export function assertCompatibleAggregations(node: HypeSelectNode): void {
  const tableName = node.from?.kind === "table" ? node.from.name : undefined;
  if (!tableName || !(tableName in langfuseClickHouseSchema)) return;

  const columns =
    langfuseClickHouseSchema[
      tableName as keyof typeof langfuseClickHouseSchema
    ];

  for (const item of node.select ?? []) {
    const match = NUMERIC_AGG.exec(item.selection);
    if (!match) continue;
    const fn = match[1]!.toUpperCase();
    const column = match[2]!.split(".").pop()!;
    const clickHouseType = (columns as Record<string, string | undefined>)[
      column
    ];
    if (typeof clickHouseType !== "string") continue;
    if (!NUMERIC_TYPE.test(clickHouseType)) {
      throw new TypeIncompatibleTransformationError(
        `${fn}() is not valid over ${tableName}.${column} (${clickHouseType}); numeric ClickHouse type required`,
      );
    }
  }
}
