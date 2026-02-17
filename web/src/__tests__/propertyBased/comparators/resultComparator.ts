import Decimal from "decimal.js";
import { type QueryType } from "@/src/features/query/types";

type QueryResult = Array<Record<string, unknown>>;

interface ComparisonResult {
  equal: boolean;
  differences?: string[];
}

interface ComparisonOptions {
  /**
   * v2 events observations view includes trace-level events (no segment
   * filter), so v2 may have extra dimension groups and count/avg metrics
   * may differ. When true:
   * - Match v1 rows to v2 rows by dimension + time key
   * - Only compare sum-aggregated non-count metrics (trace events add 0)
   * - Allow extra v2 rows
   */
  v2SupersetMode?: boolean;
}

/**
 * Compare results from v1 and v2 queries
 * Handles differences in:
 * - Row ordering (sorts by deterministic key)
 * - Floating-point precision (0.01% tolerance)
 * - NULL vs undefined
 * - Array ordering within fields
 */
export const compareResults = (
  v1Results: QueryResult,
  v2Results: QueryResult,
  query: QueryType,
  options?: ComparisonOptions,
): ComparisonResult => {
  if (options?.v2SupersetMode) {
    return compareV2Superset(v1Results, v2Results, query);
  }

  // Step 1: Check row counts
  if (v1Results.length !== v2Results.length) {
    return {
      equal: false,
      differences: [
        `Row count mismatch: v1=${v1Results.length}, v2=${v2Results.length}`,
      ],
    };
  }

  // Step 2: Normalize and sort results for comparison
  const v1Sorted = normalizeAndSort(v1Results, query);
  const v2Sorted = normalizeAndSort(v2Results, query);

  // Step 3: Compare row by row
  const differences: string[] = [];

  for (let i = 0; i < v1Sorted.length; i++) {
    const diff = compareRows(v1Sorted[i], v2Sorted[i], i);
    if (diff) {
      differences.push(...diff);
    }
  }

  return {
    equal: differences.length === 0,
    differences: differences.length > 0 ? differences : undefined,
  };
};

/**
 * Compare v1 and v2 results in superset mode.
 * Every v1 dimension group must exist in v2. Sum-aggregated non-count
 * metrics must match (trace-level events contribute 0). Count, avg, min,
 * max, and percentile metrics are allowed to differ because trace-level
 * events affect them.
 */
const compareV2Superset = (
  v1Results: QueryResult,
  v2Results: QueryResult,
  query: QueryType,
): ComparisonResult => {
  const v1Norm = v1Results.map(normalizeRow);
  const v2Norm = v2Results.map(normalizeRow);

  // v2 events table stores root observation parents as 't-{traceId}'
  // (the synthetic trace-level event), while v1 stores NULL.
  // Normalize these to null for key matching.
  const v2Normalized = v2Norm.map((row) => {
    const val = row["parentObservationId"];
    if (typeof val === "string" && val.startsWith("t-")) {
      return { ...row, parentObservationId: null };
    }
    return row;
  });

  // Metric field names in query results: ${aggregation}_${measure}
  // Also include "count" — the query builder always returns a count column
  // even when no metrics are explicitly requested.
  const metricFieldSet = new Set([
    "count",
    ...query.metrics.map((m) => `${m.aggregation}_${m.measure}`),
  ]);

  // Metrics where trace-level events contribute 0 and don't affect the
  // result: sum-aggregated non-count measures
  const comparableMetrics = query.metrics.filter(
    (m) => m.aggregation === "sum" && m.measure !== "count",
  );

  const comparableMetricFields = new Set(
    comparableMetrics.map((m) => `${m.aggregation}_${m.measure}`),
  );

  // Build key from dimension + time fields only (excludes metrics)
  const dimKey = (row: Record<string, unknown>) => {
    return Object.entries(row)
      .filter(([k]) => !metricFieldSet.has(k))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join("|");
  };

  // Index v2 rows by dimension key, merging rows that collapse to the same
  // key after parentObservationId normalization (e.g. trace-level event and
  // root observation in the same time bucket). Sum comparable metrics.
  const v2ByKey = new Map<string, Record<string, unknown>>();
  for (const row of v2Normalized) {
    const key = dimKey(row);
    const existing = v2ByKey.get(key);
    if (existing) {
      for (const field of comparableMetricFields) {
        const a = typeof existing[field] === "number" ? existing[field] : 0;
        const b = typeof row[field] === "number" ? row[field] : 0;
        existing[field] = (a as number) + (b as number);
      }
    } else {
      v2ByKey.set(key, { ...row });
    }
  }

  const differences: string[] = [];

  for (let i = 0; i < v1Norm.length; i++) {
    const v1Row = v1Norm[i];
    const key = dimKey(v1Row);
    const v2Row = v2ByKey.get(key);

    if (!v2Row) {
      differences.push(`v1 row ${i} not found in v2 (key: ${key})`);
      continue;
    }

    // Compare only sum-aggregated non-count metrics
    for (const metric of comparableMetrics) {
      const field = `${metric.aggregation}_${metric.measure}`;
      const v1Val = v1Row[field];
      const v2Val = v2Row[field];

      if (!valuesEqual(v1Val, v2Val)) {
        differences.push(
          `Row ${i}, '${field}': v1=${JSON.stringify(v1Val)}, v2=${JSON.stringify(v2Val)}`,
        );
      }
    }
  }

  return {
    equal: differences.length === 0,
    differences: differences.length > 0 ? differences : undefined,
  };
};

