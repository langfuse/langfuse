import { z } from "zod/v4";

// Aggregation types - aligned with web/src/features/query/types.ts
// TODO should we share these types between the packages?
export const metricAggregations = z.enum([
  "sum",
  "avg",
  "count",
  "min",
  "max",
  "p50",
  "p75",
  "p90",
  "p95",
  "p99",
  "histogram",
]);

export type AggregationFunction = z.infer<typeof metricAggregations>;
export type MeasureType = "integer" | "decimal" | "string" | "boolean";
export type FieldType =
  | "string"
  | "integer"
  | "datetime"
  | "json"
  | "boolean"
  | "array";

/**
 * Defines where a field/measure comes from and how to access it
 */
export type FieldSource =
  | { table: "events"; sql: string }
  | { table: "traces"; sql: string; via: "trace_id" }
  | { table: "scores"; sql: string; via: "observation_id" | "trace_id" };

/**
 * Field - can be selected directly or used in GROUP BY
 */
export type FieldDef = {
  kind: "field";
  source: FieldSource;
  alias: string;
  type: FieldType;
  groupable?: boolean; // Can this field be used in GROUP BY? Default: true for most fields
};

/**
 * Measure - requires aggregation function
 */
export type MeasureDef = {
  kind: "measure";
  source: FieldSource;
  alias: string;
  type: MeasureType;
  allowedAggregations: AggregationFunction[];

  /**
   * Which fields this measure can be grouped by:
   * - ['*']: Can be grouped by any field
   * - ['traceId', 'userId']: Only these specific fields
   * - []: Global aggregation only (no GROUP BY)
   */
  supportedGroupings: string[] | ["*"];

  unit?: string;
  description?: string;
};

export type CatalogEntry = FieldDef | MeasureDef;
export type FieldCatalog = Record<string, CatalogEntry>;
