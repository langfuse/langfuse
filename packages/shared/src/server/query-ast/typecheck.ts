import {
  AggregateFunctionNode,
  ColumnNode,
  ReferenceNode,
  type OperationNode,
} from "kysely";

import { TypeCompatibilityError } from "./errors";
import { walkNodes } from "./nodes";
import { COLUMN_DATA_TYPES } from "./schema";

// Kysely already type-checks comparisons against the schema; `sum()` / `avg()`
// do not constrain the argument column, so this pass catches those. Column data
// types come from the table registry in `schema.ts`.

const NUMERIC_AGGREGATES = new Set(["sum", "avg"]);

/**
 * Runtime validation pass: numeric aggregates over non-numeric columns.
 * Walks every node object (including ClickHouse extra fields).
 */
export function validateTypeCompatibility(root: OperationNode): void {
  walkNodes(root, (node) => {
    if (!AggregateFunctionNode.is(node)) return;
    if (!NUMERIC_AGGREGATES.has(node.func.toLowerCase())) return;
    for (const arg of node.aggregated) {
      const column = columnNameOf(arg);
      if (!column) continue;
      const dataType = COLUMN_DATA_TYPES[column];
      if (dataType && dataType !== "number") {
        throw new TypeCompatibilityError(
          `Aggregate ${node.func}() is not compatible with ${dataType} column "${column}"`,
        );
      }
    }
  });
}

function columnNameOf(node: OperationNode): string | undefined {
  if (ColumnNode.is(node)) return node.column.name;
  if (ReferenceNode.is(node) && ColumnNode.is(node.column)) {
    return node.column.column.name;
  }
  return undefined;
}
