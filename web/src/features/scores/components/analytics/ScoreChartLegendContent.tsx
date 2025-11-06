import React, { useState, useRef, useLayoutEffect } from "react";
import { type LegendProps } from "recharts";
import { MoreVertical } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { cn } from "@/src/utils/tailwind";

export interface ScoreChartLegendContentProps
  extends Pick<LegendProps, "payload" | "verticalAlign"> {
  /** Enable interactive click-to-toggle functionality */
  interactive?: boolean;
  /** Visibility state for each legend item (key -> visible) */
  visibilityState?: Record<string, boolean>;
  /** Callback when visibility changes */
  onVisibilityChange?: (key: string, visible: boolean) => void;
  /** Optional function to format labels */
  formatLabel?: (label: string, item: unknown) => string;
  /** Hide the color indicator icon */
  hideIcon?: boolean;
  /** Custom className */
  className?: string;
  /** Name key to use for legend items */
  nameKey?: string;
}

interface LegendItemProps {
  color: string;
  label: string;
  visible: boolean;
  interactive: boolean;
  onClick?: () => void;
}

/**
 * Individual legend item component with interactive toggle support
 */
const LegendItem = ({
  color,
  label,
  visible,
  interactive,
  onClick,
}: LegendItemProps) => {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      aria-pressed={visible}
      aria-label={`${visible ? "Hide" : "Show"} ${label}`}
      className={cn(
        "flex items-center gap-1.5 text-sm transition-opacity",
        interactive && "cursor-pointer hover:opacity-80",
        !interactive && "cursor-default",
        !visible && "opacity-50",
      )}
    >
      <div
        className={cn(
          "h-2 w-2 shrink-0 rounded-full",
          visible ? "bg-current" : "border-2 border-current bg-transparent", // Filled vs outlined
        )}
        style={{
          color: color,
          ...(visible
            ? { backgroundColor: color }
            : { borderColor: color, backgroundColor: "transparent" }),
        }}
      />
      <span
        className={cn(
          "max-w-[120px] truncate text-muted-foreground",
          !visible && "line-through", // Strike through when hidden
        )}
      >
        {label}
      </span>
    </button>
  );
};

/**
 * Interactive legend component with 2-line layout and progressive disclosure
 *
 * Features:
 * - Fixed 2-line height (no layout jumps)
 * - Overflow detection with hybrid approach
 * - Truncation with popover for full list
 * - Click-to-toggle series visibility
 * - Accessibility support (keyboard, ARIA)
 */
export const ScoreChartLegendContent = React.forwardRef<
  HTMLDivElement,
  ScoreChartLegendContentProps
