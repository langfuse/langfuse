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
import { ScoreTimeSeriesChart } from "@/src/features/scores/components/analytics/ScoreTimeSeriesChart";

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
  const { data, isLoading, params } = useScoreAnalytics();
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
      // Categorical logic (unchanged)
      return activeTab === "score1"
        ? timeSeries.categorical.score1
        : activeTab === "score2"
          ? timeSeries.categorical.score2
          : activeTab === "all"
            ? timeSeries.categorical.score1
            : timeSeries.categorical.score1Matched;
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
          <CardTitle>Trend Over Time</CardTitle>
          <CardDescription>No data available</CardDescription>
        </CardHeader>
        <CardContent className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
          Select a score to view trends
        </CardContent>
      </Card>
    );
  }

  const { metadata } = data;
  const { mode, dataType } = metadata;
  const { score1, score2, interval } = params;

  const hasData = chartData.length > 0;
  const showTabs = mode === "two";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Trend Over Time</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          {showTabs && (
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as TimelineTab)}
            >
              <TabsList className="grid w-[400px] grid-cols-4">
                <TabsTrigger value="score1">
                  {score1.name === score2?.name
                    ? `${score1.name} (${score1.source.toLowerCase()})`
                    : score1.name}
                </TabsTrigger>
                <TabsTrigger value="score2">
                  {score2
                    ? score2.name === score1.name
                      ? `${score2.name} (${score2.source.toLowerCase()})`
                      : score2.name
                    : "Score 2"}
                </TabsTrigger>
                <TabsTrigger value="all">all</TabsTrigger>
                <TabsTrigger value="matched">matched</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </div>
      </CardHeader>
      <CardContent className="h-[300px]">
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
