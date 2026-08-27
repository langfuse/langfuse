import React, { useEffect, useMemo, useRef, useState } from "react";
import { type ChartConfig } from "@/src/components/ui/chart";
import {
  type DataPoint,
  type LegendInteraction,
  type LegendSummaryMode,
} from "@/src/features/widgets/chart-library/chart-props";
import { getDimensionSummaries } from "@/src/features/widgets/chart-library/utils";
import { getPlainTextFromReactNode } from "@/src/utils/react-node-plain-text";
import { cn } from "@/src/utils/tailwind";

/** The 8-slot chart palette, cycled by series index (matches the series fills). */
export const seriesColor = (index: number): string =>
  `hsl(var(--chart-${(index % 8) + 1}))`;

export type LegendItem = {
  dimension: string;
  /**
   * Display label — the chart config's label for this series, falling back to
   * the raw dimension: the same chain the tooltip resolves a row name through
   * (`ChartTooltipContent`), so legend and tooltip can never disagree about
   * what a series is called. (LFE-10576)
   */
  label: React.ReactNode;
  /** Position in the dimension list — pins the swatch color to the series fill. */
  colorIndex: number;
  color: string;
  /** Per-series summary under the active mode, or `null` when there's nothing to show. */
  summary: number | null;
  /** Greyed in the legend: muted (highlight mode) or hidden (toggle mode). */
  dimmed: boolean;
  /** Highlight mode only: this is the actively-focused series (clicking it clears focus). */
  focused: boolean;
};

/**
 * Owns the per-series legend state for a multi-series time chart: the displayed
 * summary, the focus-vs-toggle interaction, and the optional top-N default that
 * tames overloaded charts. Returns presentation-ready legend items plus the two
 * predicates the chart needs — whether to draw a series, and whether to mute it.
 *
 * Shared by the line/area/bar time-series charts so they stay consistent.
 */
export function useSeriesLegend({
  data,
  dimensions,
  config,
  legendSummary = "none",
  legendInteraction = "highlight",
  maxVisibleSeries,
}: {
  data: DataPoint[];
  dimensions: string[];
  /** Resolves display labels (see {@link LegendItem.label}). */
  config?: ChartConfig;
  legendSummary?: LegendSummaryMode;
  legendInteraction?: LegendInteraction;
  maxVisibleSeries?: number;
}): {
  legendItems: LegendItem[];
  onLegendClick: (dimension: string) => void;
  isRendered: (dimension: string) => boolean;
  isDimmed: (dimension: string) => boolean;
  /** True when a series is click-focused (highlight mode) — gates hover effects. */
  isHighlightActive: boolean;
} {
  const summaries = useMemo(
    () => (legendSummary === "none" ? null : getDimensionSummaries(data)),
    [data, legendSummary],
  );

  // Seed the top-N visible set by additive magnitude (chart metrics are
  // non-negative, so a plain sum ranks "biggest series" well enough).
  const initialHidden = useMemo(() => {
    if (legendInteraction !== "toggle" || maxVisibleSeries === undefined) {
      return new Set<string>();
    }
    const magnitude = getDimensionSummaries(data);
    const keep = new Set(
      [...dimensions]
        .sort(
          (a, b) =>
            (magnitude.get(b) ?? -Infinity) - (magnitude.get(a) ?? -Infinity),
        )
        .slice(0, Math.max(0, maxVisibleSeries)),
    );
    return new Set(dimensions.filter((dimension) => !keep.has(dimension)));
  }, [data, dimensions, legendInteraction, maxVisibleSeries]);

  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(initialHidden);

  // Re-seed when the series SET or overload config changes (e.g. data reloads).
  // Sort before stringifying so the key is order-insensitive: when the top-N
  // preparer reorders an unchanged set (two near-equal series swap rank on a
  // refresh), we must NOT wipe the user's highlight/hide selections.
  const seedKey = `${legendInteraction}|${maxVisibleSeries ?? ""}|${JSON.stringify([...dimensions].sort())}`;
  const prevSeedKey = useRef(seedKey);
  useEffect(() => {
    if (prevSeedKey.current === seedKey) return;
    prevSeedKey.current = seedKey;
    setHighlighted(null);
    setHidden(initialHidden);
  }, [seedKey, initialHidden]);

  const onLegendClick = (dimension: string) => {
    if (legendInteraction === "toggle") {
      setHidden((prev) => {
        const next = new Set(prev);
        if (next.has(dimension)) next.delete(dimension);
        else next.add(dimension);
        return next;
      });
    } else {
      setHighlighted((prev) => (prev === dimension ? null : dimension));
    }
  };

  const isRendered = (dimension: string) =>
    legendInteraction === "toggle" ? !hidden.has(dimension) : true;

  const isDimmed = (dimension: string) =>
    legendInteraction === "toggle"
      ? hidden.has(dimension)
      : highlighted !== null && highlighted !== dimension;

  const legendItems: LegendItem[] = dimensions.map((dimension, index) => ({
    dimension,
    label: config?.[dimension]?.label ?? dimension,
    colorIndex: index,
    color: seriesColor(index),
    summary: summaries?.get(dimension) ?? null,
    dimmed: isDimmed(dimension),
    focused: legendInteraction !== "toggle" && highlighted === dimension,
  }));

  const isHighlightActive =
    legendInteraction !== "toggle" && highlighted !== null;

  return {
    legendItems,
    onLegendClick,
    isRendered,
    isDimmed,
    isHighlightActive,
  };
}

