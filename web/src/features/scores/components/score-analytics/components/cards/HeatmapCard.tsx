import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { Loader2 } from "lucide-react";
import { useScoreAnalytics } from "../ScoreAnalyticsProvider";
import { Heatmap } from "../charts/Heatmap";
import { HeatmapLegend } from "../charts/HeatmapLegend";
import { HeatmapPlaceholder } from "../charts/HeatmapPlaceholder";
import { getHeatmapCellColor } from "@/src/features/scores/lib/color-scales";
import { type HeatmapCell } from "@/src/features/scores/lib/heatmap-utils";
import { useCallback } from "react";

/**
 * HeatmapCard - Smart card component for displaying score comparison heatmaps
 *
 * Consumes ScoreAnalyticsProvider context and displays:
 * - Numeric scores: 10x10 bin heatmap showing correlation patterns
 * - Categorical/Boolean: Confusion matrix showing agreement
 * - Placeholder in single-score mode
 *
 * Handles:
 * - Loading states
 * - Empty states
 * - Single vs two-score modes (only shows in two-score mode)
 * - Numeric vs categorical data types
 */
export function HeatmapCard() {
  const { data, isLoading, params } = useScoreAnalytics();

  // Compute max value for color scaling (must be before early returns)
  const maxValue =
    data?.heatmap && data.heatmap.cells && data.heatmap.cells.length > 0
      ? "maxValue" in data.heatmap && typeof data.heatmap.maxValue === "number"
        ? data.heatmap.maxValue
        : Math.max(...data.heatmap.cells.map((c: HeatmapCell) => c.value))
      : 0;

  // Create color function using score1's color (must be before early returns)
  const getColor = useCallback(
    (cell: HeatmapCell) => {
      return getHeatmapCellColor(1, cell.value, 0, maxValue);
    },
    [maxValue],
  );

  // Loading state
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Score Comparison</CardTitle>
          <CardDescription>Loading heatmap...</CardDescription>
        </CardHeader>
        <CardContent className="flex h-[300px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // No data state
  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Score Comparison</CardTitle>
          <CardDescription>No data available</CardDescription>
        </CardHeader>
        <CardContent className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
          Select a score to view comparison
        </CardContent>
      </Card>
    );
  }

  const { heatmap, metadata } = data;
  const { mode, dataType } = metadata;
  const { score1, score2 } = params;

  const title =
    dataType === "NUMERIC" ? "Score Comparison Heatmap" : "Confusion Matrix";

  const description =
    dataType === "NUMERIC"
      ? "Distribution of matched score pairs showing correlation patterns"
      : "Agreement matrix between categorical scores";

  // Single score mode - show placeholder
  if (mode === "single") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          <HeatmapPlaceholder />
        </CardContent>
      </Card>
    );
  }

  // Two score mode - show heatmap or empty state
  const hasData = heatmap && heatmap.cells.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        {hasData ? (
          <>
            <Heatmap
              data={heatmap.cells}
              rows={
                dataType === "NUMERIC"
                  ? 10
                  : "rows" in heatmap
                    ? (heatmap.rows as number)
                    : 0
              }
              cols={
                dataType === "NUMERIC"
                  ? 10
                  : "cols" in heatmap
                    ? (heatmap.cols as number)
                    : 0
              }
              rowLabels={heatmap.rowLabels}
              colLabels={heatmap.colLabels}
              xAxisLabel={`${score2?.name} (${score2?.source})`}
              yAxisLabel={`${score1.name} (${score1.source})`}
              getColor={getColor}
              renderTooltip={(cell) => (
                <div className="space-y-1">
                  <p className="font-semibold">Count: {cell.value}</p>
                  {dataType === "NUMERIC" ? (
                    <>
                      <p className="text-xs">
                        {score1.name}:{" "}
                        {(
                          cell.metadata?.yRange as [number, number]
                        )?.[0]?.toFixed(2)}{" "}
                        -{" "}
                        {(
                          cell.metadata?.yRange as [number, number]
                        )?.[1]?.toFixed(2)}
                      </p>
                      <p className="text-xs">
                        {score2?.name}:{" "}
                        {(
                          cell.metadata?.xRange as [number, number]
                        )?.[0]?.toFixed(2)}{" "}
                        -{" "}
                        {(
                          cell.metadata?.xRange as [number, number]
                        )?.[1]?.toFixed(2)}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs">
                      {cell.metadata?.rowCategory as string} →{" "}
                      {cell.metadata?.colCategory as string}
                    </p>
                  )}
                  <p className="text-xs">
                    {((cell.metadata?.percentage as number) ?? 0).toFixed(1)}%
                    of matched pairs
                  </p>
                </div>
              )}
            />
            <HeatmapLegend
              min={0}
              max={maxValue}
              variant="accent"
              title="Count"
              orientation="horizontal"
              steps={10}
            />
          </>
        ) : (
          <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
            No matched score pairs found for the selected time range
          </div>
        )}
      </CardContent>
    </Card>
  );
}