>(
  (
    {
      payload,
      interactive = false,
      visibilityState,
      onVisibilityChange,
      formatLabel,
      verticalAlign = "bottom",
      className,
      nameKey,
    },
    ref,
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [showPopover, setShowPopover] = useState(false);
    const [needsPopover, setNeedsPopover] = useState(false);

    // Measure actual height to detect overflow (hybrid approach)
    useLayoutEffect(() => {
      if (!containerRef.current || !payload || payload.length === 0) {
        setNeedsPopover(false);
        return;
      }

      const measure = () => {
        const container = containerRef.current;
        if (!container) return;

        const lineHeight = parseInt(
          window.getComputedStyle(container).lineHeight || "24",
        );
        const containerHeight = container.scrollHeight;
        const twoLines = lineHeight * 2;

        // Add 2px tolerance for rounding errors
        setNeedsPopover(containerHeight > twoLines + 2);
      };

      // Initial measurement
      measure();

      // Re-measure on window resize
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }, [payload]);

    const handleItemClick = (key: string) => {
      if (!interactive || !onVisibilityChange) return;

      const currentVisibility = visibilityState?.[key] ?? true;
      const newVisibility = !currentVisibility;

      // Prevent hiding the last visible item
      if (!newVisibility) {
        const visibleCount = Object.values(visibilityState ?? {}).filter(
          (v) => v,
        ).length;
        if (visibleCount <= 1) {
          // Don't allow hiding the last item
          return;
        }
      }

      onVisibilityChange(key, newVisibility);
    };

    if (!payload || payload.length === 0) {
      return null;
    }

    // Estimate visible items for truncation
    // This is approximate - actual display depends on label widths
    const estimateVisibleCount = () => {
      if (!needsPopover) return payload.length;
      // Conservative estimate: ~6-8 items fit in 2 lines at typical widths
      return Math.max(6, Math.floor(payload.length * 0.6));
    };

    const visibleItems = needsPopover
      ? payload.slice(0, estimateVisibleCount())
      : payload;
    const hiddenCount = payload.length - visibleItems.length;

    // Format label for display
    const getFormattedLabel = (item: (typeof payload)[0]) => {
      const key = `${nameKey || item.dataKey || "value"}`;
      const rawLabel = item.value || key;

      // Handle "__unmatched__" special case
      if (rawLabel === "__unmatched__" || rawLabel === "unmatched") {
        return "Unmatched";
      }

      if (formatLabel) {
        return formatLabel(rawLabel, item);
      }

      return rawLabel;
    };

    return (
      <div
        ref={ref}
        className={cn(
          "flex min-h-[48px] items-center justify-center gap-2",
          verticalAlign === "top" ? "pb-3" : "pt-3",
          className,
        )}
      >
        {/* Truncated inline legend (fixed 2-line height) */}
        <div
          ref={containerRef}
          className="flex max-h-[48px] flex-1 flex-wrap items-center gap-x-3 gap-y-1 overflow-hidden"
        >
          {visibleItems.map((item) => {
            const key = `${nameKey || item.dataKey || "value"}`;
            const visible = visibilityState?.[key] ?? true;
            const color =
              item.color ||
              (typeof item.payload === "object" &&
              item.payload &&
              "fill" in item.payload
                ? (item.payload as { fill: string }).fill
                : "hsl(var(--chart-1))");

            // Special color for "unmatched" category
            const isUnmatched = key === "__unmatched__" || key === "unmatched";
            const finalColor = isUnmatched
              ? "hsl(var(--muted-foreground))"
              : color;

            return (
              <LegendItem
                key={key}
                color={finalColor}
                label={getFormattedLabel(item)}
                visible={visible}
                interactive={interactive}
                onClick={() => handleItemClick(key)}
              />
            );
          })}

          {needsPopover && hiddenCount > 0 && (
            <span className="text-xs text-muted-foreground">
              ... (+{hiddenCount})
            </span>
          )}
        </div>

        {/* Popover button for full list */}
        {needsPopover && (
          <Popover open={showPopover} onOpenChange={setShowPopover}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 shrink-0 p-0"
                aria-label="Show all legend items"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-64"
              align="end"
              side={verticalAlign === "top" ? "bottom" : "top"}
            >
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  All Categories ({payload.length})
                </p>
                <div className="max-h-64 space-y-1 overflow-y-auto">
                  {payload.map((item) => {
                    const key = `${nameKey || item.dataKey || "value"}`;
                    const visible = visibilityState?.[key] ?? true;
                    const color =
                      item.color ||
                      (typeof item.payload === "object" &&
                      item.payload &&
                      "fill" in item.payload
                        ? (item.payload as { fill: string }).fill
                        : "hsl(var(--chart-1))");

                    const isUnmatched =
                      key === "__unmatched__" || key === "unmatched";
                    const finalColor = isUnmatched
                      ? "hsl(var(--muted-foreground))"
                      : color;

                    return (
                      <LegendItem
                        key={key}
                        color={finalColor}
                        label={getFormattedLabel(item)}
                        visible={visible}
                        interactive={interactive}
                        onClick={() => handleItemClick(key)}
                      />
                    );
                  })}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
    );
  },
);

ScoreChartLegendContent.displayName = "ScoreChartLegendContent";