/**
 * Honest "we didn't draw everything" caption for charts whose breakdown
 * overflowed the render cap (see {@link prepareVisibleSeries}). Rendered even
 * when the legend is hidden so a capped chart never silently looks complete.
 * (LFE-10549)
 */
export function SeriesOverflowNote({
  visibleCount,
  totalCount,
}: {
  visibleCount: number;
  totalCount: number;
}) {
  if (totalCount <= visibleCount) return null;
  return (
    <div className="text-muted-foreground shrink-0 pb-1 text-right text-xs">
      Showing top {visibleCount} of {totalCount} series
    </div>
  );
}

/**
 * Presentational legend row for the multi-series time charts. State and click
 * semantics come from {@link useSeriesLegend}; this only renders.
 */
export function TimeSeriesLegend({
  items,
  interaction,
  onItemClick,
  formatSummary,
}: {
  items: LegendItem[];
  interaction: LegendInteraction;
  onItemClick: (dimension: string) => void;
  formatSummary: (value: number) => string;
}) {
  if (items.length === 0) return null;

  return (
    // Wrap onto multiple rows so every series stays visible, but cap the
    // legend's height and scroll inside it — a chart with hundreds of series
    // must never let the legend crowd the plot out entirely. (LFE-10549)
    // Sits BELOW the plot (classic bottom-legend placement), so it pads
    // against the x-axis above it. (LFE-10576)
    <div className="[max-height:8rem] min-w-0 shrink-0 overflow-y-auto pt-2">
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
        {items.map((item) => {
          const labelText = getPlainTextFromReactNode(item.label);
          // Labels must describe the NEXT action, not the current state.
          // - toggle: click flips visibility → "Show"/"Hide".
          // - highlight: clicking the focused series clears focus ("Show all
          //   series"); clicking any other focuses it ("Show only X"). (Getting
          //   this from `dimmed` alone inverts it once a series is focused.)
          const ariaLabel =
            interaction === "toggle"
              ? item.dimmed
                ? `Show ${labelText}`
                : `Hide ${labelText}`
              : item.focused
                ? "Show all series"
                : `Show only ${labelText}`;
          // aria-pressed reflects state: visible (toggle) / focused (highlight).
          const ariaPressed =
            interaction === "toggle" ? !item.dimmed : item.focused;
          return (
            <button
              key={item.dimension}
              type="button"
              onClick={() => onItemClick(item.dimension)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 text-xs whitespace-nowrap transition-opacity",
                "cursor-pointer hover:opacity-80",
                item.dimmed && "opacity-40",
              )}
              aria-pressed={ariaPressed}
              aria-label={ariaLabel}
            >
              <div
                className="h-2 w-2 shrink-0 rounded-[2px]"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-muted-foreground">{item.label}</span>
              {item.summary !== null && (
                <span className="text-foreground font-bold">
                  {formatSummary(item.summary)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
