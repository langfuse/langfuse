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
import {
  fillTimeSeriesGaps,
  type IntervalConfig,
} from "@/src/utils/date-range-utils";
import { fillCategoricalTimeSeriesGaps } from "@/src/utils/fill-time-series-gaps";

interface SingleScoreAnalyticsProps {
  scoreId: string;
  scoreName: string;
  dataType: "NUMERIC" | "CATEGORICAL" | "BOOLEAN";
  source: string;
  analytics: RouterOutputs["scores"]["getScoreComparisonAnalytics"];
  interval: IntervalConfig;
  nBins: number;
  fromDate: Date;
  toDate: Date;
  cardToRender?: "distribution" | "timeline" | "both";
}

export function SingleScoreAnalytics({
  scoreName,
  dataType,
  source,
  analytics,
  interval,
  nBins,
  fromDate,
  toDate,
  cardToRender = "both",
}: SingleScoreAnalyticsProps) {
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

  // Fill missing bins for categorical/boolean data
  // Backend only returns bins with data, but we want to show all categories
  const distribution = useMemo(() => {
    const rawDistribution = analytics.distribution1;

    if (dataType === "NUMERIC" || !categories) {
      return rawDistribution;
    }

    // Create a map of existing bins
    const binMap = new Map(
      rawDistribution.map((item) => [item.binIndex, item.count]),
    );

    // Fill in zeros for missing categories
    return categories.map((_, index) => ({
      binIndex: index,
      count: binMap.get(index) ?? 0,
    }));
  }, [analytics.distribution1, dataType, categories]);

  const totalCount = analytics.counts.score1Total;

  // Fill gaps in time series to ensure all intervals are displayed
  const timeSeries = useMemo(() => {
    return fillTimeSeriesGaps(analytics.timeSeries, fromDate, toDate, interval);
  }, [analytics.timeSeries, fromDate, toDate, interval]);

  // For categorical/boolean scores, use categorical time series data
  // For boolean scores, prefix categories with score name to ensure consistent rendering
  const categoricalTimeSeries = useMemo(() => {
    if (dataType === "NUMERIC") return [];

    const filledData = fillCategoricalTimeSeriesGaps(
      analytics.timeSeriesCategorical1,
      fromDate,
      toDate,
      interval,
    );

    // For boolean scores, prefix categories with score name
    // This ensures consistent rendering with the BooleanTimeSeriesChart
    if (dataType === "BOOLEAN") {
      return filledData.map((item) => ({
        ...item,
        category: `${scoreName}-${item.category}`,
      }));
    }

    return filledData;
  }, [
    dataType,
    scoreName,
    analytics.timeSeriesCategorical1,
    fromDate,
    toDate,
    interval,
  ]);

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

  // Calculate overall average from time series
  const overallAverage = useMemo(() => {
    if (timeSeries.length === 0) return 0;
    const validValues = timeSeries
      .map((t) => t.avg1)
      .filter((v): v is number => v !== null);
    if (validValues.length === 0) return 0;
    return validValues.reduce((sum, v) => sum + v, 0) / validValues.length;
  }, [timeSeries]);

  // Distribution Card
  const distributionCard = (
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
      <CardContent className="h-[300px]">
        {distribution.length > 0 ? (
          <ScoreDistributionChart
            distribution1={distribution}
            dataType={dataType}
            score1Name={scoreName}
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
  );

  // Time Series Card
  const timelineCard = (
    <Card>
      <CardHeader>
        <CardTitle>Trend Over Time</CardTitle>
        <CardDescription>
          {dataType === "NUMERIC" ? (
            <>
              Average by {interval.count} {interval.unit}
              {interval.count > 1 && "s"}
              {overallAverage > 0 && (
                <> | Overall avg: {overallAverage.toFixed(3)}</>
              )}
            </>
          ) : (
            <>
              Count by {interval.count} {interval.unit}
              {interval.count > 1 && "s"}
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="h-[300px]">
        {dataType === "NUMERIC" ? (
          timeSeries.length > 0 ? (
            <ScoreTimeSeriesChart
              data={timeSeries}
              dataType={dataType}
              score1Name={`${scoreName} (${source})`}
              interval={interval}
            />
          ) : (
            <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
              No time series data available for the selected time range
            </div>
          )
        ) : categoricalTimeSeries.length > 0 ? (
          <ScoreTimeSeriesChart
            data={categoricalTimeSeries}
            dataType={dataType}
            score1Name={`${scoreName} (${source})`}
            interval={interval}
          />
        ) : (
          <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
            No time series data available for the selected time range
          </div>
        )}
      </CardContent>
    </Card>
  );

  // Return based on cardToRender prop
  if (cardToRender === "distribution") {
    return distributionCard;
  } else if (cardToRender === "timeline") {
    return timelineCard;
  }

  // Default: render both cards in grid
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {distributionCard}
      {timelineCard}
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
