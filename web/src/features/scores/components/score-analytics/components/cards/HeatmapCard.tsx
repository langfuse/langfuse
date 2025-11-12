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
import { HeatmapSkeleton } from "../charts/HeatmapSkeleton";
import { getHeatmapCellColor } from "@/src/features/scores/components/score-analytics/libs/color-scales";
import { type HeatmapCell } from "@/src/features/scores/components/score-analytics/libs/heatmap-utils";
import { useCallback } from "react";
import type { ScoreDataType } from "@langfuse/shared";
import { SamplingDetailsHoverCard } from "../ScoreAnalyticsNoticeBanner";

interface HeatmapTooltipContentProps {
  cell: HeatmapCell;
  dataType: ScoreDataType;
  score1: { name: string; source: string };
  score2: { name: string; source: string } | undefined;
  score1Color: string;
  score2Color: string;
  totalMatchedPairs: number;
}

/**
 * HeatmapTooltipContent - Renders tooltip content for heatmap cells
 *
 * Displays different information based on data type:
 * - Numeric: Shows bin ranges and value distributions
 * - Categorical: Shows category pairs and agreement metrics
 */
function HeatmapTooltipContent({
  cell,
  dataType,
  score1,
  score2,
  score1Color,
  score2Color,
  totalMatchedPairs,
}: HeatmapTooltipContentProps) {
  const percentage = (cell.metadata?.percentage as number) ?? 0;

  return (
    <div className="space-y-2">
      {/* Header Section */}
      <div className="border-b border-border pb-2">
        <p className="text-sm font-medium text-muted-foreground">
          {dataType === "NUMERIC"
            ? `Bin ${cell.row}×${cell.col}`
            : `${cell.metadata?.rowCategory as string} → ${cell.metadata?.colCategory as string}`}
        </p>
      </div>

      {/* Primary Metrics Section */}
      <div className="space-y-1">
        <p className="text-base font-semibold text-foreground">
          {cell.value.toLocaleString()} observations
        </p>
        <p className="text-xs text-muted-foreground">
          {percentage.toFixed(1)}% of {totalMatchedPairs.toLocaleString()}{" "}
          matched pairs
        </p>
      </div>

      {/* Secondary Info Section */}
      <div className="space-y-1 border-t border-border pt-2">
        {dataType === "NUMERIC" ? (
          <>
            <div className="flex items-center gap-2">
              <div
                className="h-3 w-3 flex-shrink-0 rounded-sm"
                style={{ backgroundColor: score1Color }}
              />
              <span className="flex-1 text-xs text-muted-foreground">
                {score1.name} ({score1.source})
              </span>
              <span className="text-xs text-muted-foreground">
                {(cell.metadata?.yRange as [number, number])?.[0]?.toFixed(2)} -{" "}
                {(cell.metadata?.yRange as [number, number])?.[1]?.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="h-3 w-3 flex-shrink-0 rounded-sm"
                style={{ backgroundColor: score2Color }}
              />
              <span className="flex-1 text-xs text-muted-foreground">
                {score2?.name} ({score2?.source})
              </span>
              <span className="text-xs text-muted-foreground">
                {(cell.metadata?.xRange as [number, number])?.[0]?.toFixed(2)} -{" "}
                {(cell.metadata?.xRange as [number, number])?.[1]?.toFixed(2)}
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <div
                className="h-3 w-3 flex-shrink-0 rounded-sm"
                style={{ backgroundColor: score1Color }}
              />
              <span className="text-xs text-muted-foreground">
                {score1.name} ({score1.source})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="h-3 w-3 flex-shrink-0 rounded-sm"
                style={{ backgroundColor: score2Color }}
              />
              <span className="text-xs text-muted-foreground">
                {score2?.name} ({score2?.source})
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

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
  const { data, isLoading, params, getColorForScore } = useScoreAnalytics();

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
        <CardContent className="flex flex-1 flex-col items-center justify-center pl-1">
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
        <CardContent className="flex flex-1 flex-col items-center justify-center pl-0 text-sm text-muted-foreground">
          Select a score to view comparison
        </CardContent>
      </Card>
    );
  }

  const { heatmap, metadata, statistics } = data;
  const { mode, dataType } = metadata;
  const { score1, score2 } = params;

  // Get total matched pairs for tooltip context
  const totalMatchedPairs = statistics.comparison?.matchedCount ?? 0;

  const title =
    dataType === "NUMERIC" ? "Score Comparison Heatmap" : "Confusion Matrix";

  const description =
    mode === "single"
      ? dataType === "NUMERIC"
        ? "Distribution of matched score pairs showing correlation patterns"
        : "Agreement matrix between categorical scores"
      : dataType === "NUMERIC"
        ? `${totalMatchedPairs.toLocaleString()} matched pairs showing correlation patterns`
        : `${totalMatchedPairs.toLocaleString()} matched pairs showing agreement`;

  // Single score mode - show placeholder
  if (mode === "single") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col items-center gap-4 pl-0">
          <HeatmapSkeleton
            rows={10}
            cols={10}
            cellHeight={Math.floor(200 / 10)}
            showLabels={true}
            showAxisLabels={true}
          />
          <p className="text-center text-sm font-light text-muted-foreground">
            Select a second score to view comparison heatmap
          </p>
        </CardContent>
      </Card>
    );
  }

  // Two score mode - show heatmap or empty state
  const hasData = heatmap && heatmap.cells.length > 0;

  // Calculate dynamic cell height based on available space
  // Magic number 230px represents approximate available height for grid
  // (card height minus header, labels, legend, gaps)
  const numRows =
    dataType === "NUMERIC"
      ? 10
      : heatmap && "rows" in heatmap
        ? heatmap.rows
        : 10;
  const calculatedCellHeight = Math.floor(200 / numRows);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="flex items-center gap-2">
                {title}
                {data.samplingMetadata.isSampled && (
                  <SamplingDetailsHoverCard
                    samplingMetadata={data.samplingMetadata}
                    showLabel
                  />
                )}
              </CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
            {hasData && (
              <HeatmapLegend
                min={0}
                max={maxValue}
                scoreNumber={1}
                orientation="horizontal"
                steps={5}
              />
            )}
          </div>
          {/* Placeholder to align with tabs in other cards */}
          <div className="h-10" />
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col items-center gap-4 pl-0">
        {hasData ? (
          <Heatmap
            height="100%"
            cellHeight={calculatedCellHeight}
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
            showValues={false}
            renderTooltip={(cell) => (
              <HeatmapTooltipContent
                cell={cell}
                dataType={dataType}
                score1={score1}
                score2={score2}
                score1Color={getColorForScore(1)}
                score2Color={getColorForScore(2)}
                totalMatchedPairs={totalMatchedPairs}
              />
            )}
          />
        ) : (
          <HeatmapSkeleton
            rows={numRows}
            cols={
              dataType === "NUMERIC"
                ? 10
                : heatmap && "cols" in heatmap
                  ? (heatmap.cols as number)
                  : 10
            }
            cellHeight={calculatedCellHeight}
            showLabels={true}
            showAxisLabels={true}
          />
        )}
      </CardContent>
    </Card>
  );
}
