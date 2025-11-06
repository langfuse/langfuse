import React, { useState, useRef, useLayoutEffect, useMemo } from "react";
import { type LegendProps } from "recharts";
import { MoreVertical } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { cn } from "@/src/utils/tailwind";
import {
  useChart,
  getPayloadConfigFromPayload,
} from "@/src/components/ui/chart";

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
  noTruncate?: boolean;
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
  noTruncate = false,
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
          "text-muted-foreground",
          !noTruncate && "max-w-[120px] truncate",
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
    const { config } = useChart();
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

        // Add 6px tolerance for sub-pixel rendering and font variations
        setNeedsPopover(containerHeight > twoLines + 6);
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

      onVisibilityChange(key, newVisibility);
    };

    if (!payload || payload.length === 0) {
      return null;
    }

    // Estimate visible items for truncation
    // This is approximate - actual display depends on label widths
    const estimateVisibleCount = () => {
      if (!needsPopover) return payload.length;
      // More generous estimate: aim to fill ~75% of available space
      // Reduces unnecessary truncation while still preventing overflow
      return Math.max(7, Math.floor(payload.length * 0.75));
    };

    const visibleItems = needsPopover
      ? payload.slice(0, estimateVisibleCount())
      : payload;
    const hiddenCount = payload.length - visibleItems.length;

    // Group items by score name (prefix before dash)
    const groupedItems = useMemo(() => {
      const groups: Record<string, typeof payload> = {};

      payload.forEach((item) => {
        const key = `${nameKey || item.dataKey || "value"}`;
        let groupName = "Categories";

        // Try to extract score name from key (e.g., "sentiment-negative" → "sentiment")
        if (key.includes("-")) {
          const prefix = key.split("-")[0];
          if (prefix) {
            groupName =
              prefix.charAt(0).toUpperCase() + prefix.slice(1).toLowerCase();
          }
        }

        if (!groups[groupName]) {
          groups[groupName] = [];
        }
        groups[groupName].push(item);
      });

      return groups;
    }, [payload, nameKey]);

    // Smart label formatter for common patterns
    const smartFormatLabel = (label: string): string => {
      if (!label || typeof label !== "string") return String(label);

      // Pattern: "sentiment-negative" → "Negative"
      if (label.includes("-")) {
        const suffix = label.split("-").pop();
        if (suffix) {
          return suffix.charAt(0).toUpperCase() + suffix.slice(1).toLowerCase();
        }
      }

      // Pattern: "high_confidence" → "High Confidence"
      if (label.includes("_")) {
        return label
          .split("_")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(" ");
      }

      // Pattern: "camelCase" → "Camel Case"
      if (/[a-z][A-Z]/.test(label)) {
        return label
          .replace(/([a-z])([A-Z])/g, "$1 $2")
          .replace(/^./, (str) => str.toUpperCase());
      }

      // Default: capitalize first letter
      return label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();
    };

    // Format label for display
    const getFormattedLabel = (item: (typeof payload)[0]) => {
      const key = `${nameKey || item.dataKey || "value"}`;

      // Try to get label from ChartConfig first
      const itemConfig = getPayloadConfigFromPayload(config, item, key);
      if (itemConfig?.label) {
        return itemConfig.label;
      }

      // Fallback to original logic
      const rawLabel = item.value || key;

      // Handle "__unmatched__" special case
      if (rawLabel === "__unmatched__" || rawLabel === "unmatched") {
        return "Unmatched";
      }

      if (formatLabel) {
        return formatLabel(rawLabel, item);
      }

      // Apply smart formatting as final fallback
      return smartFormatLabel(rawLabel);
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
          className="flex max-h-[48px] flex-1 flex-wrap items-center justify-center gap-x-3 gap-y-1 overflow-hidden"
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

          {/* Combined popover button with count - inline as last item */}
          {needsPopover && (
            <Popover open={showPopover} onOpenChange={setShowPopover}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 shrink-0 gap-1 px-2 text-xs text-muted-foreground hover:bg-accent"
                  aria-label={`Show all ${payload.length} categories`}
                >
                  <span>Show all {payload.length}</span>
                  {hiddenCount > 0 && (
                    <span className="font-medium">(+{hiddenCount})</span>
                  )}
                  <MoreVertical className="h-3 w-3" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-80"
                align="end"
                side={verticalAlign === "top" ? "bottom" : "top"}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">All Categories</p>
                    <span className="text-xs text-muted-foreground">
                      {payload.length} total
                    </span>
                  </div>
                  <div className="space-y-3">
                    {Object.entries(groupedItems).map(
                      ([groupName, items], groupIndex) => (
                        <div key={groupName}>
                          {/* Only show subheader if there are multiple groups */}
                          {Object.keys(groupedItems).length > 1 && (
                            <h4 className="mb-2 text-xs font-medium text-muted-foreground">
                              {groupName}
                            </h4>
                          )}
                          <div className="space-y-1">
                            {items.map((item) => {
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
                                <div
                                  key={key}
                                  className="rounded-sm px-2 py-1.5 hover:bg-accent/50"
                                >
                                  <LegendItem
                                    color={finalColor}
                                    label={getFormattedLabel(item)}
                                    visible={visible}
                                    interactive={interactive}
                                    onClick={() => handleItemClick(key)}
                                    noTruncate={true}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>
    );
  },
);

ScoreChartLegendContent.displayName = "ScoreChartLegendContent";
