import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { Heatmap, HeatmapLegend } from "./index";
import { HeatmapPlaceholder } from "./HeatmapPlaceholder";
import type { HeatmapCell } from "@/src/features/scores/lib/heatmap-utils";

interface HeatmapData {
  cells: HeatmapCell[];
  rows?: number;
  cols?: number;
  rowLabels?: string[];
  colLabels?: string[];
}

interface HeatmapCardProps {
  hasTwoScores: boolean;
  dataType: "NUMERIC" | "CATEGORICAL" | "BOOLEAN";
  heatmapData: HeatmapData | null;
  score1Name: string;
  score2Name: string | null;
  score1Source: string;
  score2Source: string | null;
}

/**
 * HeatmapCard component displays either a heatmap (numeric scores) or
 * confusion matrix (categorical/boolean scores) for score comparisons.
 * Shows a skeleton placeholder when only one score is selected.
 */
export function HeatmapCard({
  hasTwoScores,
  dataType,
  heatmapData,
  score1Name,
  score2Name,
  score1Source,
  score2Source,
}: HeatmapCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {dataType === "NUMERIC"
            ? "Score Comparison Heatmap"
            : "Confusion Matrix"}
        </CardTitle>
        <CardDescription>
          {dataType === "NUMERIC"
            ? "Distribution of matched score pairs showing correlation patterns"
            : "Agreement matrix between categorical scores"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        {!hasTwoScores ? (
          // Placeholder when only one score is selected
          <HeatmapPlaceholder />
        ) : heatmapData && heatmapData.cells.length > 0 ? (
          // Actual heatmap or confusion matrix
          <>
            <Heatmap
              data={heatmapData.cells}
              rows={
                dataType === "NUMERIC"
                  ? 10
                  : "rows" in heatmapData
                    ? (heatmapData.rows as number)
                    : 0
              }
              cols={
                dataType === "NUMERIC"
                  ? 10
                  : "cols" in heatmapData
                    ? (heatmapData.cols as number)
                    : 0
              }
              rowLabels={heatmapData.rowLabels}
              colLabels={heatmapData.colLabels}
              xAxisLabel={`${score2Name} (${score2Source})`}
              yAxisLabel={`${score1Name} (${score1Source})`}
              renderTooltip={(cell) => (
                <div className="space-y-1">
                  <p className="font-semibold">Count: {cell.value}</p>
                  {dataType === "NUMERIC" ? (
                    <>
                      <p className="text-xs">
                        {score1Name}:{" "}
                        {(
                          cell.metadata?.yRange as [number, number]
                        )?.[0]?.toFixed(2)}{" "}
                        -{" "}
                        {(
                          cell.metadata?.yRange as [number, number]
                        )?.[1]?.toFixed(2)}
                      </p>
                      <p className="text-xs">
                        {score2Name}:{" "}
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
              max={Math.max(...heatmapData.cells.map((c) => c.value))}
              variant="accent"
              title="Count"
              orientation="horizontal"
              steps={10}
            />
          </>
        ) : (
          // Empty state when no data available
          <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
            No matched score pairs found for the selected time range
          </div>
        )}
      </CardContent>
    </Card>
  );
}
