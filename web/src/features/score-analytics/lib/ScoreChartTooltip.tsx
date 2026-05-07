import { cn } from "@/src/utils/tailwind";
import {
  type IntervalConfig,
  type TimeRange,
} from "@/src/utils/date-range-utils";
import { formatChartTooltipTimestamp } from "./chart-formatters";
import { useChart } from "@/src/components/ui/chart";
import type { TooltipContentProps, TooltipValueType } from "recharts";

/**
 * Props for the ScoreChartTooltip component.
 * Compatible with Recharts tooltip API.
 */
export interface ScoreChartTooltipProps {
  active?: TooltipContentProps<TooltipValueType, string | number>["active"];
  payload?: TooltipContentProps<TooltipValueType, string | number>["payload"];
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
  const { config } = useChart();

  if (!active || !payload || payload.length === 0) {
    return null;
  }

  // Filter out duplicates
  const uniquePayload = Array.from(
    new Map(
      payload.map((item) => [String(item.name ?? item.dataKey ?? ""), item]),
    ).values(),
  );

  // Sort payload by config key order for stable tooltip across columns
  // This maintains consistent ordering (e.g., alphabetical + unmatched last)
  // REVERSED to mirror the visual stack order (bottom-to-top becomes top-to-bottom in tooltip)
  // Falls back to value-based sorting if config keys not available
  const configKeys = Object.keys(config);
  const sortedPayload = uniquePayload.sort((a, b) => {
    const keyA = String(a.name ?? a.dataKey ?? "");
    const keyB = String(b.name ?? b.dataKey ?? "");

    // If both keys exist in config, sort by config order (reversed)
    const indexA = configKeys.indexOf(keyA);
    const indexB = configKeys.indexOf(keyB);

    if (indexA !== -1 && indexB !== -1) {
      return indexB - indexA; // Reversed: mirror visual stack order
    }

    // Fallback to value-based sorting (descending) for non-config keys
    return (Number(b.value) ?? 0) - (Number(a.value) ?? 0);
  });

  // Format the label (timestamp)
  let formattedLabel: string;

  if (labelFormatter) {
    // Use custom label formatter if provided
    formattedLabel = labelFormatter(label ?? "");
  } else if (typeof label === "string") {
    // Label is already formatted (from chart data transformation)
    formattedLabel = label;
  } else if (interval && timeRange && label) {
    // Format timestamp using interval-aware formatting (for numeric timestamps)
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
    <div className="border-border bg-background rounded-md border opacity-100 shadow-lg">
      {/* Header with timestamp/label */}
      <div className={cn("border-border border-b px-3 py-1.5")}>
        <p className={cn("text-muted-foreground text-sm font-medium")}>
          {formattedLabel}
        </p>
      </div>

      {/* Data series with values */}
      <div className={cn("space-y-1 px-3 py-1.5")}>
        {sortedPayload.map((entry, index) => {
          // Get series label from config using the Bar's dataKey
          const seriesKey = String(entry.name ?? entry.dataKey ?? "");
          const seriesLabel = config[seriesKey]?.label || seriesKey;

          return (
            <div
              key={`${index}-${entry.name}`}
              className="flex items-center gap-2"
            >
              {/* Color indicator */}
              <div
                className="h-3 w-3 shrink-0 rounded-sm"
                style={{
                  backgroundColor: entry.color ?? "hsl(var(--primary))",
                }}
              />

              {/* Series label from config */}
              <span className="text-muted-foreground flex-1 text-sm">
                {seriesLabel?.toString() ?? ""}
              </span>
              {/* Formatted value */}
              <span className="text-foreground text-sm font-medium">
                {valueFormatter(Number(entry.value ?? 0))}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
