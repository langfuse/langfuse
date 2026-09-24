/* eslint-disable no-nested-ternary */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChartLegend } from "@/src/components/design-system/charts/ChartLegend";
import { type ChartConfig } from "@/src/components/ui/chart";
import {
  type DataPoint,
  type LegendInteraction,
  type LegendSummaryMode,
} from "@/src/features/widgets/chart-library/chart-props";
import { getDimensionSummaries } from "@/src/features/widgets/chart-library/utils";
import { getPlainTextFromReactNode } from "@/src/utils/react-node-plain-text";

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
  return (
    <ChartLegend
      selectionActions={
        interaction === "toggle"
          ? {
              allSelected: items.every((item) => !item.dimmed),
              onSelectAll: () => {
                items
                  .filter((item) => item.dimmed)
                  .forEach((item) => onItemClick(item.dimension));
              },
              onDeselectAll: () => {
                items
                  .filter((item) => !item.dimmed)
                  .forEach((item) => onItemClick(item.dimension));
              },
            }
          : undefined
      }
      items={items.map((item) => {
        const labelText =
          getPlainTextFromReactNode(item.label) ?? item.dimension;
        // Labels describe the next action, which cannot be inferred from the
        // visual muted state alone in highlight mode.
        const actionLabel =
          interaction === "toggle"
            ? item.dimmed
              ? `Show ${labelText}`
              : `Hide ${labelText}`
            : item.focused
              ? "Show all series"
              : `Show only ${labelText}`;
        return {
          id: item.dimension,
          label: item.label,
          color: item.color,
          value:
            item.summary === null
              ? undefined
              : { label: "Sum", value: formatSummary(item.summary) },
          muted: item.dimmed,
          action: {
            label: actionLabel,
            pressed: interaction === "toggle" ? !item.dimmed : item.focused,
            onClick: () => onItemClick(item.dimension),
          },
        };
      })}
    />
  );
}
