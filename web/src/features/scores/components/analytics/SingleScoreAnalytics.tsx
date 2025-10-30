import { useMemo } from "react";
import { type RouterOutputs } from "@/src/utils/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { ScoreDistributionChart } from "./ScoreDistributionChart";
import { ScoreTimeSeriesChart } from "./ScoreTimeSeriesChart";

interface SingleScoreAnalyticsProps {
  scoreId: string;
  scoreName: string;
  dataType: "NUMERIC" | "CATEGORICAL" | "BOOLEAN";
  source: string;
  analytics: RouterOutputs["scores"]["getScoreComparisonAnalytics"];
  interval: "hour" | "day" | "week" | "month";
  nBins: number;
}

export function SingleScoreAnalytics({
  scoreName,
  dataType,
  source,
  analytics,
  interval,
  nBins,
}: SingleScoreAnalyticsProps) {
  // TODO: REMOVE BEFORE MERGING - Debug component render
  console.log("[SingleScoreAnalytics] Rendering with:", {
    scoreName,
    dataType,
    source,
    distributionLength: analytics.distribution1.length,
    timeSeriesLength: analytics.timeSeries.length,
    totalCount: analytics.counts.score1Total,
  });

  // Use distribution1 for single score
  const distribution = analytics.distribution1;
  const timeSeries = analytics.timeSeries;
  const totalCount = analytics.counts.score1Total;

  // Calculate statistics
  const statistics = useMemo(() => {
    if (distribution.length === 0) {
      return {
        average: null,
        mode: null,
        modeCount: 0,
      };
    }

    // For numeric: calculate average from statistics if available
    const average =
      dataType === "NUMERIC" && analytics.statistics
        ? analytics.statistics.mean1
        : null;

    // Find mode (most frequent bin/category)
    const maxCount = Math.max(...distribution.map((d) => d.count));
    const modeItem = distribution.find((d) => d.count === maxCount);
    const mode = modeItem?.binIndex ?? null;
    const modeCount = maxCount;

    return { average, mode, modeCount };
  }, [distribution, dataType, analytics.statistics]);

  // Generate bin labels for numeric scores
  const binLabels = useMemo(() => {
    if (dataType !== "NUMERIC" || !analytics.statistics) return undefined;

    // Get min/max from first heatmap row (if exists) or from distribution bounds
    // Since we're using score1, we need min1/max1
    const heatmapRow = analytics.heatmap[0];
    if (!heatmapRow) return undefined;

    const min = heatmapRow.min1;
    const max = heatmapRow.max1;
    const binWidth = (max - min) / nBins;

    return Array.from({ length: nBins }, (_, i) => {
      const start = min + i * binWidth;
      const end = min + (i + 1) * binWidth;
      return formatBinLabel(start, end);
    });
  }, [dataType, analytics.heatmap, analytics.statistics, nBins]);

  // Extract categories for categorical/boolean scores
  const categories = useMemo(() => {
    if (dataType === "NUMERIC") return undefined;

    // Get unique categories from confusion matrix
    const uniqueCategories = new Set<string>();
    analytics.confusionMatrix.forEach((row) => {
      uniqueCategories.add(row.rowCategory);
    });

    return Array.from(uniqueCategories).sort();
  }, [dataType, analytics.confusionMatrix]);

  // Calculate overall average from time series
  const overallAverage = useMemo(() => {
    if (timeSeries.length === 0) return 0;
    const validValues = timeSeries
      .map((t) => t.avg1)
      .filter((v): v is number => v !== null);
    if (validValues.length === 0) return 0;
    return validValues.reduce((sum, v) => sum + v, 0) / validValues.length;
  }, [timeSeries]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Distribution Card */}
      <Card>
        <CardHeader>
          <CardTitle>Distribution</CardTitle>
          <CardDescription>
            {totalCount.toLocaleString()} observations
            {dataType === "NUMERIC" && statistics.average !== null && (
              <> | Average: {statistics.average.toFixed(3)}</>
            )}
            {(dataType === "CATEGORICAL" || dataType === "BOOLEAN") &&
              categories &&
              statistics.mode !== null && (
                <>
                  {" "}
                  | Most frequent: {categories[statistics.mode]} (
                  {statistics.modeCount.toLocaleString()})
                </>
              )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {distribution.length > 0 ? (
            <ScoreDistributionChart
              data={distribution}
              dataType={dataType}
              scoreName={scoreName}
              totalCount={totalCount}
              binLabels={binLabels}
              categories={categories}
            />
          ) : (
            <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
              No distribution data available for the selected time range
            </div>
          )}
        </CardContent>
      </Card>

      {/* Time Series Card (Numeric only) */}
      {dataType === "NUMERIC" && (
        <Card>
          <CardHeader>
            <CardTitle>Trend Over Time</CardTitle>
            <CardDescription>
              Average by {interval}
              {overallAverage > 0 && (
                <> | Overall avg: {overallAverage.toFixed(3)}</>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {timeSeries.length > 0 ? (
              <ScoreTimeSeriesChart
                data={timeSeries}
                scoreName={`${scoreName} (${source})`}
                interval={interval}
                overallAverage={overallAverage}
              />
            ) : (
              <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
                No time series data available for the selected time range
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * Format a bin label for display
 * @param start - Start of the range
 * @param end - End of the range
 * @returns Formatted label string
 */
function formatBinLabel(start: number, end: number): string {
  // Determine precision based on range
  const range = Math.abs(end - start);
  let precision: number;

  if (range >= 1) {
    precision = 1;
  } else if (range >= 0.1) {
    precision = 2;
  } else {
    precision = 3;
  }

  return `[${start.toFixed(precision)}, ${end.toFixed(precision)})`;
}
