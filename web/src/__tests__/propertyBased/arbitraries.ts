import * as fc from "fast-check";
import { viewDeclarations } from "@/src/features/query/dataModel";
import {
  type QueryType,
  type views,
  type metricAggregations,
  type granularities,
} from "@/src/features/query/types";
import { z } from "zod/v4";

/**
 * Consolidated arbitraries for property-based testing of v1/v2 view equivalence
 */

// ============================================================================
// Time Arbitraries
// ============================================================================

/**
 * Generate a valid time range where fromTimestamp < toTimestamp
 * Range: 1-90 days duration
 * Start date: Between 2024-01-01 and 2025-12-31
 */
export const timeRangeArbitrary = fc
  .tuple(
    fc.date({
      min: new Date("2024-01-01T00:00:00.000Z"),
      max: new Date("2025-12-31T00:00:00.000Z"),
    }),
    fc.integer({ min: 1, max: 90 }), // days of range
  )
  .filter(([startDate]) => !isNaN(startDate.getTime()))
  .map(([startDate, daysRange]) => {
    // Round to whole seconds to avoid DateTime64(3) vs DateTime64(6) precision
    // mismatch between filter params and events table columns
    const fromMs = Math.floor(startDate.getTime() / 1000) * 1000;
    const toMs = fromMs + daysRange * 24 * 60 * 60 * 1000;
    return {
      fromTimestamp: new Date(fromMs).toISOString(),
      toTimestamp: new Date(toMs).toISOString(),
    };
  });

/**
 * Generate a time dimension with granularity
 * Can be null (no time dimension) or an object with granularity
 */
export const timeDimensionArbitrary = fc.oneof(
  fc.constant(null),
  fc.record({
    granularity: fc.constantFrom<z.infer<typeof granularities>>(
      "auto",
      "minute",
      "hour",
      "day",
      "week",
      "month",
    ),
  }),
);

// ============================================================================
// Dimension Arbitraries
// ============================================================================

/**
 * Generate valid dimension selections for a given view
 * Returns 0-4 dimensions randomly selected from available dimensions
 */
export const dimensionsArbitrary = (
  viewName: z.infer<typeof views>,
): fc.Arbitrary<Array<{ field: string }>> => {
  const availableDimensions = Object.keys(
    viewDeclarations.v1[viewName].dimensions,
  );

  return fc
    .subarray(availableDimensions, { minLength: 0, maxLength: 4 })
    .map((fields) => fields.map((field) => ({ field })));
};

// ============================================================================
// Metric Arbitraries
// ============================================================================

/**
 * Available aggregation functions
 * Note: Excluding 'histogram' initially due to complexity
 */
const aggregationArbitrary = fc.constantFrom<
  z.infer<typeof metricAggregations>
>("sum", "avg", "count", "max", "min", "p50", "p75", "p90", "p95", "p99");

/**
 * Measures to exclude from v1/v2 equivalence testing per view.
 * - traces: `count` uses `count(*)` in v1 which is inflated by the observations
 *   LEFT JOIN (1 trace × 2 obs → count=2), while v2 uses
 *   `countIf(parent_span_id='')` which correctly counts traces only.
 */
const excludedMeasures: Partial<Record<z.infer<typeof views>, Set<string>>> = {
  traces: new Set(["count"]),
};

/**
 * Generate valid metric selections for a given view
 * Returns 0-3 metrics randomly selected from available measures
 * Each metric has a measure and an aggregation function
 */
export const metricsArbitrary = (
  viewName: z.infer<typeof views>,
): fc.Arbitrary<
  Array<{ measure: string; aggregation: z.infer<typeof metricAggregations> }>
> => {
  const excluded = excludedMeasures[viewName];
  const availableMeasures = Object.keys(
    viewDeclarations.v1[viewName].measures,
  ).filter((m) => !excluded?.has(m));

  return fc.array(
    fc.record({
      measure: fc.constantFrom(...availableMeasures),
      aggregation: aggregationArbitrary,
    }),
    { minLength: 0, maxLength: 3 },
  );
};

// ============================================================================
// Query Arbitraries
// ============================================================================

/**
 * Generate a valid basic query for a given view
 * This is the Milestone 1 version: NO filters and NO ordering
 *
 * The query includes:
 * - view: The view name (provided as parameter)
 * - dimensions: 0-4 dimensions from available dimensions
 * - metrics: 0-3 metrics from available measures
 * - filters: Empty array (Milestone 1)
 * - timeDimension: null or a granularity
 * - fromTimestamp/toTimestamp: Valid time range (1-90 days)
 * - orderBy: null (Milestone 1)
 * - chartConfig: undefined (Milestone 1)
 */
export const queryArbitrary = (
  viewName: z.infer<typeof views>,
): fc.Arbitrary<QueryType> => {
  return fc
    .tuple(
      fc.constant(viewName),
      dimensionsArbitrary(viewName),
      metricsArbitrary(viewName),
      timeDimensionArbitrary,
      timeRangeArbitrary,
    )
    .map(
      ([
        view,
        dimensions,
        metrics,
        timeDimension,
        { fromTimestamp, toTimestamp },
      ]) =>
        ({
          view,
          dimensions,
          metrics,
          filters: [], // Milestone 1: no filters
          timeDimension,
          fromTimestamp,
          toTimestamp,
          orderBy: null, // Milestone 1: no ordering
          chartConfig: undefined, // Milestone 1: no chart config
        }) as QueryType,
    );
};