/**
 * Normalize and sort results for deterministic comparison
 */
const normalizeAndSort = (
  results: QueryResult,
  query: QueryType,
): QueryResult => {
  // Create deterministic sort key from dimensions + metrics
  const sortKey = (row: Record<string, unknown>) => {
    const dimensionValues = query.dimensions.map((d) =>
      String(row[d.field] ?? ""),
    );
    const metricValues = query.metrics.map((m) =>
      String(row[`${m.aggregation}_${m.measure}`] ?? ""),
    );
    const timeDimensionValue = query.timeDimension
      ? String(row["time_dimension"] ?? "")
      : "";

    return [...dimensionValues, ...metricValues, timeDimensionValue].join("|");
  };

  return results
    .map((row) => normalizeRow(row))
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
};

/**
 * Normalize a single row for consistent comparison
 */
const normalizeRow = (
  row: Record<string, unknown>,
): Record<string, unknown> => {
  const normalized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(row)) {
    // Normalize arrays (sort for consistent comparison)
    if (Array.isArray(value)) {
      normalized[key] = [...value].sort();
    }
    // Normalize null/undefined
    else if (value === null || value === undefined) {
      normalized[key] = null;
    }
    // Normalize whitespace-only strings to null
    // (v1 LEFT JOIN time filters in WHERE can eliminate rows, producing null
    // fill values where v2 has whitespace-only dimension values)
    else if (typeof value === "string" && value.trim() === "") {
      normalized[key] = null;
    }
    // Keep other values as-is
    else {
      normalized[key] = value;
    }
  }

  return normalized;
};

/**
 * Compare two rows and return differences if any
 */
const compareRows = (
  v1Row: Record<string, unknown>,
  v2Row: Record<string, unknown>,
  rowIndex: number,
): string[] | null => {
  const differences: string[] = [];
  const allKeys = new Set([...Object.keys(v1Row), ...Object.keys(v2Row)]);

  for (const key of allKeys) {
    const v1Value = v1Row[key];
    const v2Value = v2Row[key];

    if (!valuesEqual(v1Value, v2Value)) {
      differences.push(
        `Row ${rowIndex}, field '${key}': v1=${JSON.stringify(v1Value)}, v2=${JSON.stringify(v2Value)}`,
      );
    }
  }

  return differences.length > 0 ? differences : null;
};

/**
 * Compare two values with tolerance for floating-point differences
 */
const valuesEqual = (v1: unknown, v2: unknown): boolean => {
  // Handle null/undefined/empty string (all treated as "no value")
  if (v1 === null && v2 === null) return true;
  if (v1 === undefined && v2 === undefined) return true;
  if (v1 === null && v2 === undefined) return true;
  if (v1 === undefined && v2 === null) return true;
  if (v1 === null && v2 === "") return true;
  if (v1 === "" && v2 === null) return true;
  if (v1 === undefined && v2 === "") return true;
  if (v1 === "" && v2 === undefined) return true;

  // Handle null/0 equivalence for numeric values
  // (v1 Nullable columns produce null fill values via WITH FILL,
  // v2 non-nullable ALIAS columns produce 0)
  if (v1 === null && v2 === 0) return true;
  if (v1 === 0 && v2 === null) return true;

  // Handle numbers (including floating point tolerance)
  if (typeof v1 === "number" && typeof v2 === "number") {
    // Use Decimal.js for precise comparison with tolerance
    const decimal1 = new Decimal(v1);
    const decimal2 = new Decimal(v2);

    // If both are zero, they're equal
    if (decimal1.isZero() && decimal2.isZero()) return true;

    // Calculate relative error
    const diff = decimal1.minus(decimal2).abs();
    const avgMagnitude = decimal1.abs().plus(decimal2.abs()).dividedBy(2);

    // If the average magnitude is zero but we got here, one must be non-zero
    if (avgMagnitude.isZero()) return false;

    const relativeError = diff.dividedBy(avgMagnitude);
    const tolerance = new Decimal(0.0001); // 0.01% relative tolerance

    return relativeError.lessThanOrEqualTo(tolerance);
  }

  // Handle arrays (already sorted in normalizeRow)
  if (Array.isArray(v1) && Array.isArray(v2)) {
    if (v1.length !== v2.length) return false;
    return v1.every((item, idx) => valuesEqual(item, v2[idx]));
  }

  // Handle objects
  if (
    typeof v1 === "object" &&
    typeof v2 === "object" &&
    v1 !== null &&
    v2 !== null
  ) {
    const keys1 = Object.keys(v1);
    const keys2 = Object.keys(v2);
    if (keys1.length !== keys2.length) return false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return keys1.every((key) =>
      valuesEqual((v1 as any)[key], (v2 as any)[key]),
    );
  }

  // Default comparison
  return v1 === v2;
};
