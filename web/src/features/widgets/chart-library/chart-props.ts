import { type ChartConfig } from "@/src/components/ui/chart";

/**
 * Represents a single data point for chart rendering with multi-dimensional breakdown support
 *
 * This interface uses a unified approach for all dimensional data:
 * - Single dimension: dimensions = ["production"]
 * - Multi-dimensional: dimensions = ["production", "gpt-4"]
 * - No dimensions: dimensions = []
 * - Combined keys: Auto-generated 'combinedDimension' for grouping and display
 *
 * @example
 * ```typescript
 * // Single dimension
 * { time_dimension: "2024-01", dimensions: ["production"], combinedDimension: "production", metric: 100 }
 *
 * // Multi-dimensional
 * {
 *   time_dimension: "2024-01",
 *   dimensions: ["production", "gpt-4"],
 *   combinedDimension: "production|gpt-4",
 *   metric: 100
 * }
 *
 * // No dimensions
 * { time_dimension: "2024-01", dimensions: [], metric: 100 }
 * ```
 */
export interface DataPoint {
  /** Time dimension for time-series charts (optional) */
  time_dimension: string | undefined;

  /** Dimensional breakdown array - unified approach for all dimensional data */
  dimensions: (string | null | undefined)[];

  /** Auto-generated combined dimension key for grouping (e.g., "production|gpt-4") */
  combinedDimension?: string;

  /** Metric value - can be single number or array for complex chart types */
  metric: number | Array<Array<number>>;
}

export interface ChartProps {
  data: DataPoint[];
  config?: ChartConfig;
  accessibilityLayer?: boolean;
}
