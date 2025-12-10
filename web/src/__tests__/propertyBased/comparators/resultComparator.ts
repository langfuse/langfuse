import Decimal from "decimal.js";
import { type QueryType } from "@/src/features/query/types";

type QueryResult = Array<Record<string, unknown>>;

interface ComparisonResult {
  equal: boolean;
  differences?: string[];
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
): ComparisonResult => {
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
