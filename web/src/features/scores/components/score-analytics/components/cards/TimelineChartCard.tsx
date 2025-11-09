import { useState, useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { Loader2 } from "lucide-react";
import { useScoreAnalytics } from "../ScoreAnalyticsProvider";
import { ScoreTimeSeriesChart } from "../charts/ScoreTimeSeriesChart";
import { SamplingDetailsHoverCard } from "../ScoreAnalyticsNoticeBanner";
import {
  getScoreCategoryColors,
  getScoreBooleanColors,
} from "@/src/features/scores/components/score-analytics/libs/color-scales";

type TimelineTab = "score1" | "score2" | "all" | "matched";

/**
 * TimelineChartCard - Smart card component for displaying score trends over time
 *
 * Consumes ScoreAnalyticsProvider context and displays:
 * - Time series line/area charts
 * - Tabs: Score 1 / Score 2 / All / Matched (two-score mode only)
 * - Auto-selects appropriate chart based on data type
 *
 * Handles:
 * - Loading states
 * - Empty states
 * - Single vs two-score modes
 * - Numeric vs categorical data types
 */
export function TimelineChartCard() {
  const { data, isLoading, params, colorMappings, getColorForScore } =
    useScoreAnalytics();
  const [activeTab, setActiveTab] = useState<TimelineTab>("all");

  // Calculate overall average for numeric data (for description)
  // Note: useMemo must be called before any early returns (React hooks rule)
  const overallAverage = useMemo(() => {
    if (!data || data.metadata.dataType !== "NUMERIC") return null;

    const timeSeries = data.timeSeries.numeric.all;
    if (timeSeries.length === 0) return 0;

    const validValues = timeSeries
      .map((t) => t.avg1)
      .filter((v): v is number => v !== null);
    if (validValues.length === 0) return 0;

    return validValues.reduce((sum, v) => sum + v, 0) / validValues.length;
  }, [data]);

  // Determine which data to show based on active tab
  // Note: useMemo must be called before any early returns (React hooks rule)
  const chartData = useMemo<
    | Array<{
        timestamp: Date;
        avg1: number | null;
        avg2: number | null;
        count: number;
      }>
    | Array<{
        timestamp: Date;
        category: string;
        count: number;
      }>
  >(() => {
    if (!data) return [];

    const { timeSeries, metadata } = data;
    const { dataType } = metadata;

    if (dataType !== "NUMERIC") {
      // Categorical logic: Use merged "all" and "allMatched" data with namespaced categories
      return activeTab === "score1"
        ? timeSeries.categorical.score1
        : activeTab === "score2"
          ? timeSeries.categorical.score2
          : activeTab === "all"
            ? timeSeries.categorical.all // Merged score1+score2 with namespaced categories
            : timeSeries.categorical.allMatched; // Merged matched data with namespaced categories
    }

    // Numeric: Transform data based on active tab
    const sourceData =
      activeTab === "matched"
        ? timeSeries.numeric.matched
        : timeSeries.numeric.all;

    if (activeTab === "score1") {
      // Return only score1 data (avg1)
      return sourceData.map((item) => ({
        timestamp: item.timestamp,
        avg1: item.avg1 as number | null,
        avg2: null as number | null, // Explicitly null to show single line
        count: item.count as number,
      }));
    }

    if (activeTab === "score2") {
      // Return only score2 data, but map avg2 → avg1 for chart rendering
      return sourceData.map((item) => ({
        timestamp: item.timestamp,
        avg1: item.avg2 as number | null, // Map score2 data to avg1 field
        avg2: null as number | null, // Explicitly null to show single line
        count: item.count as number,
      }));
    }

    // "all" or "matched" tabs: return both scores
    return sourceData as Array<{
      timestamp: Date;
      avg1: number | null;
      avg2: number | null;
      count: number;
    }>;
  }, [data, activeTab]);

  // Derive colors based on active tab and data type
  // Note: useMemo must be called before any early returns (React hooks rule)
  const chartColors = useMemo(() => {
    if (!data) return colorMappings;

    const { dataType } = data.metadata;

    // Numeric charts
    if (dataType === "NUMERIC") {
      if (activeTab === "score1") {
        // Visual slot 1, but score1's color
        return { score1: getColorForScore(1) };
      }
      if (activeTab === "score2") {
        // Visual slot 1, but score2's color (this is the key!)
        return { score1: getColorForScore(2) };
      }
      // "all" or "matched" tabs
      return {
        score1: getColorForScore(1),
        score2: getColorForScore(2),
      };
    }

    // Categorical/Boolean charts on individual tabs - regenerate colors for that specific score
    if (dataType === "CATEGORICAL" || dataType === "BOOLEAN") {
      if (activeTab === "score1" && data.distribution.categories) {
        // Regenerate colors for score1 only to avoid collision with score2
        const categoryColors =
          dataType === "CATEGORICAL"
            ? getScoreCategoryColors(1, data.distribution.categories)
            : getScoreBooleanColors(1);
        return categoryColors;
      }
      if (activeTab === "score2" && data.distribution.score2Categories) {
        // Regenerate colors for score2 only to avoid collision with score1
        const categoryColors =
          dataType === "CATEGORICAL"
            ? getScoreCategoryColors(2, data.distribution.score2Categories)
            : getScoreBooleanColors(2);
        return categoryColors;
      }
    }

    // "all" or "matched" tabs - return full colorMappings with namespaced keys
    return colorMappings;
  }, [activeTab, data, colorMappings, getColorForScore]);

  // Build description
  // Note: useMemo must be called before any early returns (React hooks rule)
  const description = useMemo(() => {
    if (!data) return "";

    const { metadata, statistics } = data;
    const { mode, dataType } = metadata;
    const { interval } = params;
    const parts: string[] = [];

    // Interval description
    parts.push(
      `${dataType === "NUMERIC" ? "Average" : "Count"} by ${interval.count} ${interval.unit}${interval.count > 1 ? "s" : ""}`,
    );

    // Overall average for numeric
    if (
      dataType === "NUMERIC" &&
      overallAverage !== null &&
      overallAverage > 0
    ) {
      parts.push(`Overall avg: ${overallAverage.toFixed(3)}`);
    }

    // Matched count for two-score mode
    if (mode === "two" && statistics.comparison) {
      if (activeTab === "matched") {
        parts.push(
          `${statistics.comparison.matchedCount.toLocaleString()} matched`,
        );
      }
    }

    return parts.join(" | ");
  }, [data, overallAverage, activeTab, params]);

  // Loading state
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Trend Over Time</CardTitle>
          <CardDescription>Loading chart...</CardDescription>
        </CardHeader>
        <CardContent className="flex h-[340px] grow items-center justify-center">
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
          <CardTitle>Trend Over Time</CardTitle>
          <CardDescription>No data available</CardDescription>
        </CardHeader>
        <CardContent className="flex h-[340px] items-center justify-center text-sm text-muted-foreground">
          Select a score to view trends
        </CardContent>
      </Card>
    );
  }

  const { metadata } = data;
  const { mode, dataType } = metadata;
  const { score1, score2, interval, fromTimestamp, toTimestamp } = params;

  // Construct TimeRange from params timestamps
  const timeRange = {
    from: fromTimestamp,
    to: toTimestamp,
  };

  const hasData = chartData.length > 0;
  const showTabs = mode === "two";

  // Helper function to truncate tab labels with max character limit
  const truncateLabel = (label: string): string => {
    if (label.length <= 20) return label;
    return label.substring(0, 17) + "...";
  };

  // Build full tab labels for title attribute (hover tooltip)
  const score1FullLabel =
    score1.name === score2?.name
      ? `${score1.source} · ${score1.name}`
      : score1.name;

  const score2FullLabel = score2
    ? score2.name === score1.name
      ? `${score2.source} · ${score2.name}`
      : score2.name
    : "Score 2";

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="flex items-center gap-2">
                Trend Over Time
                {data.samplingMetadata.isSampled && (
                  <SamplingDetailsHoverCard
                    samplingMetadata={data.samplingMetadata}
                    showLabel
                  />
                )}
              </CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
          </div>
          {showTabs && (
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as TimelineTab)}
            >
              <TabsList className="h-7">
                <TabsTrigger
                  value="score1"
                  title={score1FullLabel}
                  className="h-5 px-2 text-xs"
                >
                  {truncateLabel(score1FullLabel)}
                </TabsTrigger>
                <TabsTrigger
                  value="score2"
                  title={score2FullLabel}
                  className="h-5 px-2 text-xs"
                >
                  {truncateLabel(score2FullLabel)}
                </TabsTrigger>
                <TabsTrigger value="all" className="h-5 px-2 text-xs">
                  all
                </TabsTrigger>
                <TabsTrigger value="matched" className="h-5 px-2 text-xs">
                  matched
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex h-[340px] flex-col pl-1">
        {hasData ? (
          <ScoreTimeSeriesChart
            data={chartData}
            dataType={dataType}
            score1Name={
              activeTab === "score1"
                ? `${score1.name} (${score1.source})`
                : activeTab === "score2" && score2
                  ? `${score2.name} (${score2.source})`
                  : `${score1.name} (${score1.source})`
            }
            score2Name={
              activeTab === "score1" || activeTab === "score2"
                ? undefined
                : mode === "two" && score2
                  ? `${score2.name} (${score2.source})`
                  : undefined
            }
            interval={interval}
            timeRange={timeRange}
            colors={chartColors}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No time series data available for the selected time range
          </div>
        )}
      </CardContent>
    </Card>
  );
}
