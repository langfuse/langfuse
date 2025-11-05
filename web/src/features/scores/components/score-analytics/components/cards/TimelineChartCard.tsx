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

type TimelineTab = "all" | "matched";

/**
 * TimelineChartCard - Smart card component for displaying score trends over time
 *
 * Consumes ScoreAnalyticsProvider context and displays:
 * - Time series line/area charts
 * - Tabs: All / Matched (two-score mode only)
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

  const { timeSeries, metadata } = data;
  const { mode, dataType } = metadata;
  const { score1, score2, interval } = params;

  // Determine which data to show based on active tab
  const chartData =
    dataType === "NUMERIC"
      ? ((activeTab === "all"
          ? timeSeries.numeric.all
          : timeSeries.numeric.matched) as Array<{
          timestamp: Date;
          avg1: number | null;
          avg2: number | null;
          count: number;
        }>)
      : ((activeTab === "all"
          ? timeSeries.categorical.score1
          : timeSeries.categorical.score1Matched) as Array<{
          timestamp: Date;
          category: string;
          count: number;
        }>);

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
              <TabsList className="grid w-[200px] grid-cols-2">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="matched">Matched</TabsTrigger>
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
            score1Name={`${score1.name} (${score1.source})`}
            score2Name={
              mode === "two" && score2
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
