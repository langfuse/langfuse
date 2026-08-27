import {
  AggregateFunctionNode,
  ColumnNode,
  ReferenceNode,
  type OperationNode,
} from "kysely";

import { TypeCompatibilityError } from "./errors";

/**
 * Physical column data types the runtime validation pass knows about.
 * Kysely already type-checks comparisons against the schema; `sum()` /
 * `avg()` do not constrain the argument column, so this pass catches those.
 */
export type ColumnDataType = "string" | "number" | "date" | "array";

export const COLUMN_DATA_TYPES: Record<string, ColumnDataType> = {
  environment: "string",
  project_id: "string",
  timestamp: "date",
  start_time: "date",
  event_ts: "date",
  id: "string",
  trace_id: "string",
  span_id: "string",
  type: "string",
  data_type: "string",
  total_cost: "number",
  metadata_names: "array",
  metadata_values: "array",
};

const NUMERIC_AGGREGATES = new Set(["sum", "avg"]);

/**
 * Runtime validation pass: numeric aggregates over non-numeric columns.
 * Walks every node object (including ClickHouse extra fields).
 */
export function validateTypeCompatibility(root: OperationNode): void {
  walk(root, (node) => {
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

function walk(value: unknown, visit: (node: OperationNode) => void): void {
  if (!value || typeof value !== "object") return;
  if (
    "kind" in value &&
    typeof (value as { kind: unknown }).kind === "string"
  ) {
    visit(value as OperationNode);
  }
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) {
      for (const item of child) walk(item, visit);
    } else {
      walk(child, visit);
    }
  }
}
