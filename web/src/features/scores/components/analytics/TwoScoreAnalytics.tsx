import { useMemo, useState } from "react";
import { type RouterOutputs } from "@/src/utils/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { ScoreDistributionChart } from "./ScoreDistributionChart";
import { ScoreTimeSeriesChart } from "./ScoreTimeSeriesChart";
import {
  fillTimeSeriesGaps,
  type IntervalConfig,
} from "@/src/utils/date-range-utils";
import { fillCategoricalTimeSeriesGaps } from "@/src/utils/fill-time-series-gaps";

interface TwoScoreAnalyticsProps {
  score1: {
    name: string;
    dataType: "NUMERIC" | "CATEGORICAL" | "BOOLEAN";
    source: string;
  };
  score2: {
    name: string;
    dataType: "NUMERIC" | "CATEGORICAL" | "BOOLEAN";
    source: string;
  };
  analytics: RouterOutputs["scores"]["getScoreComparisonAnalytics"];
  interval: IntervalConfig;
  nBins: number;
  fromDate: Date;
  toDate: Date;
}

type ChartTab = "score1" | "score2" | "both" | "matched";

export function TwoScoreAnalytics({
  score1,
  score2,
  analytics,
  interval,
  nBins,
  fromDate,
  toDate,
}: TwoScoreAnalyticsProps) {
  // Local state for per-chart tab selection
  const [distributionTab, setDistributionTab] = useState<ChartTab>("both");
  const [timeSeriesTab, setTimeSeriesTab] = useState<ChartTab>("both");

  // Detect single-score mode (comparing same score to itself)
  // Backend returns empty data for score2 in this case to save query costs
  const isSingleScore =
    score1.name === score2.name &&
    score1.source === score2.source &&
    score1.dataType === score2.dataType;

  // Detect cross-type comparison (treat as categorical)
  const isCrossType = score1.dataType !== score2.dataType;
  const isBothNumeric =
    score1.dataType === "NUMERIC" && score2.dataType === "NUMERIC";

  // Check if stacked distribution is available (categorical comparison)
  const hasStackedDistribution =
    analytics.stackedDistribution && analytics.stackedDistribution.length > 0;

  // Extract categories for categorical/boolean/cross-type scores
  const categories = useMemo(() => {
    console.log("[TwoScoreAnalytics] Category extraction:", {
      score1DataType: score1.dataType,
      score2DataType: score2.dataType,
      isCrossType,
      isBothNumeric,
      hasStackedDistribution,
      stackedDistributionLength: analytics.stackedDistribution?.length ?? 0,
      confusionMatrixLength: analytics.confusionMatrix?.length ?? 0,
    });

    // Only treat as numeric if BOTH scores are numeric (no cross-type)
    if (isBothNumeric) return undefined;

    // For categorical scores with stacked distribution, extract from stackedDistribution
    if (hasStackedDistribution) {
      const uniqueCategories = new Set<string>();
      analytics.stackedDistribution!.forEach((item) => {
        uniqueCategories.add(item.score1Category);
      });
      const result = Array.from(uniqueCategories).sort();
      console.log(
        "[TwoScoreAnalytics] Categories from stackedDistribution:",
        result,
      );
      return result;
    }

    // Fallback: Try confusionMatrix (for backward compatibility or boolean scores)
    if (analytics.confusionMatrix.length > 0) {
      const uniqueCategories = new Set<string>();
      analytics.confusionMatrix.forEach((row) => {
        uniqueCategories.add(row.rowCategory);
      });
      const result = Array.from(uniqueCategories).sort();
      console.log(
        "[TwoScoreAnalytics] Categories from confusionMatrix:",
        result,
      );
      return result;
    }

    // For boolean: assume alphabetical order ["False", "True"]
    if (score1.dataType === "BOOLEAN") {
      console.log("[TwoScoreAnalytics] Categories for boolean (hardcoded)");
      return ["False", "True"];
    }

    // For categorical: we can't reliably determine category names without stackedDistribution or confusionMatrix
    // The distribution only has binIndex, not actual category strings
    console.log("[TwoScoreAnalytics] No categories found, returning undefined");
    return undefined;
  }, [
    score1.dataType,
    score2.dataType,
    isBothNumeric,
    isCrossType,
    analytics.confusionMatrix,
    hasStackedDistribution,
    analytics.stackedDistribution,
  ]);

  // Choose datasets based on distribution tab selection
  const rawDistribution1 =
    distributionTab === "matched"
      ? analytics.distribution1Matched
      : distributionTab === "score1"
        ? analytics.distribution1Individual
        : analytics.distribution1;
  const rawDistribution2 =
    distributionTab === "matched"
      ? isSingleScore
        ? analytics.distribution1Matched // Use score1 matched data when comparing same score
        : analytics.distribution2Matched
      : distributionTab === "score2"
        ? isSingleScore
          ? analytics.distribution1Individual // Use score1 individual data when comparing same score
          : analytics.distribution2Individual
        : isSingleScore
          ? analytics.distribution1 // Use score1 data when comparing same score
          : analytics.distribution2;

  // Fill missing bins for categorical/boolean/cross-type data
  const distribution1 = useMemo(() => {
    const raw = rawDistribution1;

    if (isBothNumeric || !categories) {
      return raw;
    }

    const binMap = new Map(raw.map((item) => [item.binIndex, item.count]));
    return categories.map((_, index) => ({
      binIndex: index,
      count: binMap.get(index) ?? 0,
    }));
  }, [rawDistribution1, isBothNumeric, categories]);

  const distribution2 = useMemo(() => {
    const raw = rawDistribution2;

    if (isBothNumeric || !categories) {
      return raw;
    }

    const binMap = new Map(raw.map((item) => [item.binIndex, item.count]));
    return categories.map((_, index) => ({
      binIndex: index,
      count: binMap.get(index) ?? 0,
    }));
  }, [rawDistribution2, isBothNumeric, categories]);

  // Generate bin labels for numeric scores based on tab selection
  const binLabels = useMemo(() => {
    if (!isBothNumeric || !analytics.statistics) return undefined;

    const heatmapRow = analytics.heatmap[0];
    if (!heatmapRow) return undefined;

    // Choose bounds based on selected tab:
    // - "score1" tab: use individual bounds for score1 (min1/max1)
    // - "score2" tab: use individual bounds for score2 (min2/max2)
    // - "both" or "matched" tabs: use global bounds (globalMin/globalMax)
    let min: number, max: number;

    if (distributionTab === "score1") {
      min = heatmapRow.min1;
      max = heatmapRow.max1;
    } else if (distributionTab === "score2") {
      min = heatmapRow.min2;
      max = heatmapRow.max2;
    } else {
      min = heatmapRow.globalMin;
      max = heatmapRow.globalMax;
    }

    const binWidth = (max - min) / nBins;

    return Array.from({ length: nBins }, (_, i) => {
      const start = min + i * binWidth;
      const end = min + (i + 1) * binWidth;
      return formatBinLabel(start, end);
    });
  }, [
    isBothNumeric,
    analytics.heatmap,
    analytics.statistics,
    nBins,
    distributionTab,
  ]);

  const totalCount1 = analytics.counts.score1Total;
  const totalCount2 = analytics.counts.score2Total;
  const matchedCount = analytics.counts.matchedCount;

  // Fill gaps in time series to ensure all intervals are displayed
  // For NUMERIC scores
  const rawTimeSeries = useMemo(() => {
    let data =
      timeSeriesTab === "matched"
        ? analytics.timeSeriesMatched
        : analytics.timeSeries;

    // In single-score mode, backend returns empty data for score2
    // Duplicate score1 data to show both lines with identical values
    if (isSingleScore && isBothNumeric) {
      data = data.map((item) => ({
        ...item,
        avg2: item.avg1, // Use score1 data for score2
        count2: item.count1,
      }));
    }

    return data;
  }, [
    timeSeriesTab,
    analytics.timeSeriesMatched,
    analytics.timeSeries,
    isSingleScore,
    isBothNumeric,
  ]);

  console.log("rawTimeSeries", rawTimeSeries);

  const timeSeries = useMemo(() => {
    console.log(
      "fillTimeSeriesGaps",
      rawTimeSeries,
      fromDate,
      toDate,
      interval,
    );
    const filledTimeSeries = fillTimeSeriesGaps(
      rawTimeSeries,
      fromDate,
      toDate,
      interval,
    );
    console.log("filledTimeSeries", filledTimeSeries);
    return filledTimeSeries;
  }, [rawTimeSeries, fromDate, toDate, interval]);

  // For CATEGORICAL/BOOLEAN scores - select appropriate data based on tab and apply gap-filling
  const categoricalTimeSeriesData = useMemo(() => {
    let rawData: typeof analytics.timeSeriesCategorical1 = [];

    switch (timeSeriesTab) {
      case "score1":
        rawData = analytics.timeSeriesCategorical1;
        break;
      case "score2":
        // Use score1 data when comparing same score (backend returns empty for score2)
        rawData = isSingleScore
          ? analytics.timeSeriesCategorical1
          : analytics.timeSeriesCategorical2;
        break;
      case "both":
        // Combine both scores' categorical data, prefixing categories to distinguish scores
        if (isSingleScore) {
          // When comparing same score, duplicate score1 data with different prefixes
          rawData = [
            ...analytics.timeSeriesCategorical1.map((d) => ({
              ...d,
              category: `${score1.name}-${d.category}`,
            })),
            ...analytics.timeSeriesCategorical1.map((d) => ({
              ...d,
              category: `${score2.name}-${d.category}`,
            })),
          ];
        } else {
          rawData = [
            ...analytics.timeSeriesCategorical1.map((d) => ({
              ...d,
              category: `${score1.name}-${d.category}`,
            })),
            ...analytics.timeSeriesCategorical2.map((d) => ({
              ...d,
              category: `${score2.name}-${d.category}`,
            })),
          ];
        }
        break;
      case "matched":
        // Combine both matched scores' categorical data, prefixing categories
        if (isSingleScore) {
          // When comparing same score, duplicate score1 matched data with different prefixes
          rawData = [
            ...analytics.timeSeriesCategorical1Matched.map((d) => ({
              ...d,
              category: `${score1.name}-${d.category}`,
            })),
            ...analytics.timeSeriesCategorical1Matched.map((d) => ({
              ...d,
              category: `${score2.name}-${d.category}`,
            })),
          ];
        } else {
          rawData = [
            ...analytics.timeSeriesCategorical1Matched.map((d) => ({
              ...d,
              category: `${score1.name}-${d.category}`,
            })),
            ...analytics.timeSeriesCategorical2Matched.map((d) => ({
              ...d,
              category: `${score2.name}-${d.category}`,
            })),
          ];
        }
        break;
    }

    // Apply gap filling to ensure all intervals are displayed with proper aggregation
    return fillCategoricalTimeSeriesGaps(rawData, fromDate, toDate, interval);
  }, [
    timeSeriesTab,
    analytics,
    fromDate,
    toDate,
    interval,
    score1,
    score2,
    isSingleScore,
  ]);

  // Calculate overall averages from time series
  const overallAverage1 = useMemo(() => {
    if (timeSeries.length === 0) return 0;
    const validValues = timeSeries
      .map((t) => t.avg1)
      .filter((v): v is number => v !== null);
    if (validValues.length === 0) return 0;
    return validValues.reduce((sum, v) => sum + v, 0) / validValues.length;
  }, [timeSeries]);

  const overallAverage2 = useMemo(() => {
    if (timeSeries.length === 0) return 0;
    const validValues = timeSeries
      .map((t) => t.avg2)
      .filter((v): v is number => v !== null);
    if (validValues.length === 0) return 0;
    return validValues.reduce((sum, v) => sum + v, 0) / validValues.length;
  }, [timeSeries]);

  // Check if comparing the same score (would cause duplicate keys in chart data)
  const isSameScore =
    score1.name === score2.name && score1.source === score2.source;

  // Add suffixes to differentiate when comparing same score
  const score1DisplayName = isSameScore
    ? `${score1.name} (${score1.source}) - Set 1`
    : `${score1.name} (${score1.source})`;

  const score2DisplayName = isSameScore
    ? `${score2.name} (${score2.source}) - Set 2`
    : `${score2.name} (${score2.source})`;

  // Get display data and configuration based on tabs
  const getDistributionDisplayData = () => {
    const isMatched = distributionTab === "matched";

    switch (distributionTab) {
      case "score1":
        return {
          count1: isMatched ? matchedCount : totalCount1,
          count2: isMatched ? matchedCount : totalCount1,
          isMatched,
          showScore1: true,
          showScore2: false,
        };
      case "score2":
        return {
          count1: isMatched ? matchedCount : totalCount2,
          count2: isMatched ? matchedCount : totalCount2,
          isMatched,
          showScore1: false,
          showScore2: true,
        };
      case "both":
      case "matched":
      default:
        return {
          count1: isMatched ? matchedCount : totalCount1,
          count2: isMatched ? matchedCount : totalCount2,
          isMatched,
          showScore1: true,
          showScore2: true,
        };
    }
  };

  const getTimeSeriesDisplayData = () => {
    const isMatched = timeSeriesTab === "matched";

    switch (timeSeriesTab) {
      case "score1":
        return {
          isMatched,
          showScore1: true,
          showScore2: false,
        };
      case "score2":
        return {
          isMatched,
          showScore1: false,
          showScore2: true,
        };
      case "both":
      case "matched":
      default:
        return {
          isMatched,
          showScore1: true,
          showScore2: true,
        };
    }
  };

  const distDisplayData = getDistributionDisplayData();
  const tsDisplayData = getTimeSeriesDisplayData();

  // Prepare time series data based on tab selection
  const timeSeriesData = useMemo(() => {
    if (timeSeriesTab === "score2") {
      if (isSingleScore && isBothNumeric) {
        // In single-score mode, score2 shows the same data as score1
        // We've already duplicated avg1 to avg2 above, so just use timeSeries as-is
        // But swap to show score2 in primary position
        return timeSeries.map((item) => ({
          ...item,
          avg1: item.avg2,
          avg2: item.avg1,
          count1: item.count2,
          count2: item.count1,
        }));
      }
      // Normal mode: Swap avg1 and avg2 when showing only score2
      return timeSeries.map((item) => ({
        ...item,
        avg1: item.avg2,
        avg2: item.avg1,
      }));
    }
    return timeSeries;
  }, [timeSeries, timeSeriesTab, isSingleScore, isBothNumeric]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Distribution Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>Distribution Comparison</CardTitle>
              <CardDescription>
                {score1.name} ({distDisplayData.count1.toLocaleString()}) vs{" "}
                {score2.name} ({distDisplayData.count2.toLocaleString()})
                {distDisplayData.isMatched && " - Matched scores only"}
              </CardDescription>
            </div>
            <Tabs
              value={distributionTab}
              onValueChange={(value) => setDistributionTab(value as ChartTab)}
            >
              <TabsList>
                <TabsTrigger value="score1">{score1.name}</TabsTrigger>
                <TabsTrigger value="score2">{score2.name}</TabsTrigger>
                <TabsTrigger value="both">Both</TabsTrigger>
                <TabsTrigger value="matched">Matched</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent className="h-[300px]">
          {distribution1.length > 0 ? (
            !categories && score1.dataType === "CATEGORICAL" ? (
              <div className="flex h-[200px] items-center justify-center text-center text-sm text-muted-foreground">
                <div className="max-w-md">
                  <p className="font-medium">
                    Cannot display categorical comparison
                  </p>
                  <p className="mt-2">
                    Categorical score comparison requires overlapping data to
                    determine category names. No matching traces/observations
                    found between these two scores.
                  </p>
                </div>
              </div>
            ) : (
              <ScoreDistributionChart
                distribution1={
                  distributionTab === "score2" ? distribution2 : distribution1
                }
                distribution2={
                  distDisplayData.showScore1 && distDisplayData.showScore2
                    ? distribution2
                    : undefined
                }
                dataType={isBothNumeric ? "NUMERIC" : score1.dataType}
                score1Name={
                  distributionTab === "score2"
                    ? score2DisplayName
                    : score1DisplayName
                }
                score2Name={
                  distDisplayData.showScore1 && distDisplayData.showScore2
                    ? distributionTab === "score2"
                      ? score1DisplayName
                      : score2DisplayName
                    : undefined
                }
                binLabels={binLabels}
                categories={categories}
                stackedDistribution={
                  distDisplayData.showScore1 && distDisplayData.showScore2
                    ? distributionTab === "matched"
                      ? analytics.stackedDistributionMatched
                      : analytics.stackedDistribution
                    : undefined
                }
                score2Categories={
                  distDisplayData.showScore1 && distDisplayData.showScore2
                    ? analytics.score2Categories
                    : undefined
                }
              />
            )
          ) : (
            <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
              No distribution data available for the selected time range
            </div>
          )}
        </CardContent>
      </Card>

      {/* Time Series Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>Scores Over Time</CardTitle>
              <CardDescription>
                {isBothNumeric ? (
                  <>
                    Average by {interval.count} {interval.unit}
                    {interval.count > 1 && "s"}
                    {overallAverage1 > 0 && (
                      <>
                        {" "}
                        | {score1.name} avg: {overallAverage1.toFixed(3)}
                      </>
                    )}
                    {overallAverage2 > 0 && (
                      <>
                        {" "}
                        | {score2.name} avg: {overallAverage2.toFixed(3)}
                      </>
                    )}
                  </>
                ) : (
                  <>
                    Count by {interval.count} {interval.unit}
                    {interval.count > 1 && "s"}
                  </>
                )}
                {tsDisplayData.isMatched && " | Matched scores only"}
              </CardDescription>
            </div>
            <Tabs
              value={timeSeriesTab}
              onValueChange={(value) => {
                console.log("timeSeriesTab.onValueChange", value);
                setTimeSeriesTab(value as ChartTab);
              }}
            >
              <TabsList>
                <TabsTrigger value="score1">{score1.name}</TabsTrigger>
                <TabsTrigger value="score2">{score2.name}</TabsTrigger>
                <TabsTrigger value="both">Both</TabsTrigger>
                <TabsTrigger value="matched">Matched</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent className="h-[300px]">
          {isBothNumeric ? (
            timeSeriesData.length > 0 ? (
              <ScoreTimeSeriesChart
                data={timeSeriesData}
                dataType="NUMERIC"
                score1Name={
                  timeSeriesTab === "score2"
                    ? score2DisplayName
                    : score1DisplayName
                }
                score2Name={
                  tsDisplayData.showScore1 && tsDisplayData.showScore2
                    ? timeSeriesTab === "score2"
                      ? score1DisplayName
                      : score2DisplayName
                    : undefined
                }
                interval={interval}
              />
            ) : (
              <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
                No time series data available for the selected time range
              </div>
            )
          ) : categoricalTimeSeriesData.length > 0 ? (
            <ScoreTimeSeriesChart
              data={categoricalTimeSeriesData}
              dataType={score1.dataType}
              score1Name={
                timeSeriesTab === "score2"
                  ? score2DisplayName
                  : score1DisplayName
              }
              score2Name={
                tsDisplayData.showScore1 && tsDisplayData.showScore2
                  ? timeSeriesTab === "score2"
                    ? score1DisplayName
                    : score2DisplayName
                  : undefined
              }
              interval={interval}
            />
          ) : (
            <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
              No time series data available for the selected time range
            </div>
          )}
        </CardContent>
      </Card>
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
