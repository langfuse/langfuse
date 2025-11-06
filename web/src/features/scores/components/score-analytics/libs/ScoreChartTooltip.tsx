import { cn } from "@/src/utils/tailwind";
import {
  type IntervalConfig,
  type TimeRange,
} from "@/src/utils/date-range-utils";
import { formatChartTooltipTimestamp } from "./chart-formatters";

/**
 * Props for the ScoreChartTooltip component.
 * Compatible with Recharts tooltip API.
 */
export interface ScoreChartTooltipProps {
  active?: boolean;
  payload?: Array<{
    name?: string;
    value?: number | string;
    color?: string;
    dataKey?: string;
    payload?: any;
  }>;
  label?: string | number;
  interval?: IntervalConfig;
  timeRange?: TimeRange;
  valueFormatter?: (value: number) => string;
  labelFormatter?: (label: string | number) => string;
}

/**
 * Custom tooltip component for Score Analytics charts.
 * Provides consistent styling and formatting across all chart types.
 *
 * Features:
 * - Sorted values (descending by magnitude)
 * - Custom value formatting (e.g., compact numbers, percentages)
 * - Dynamic timestamp formatting based on interval
 * - Color indicators for each data series
 * - Consistent design matching dashboard tooltips
 *
 * Usage:
 * ```tsx
 * <ChartTooltip
 *   content={
 *     <ScoreChartTooltip
 *       interval={interval}
 *       timeRange={timeRange}
 *       valueFormatter={compactNumberFormatter}
 *     />
 *   }
 * />
 * ```
 */
export function ScoreChartTooltip({
  active,
  payload,
  label,
  interval,
  timeRange,
  valueFormatter = (value: number) => value.toString(),
  labelFormatter,
}: ScoreChartTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  // Filter out duplicates and sort by value in descending order
  const uniquePayload = Array.from(
    new Map(payload.map((item) => [item.name ?? item.dataKey, item])).values(),
  );

  const sortedPayload = uniquePayload.sort(
    (a, b) => (Number(b.value) ?? 0) - (Number(a.value) ?? 0),
  );

  // Format the label (timestamp)
  let formattedLabel: string;

  if (labelFormatter) {
    // Use custom label formatter if provided
    formattedLabel = labelFormatter(label ?? "");
  } else if (interval && timeRange && label) {
    // Format timestamp using interval-aware formatting
    const timestamp =
      typeof label === "number" ? new Date(label) : new Date(label);
    formattedLabel = formatChartTooltipTimestamp(
      timestamp,
      interval,
      timeRange,
    );
  } else {
    // Fallback to string representation
    formattedLabel = String(label ?? "");
  }

  return (
    <div className="rounded-md border border-border bg-background opacity-100 shadow-lg">
      {/* Header with timestamp/label */}
      <div className={cn("border-b border-border px-3 py-1.5")}>
        <p className={cn("text-sm font-medium text-muted-foreground")}>
          {formattedLabel}
        </p>
      </div>

      {/* Data series with values */}
      <div className={cn("space-y-1 px-3 py-1.5")}>
        {sortedPayload.map((entry, index) => (
          <div
            key={`${index}-${entry.name}`}
            className="flex items-center gap-2"
          >
            {/* Color indicator */}
            <div
              className="h-3 w-3 flex-shrink-0 rounded-sm"
              style={{ backgroundColor: entry.color ?? "hsl(var(--primary))" }}
            />

            {/* Series name */}
            <span className="flex-1 text-sm text-muted-foreground">
              {entry.name?.toString() ?? entry.dataKey ?? ""}
            </span>

            {/* Formatted value */}
            <span className="text-sm font-medium text-foreground">
              {valueFormatter(Number(entry.value ?? 0))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
