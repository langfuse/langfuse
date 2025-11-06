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
import { ScoreDistributionChart } from "../charts/ScoreDistributionChart";

type DistributionTab = "score1" | "score2" | "all" | "matched";

/**
 * DistributionChartCard - Smart card component for displaying score distributions
 *
 * Consumes ScoreAnalyticsProvider context and displays:
 * - Distribution histograms/bar charts
 * - Tabs: Individual / Matched / Stacked (modes vary by context)
 * - Auto-selects appropriate chart based on data type
 *
 * Handles:
 * - Loading states
 * - Empty states
 * - Single vs two-score modes
 * - Numeric vs categorical vs boolean data types
 */
export function DistributionChartCard() {
  const { data, isLoading, params, colorMappings, getColorForScore } =
    useScoreAnalytics();

  const [activeTab, setActiveTab] = useState<DistributionTab>("all");

  // Determine which distribution data to show based on tab
  // Note: useMemo must be called before any early returns (React hooks rule)
  const { distribution1Data, distribution2Data, description } = useMemo(() => {
    if (!data) {
      return {
        distribution1Data: [],
        distribution2Data: undefined,
        description: "",
      };
    }

    const { distribution, metadata, statistics } = data;
    const { mode, dataType } = metadata;
    const { score1, score2 } = params;
    const isSingleScore = mode === "single";
    const isNumeric = dataType === "NUMERIC";

    if (isSingleScore) {
      // Single score mode - only show individual distribution
      return {
        distribution1Data: distribution.score1,
        distribution2Data: undefined,
        description: `${statistics.score1.total.toLocaleString()} observations${
          isNumeric && statistics.score1.mean !== null
            ? ` | Average: ${statistics.score1.mean.toFixed(3)}`
            : ""
        }${
          dataType !== "NUMERIC" && statistics.score1.mode
            ? ` | Most frequent: ${statistics.score1.mode.category} (${statistics.score1.mode.count.toLocaleString()})`
            : ""
        }`,
      };
    }

    // Two score mode - handle tabs
    switch (activeTab) {
      case "score1":
        return {
          distribution1Data: distribution.score1Individual,
          distribution2Data: undefined,
          description: `${score1.name} - ${statistics.score1.total.toLocaleString()} observations`,
        };
      case "score2":
        return {
          distribution1Data: distribution.score2Individual,
          distribution2Data: undefined,
          description: `${score2?.name ?? "Score 2"} - ${statistics.score2?.total.toLocaleString()} observations`,
        };
      case "all":
        return {
          distribution1Data: distribution.score1Individual,
          distribution2Data: distribution.score2Individual,
          description: `${score1.name} (${statistics.score1.total.toLocaleString()}) vs ${score2?.name} (${statistics.score2?.total.toLocaleString()})`,
        };
      case "matched":
        return {
          distribution1Data: distribution.score1Matched,
          distribution2Data: distribution.score2Matched,
          description: `${score1.name} vs ${score2?.name} - ${statistics.comparison?.matchedCount.toLocaleString()} matched`,
        };
    }
  }, [data, activeTab, params]);

  // For matched view in categorical mode, use stackedDistribution
  const stackedDistributionData = useMemo(() => {
    if (!data) return undefined;
    const { distribution, metadata } = data;
    const { mode, dataType } = metadata;

    return mode === "two" &&
      dataType === "CATEGORICAL" &&
      activeTab === "matched"
      ? distribution.stackedDistributionMatched
      : undefined;
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
        // Visual slot 1, but score2's color
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
            ? require("@/src/features/scores/lib/color-scales").getScoreCategoryColors(
                1,
                data.distribution.categories,
              )
            : require("@/src/features/scores/lib/color-scales").getScoreBooleanColors(
                1,
              );
        return categoryColors;
      }
      if (activeTab === "score2" && data.distribution.score2Categories) {
        // Regenerate colors for score2 only to avoid collision with score1
        const categoryColors =
          dataType === "CATEGORICAL"
            ? require("@/src/features/scores/lib/color-scales").getScoreCategoryColors(
                2,
                data.distribution.score2Categories,
              )
            : require("@/src/features/scores/lib/color-scales").getScoreBooleanColors(
                2,
              );
        return categoryColors;
      }
    }

    // "all" or "matched" tabs - return full colorMappings with namespaced keys
    return colorMappings;
  }, [activeTab, data, colorMappings, getColorForScore]);

  // Loading state
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Distribution</CardTitle>
          <CardDescription>Loading chart...</CardDescription>
        </CardHeader>
        <CardContent className="flex h-[340px] flex-col items-center justify-center pl-0">
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
          <CardTitle>Distribution</CardTitle>
          <CardDescription>No data available</CardDescription>
        </CardHeader>
        <CardContent className="flex h-[340px] flex-col items-center justify-center pl-0 text-sm text-muted-foreground">
          Select a score to view distribution
        </CardContent>
      </Card>
    );
  }

  const { distribution, metadata } = data;
  const { mode, dataType } = metadata;
  const { score1, score2 } = params;

  const hasData = distribution1Data.length > 0;
  const showTabs = mode === "two";

  // Helper function to truncate tab labels with max character limit
  const truncateLabel = (label: string, maxLength: number = 15): string => {
    if (label.length <= maxLength) return label;
    return label.substring(0, maxLength - 1) + "…";
  };

  // Build full tab labels for title attribute (hover tooltip)
  const score1FullLabel =
    score1.name === score2?.name
      ? `${score1.name} (${score1.source.toLowerCase()})`
      : score1.name;

  const score2FullLabel = score2
    ? score2.name === score1.name
      ? `${score2.name} (${score2.source.toLowerCase()})`
      : score2.name
    : "Score 2";

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>Distribution</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
            {showTabs && (
              <Tabs
                value={activeTab}
                onValueChange={(v) => setActiveTab(v as DistributionTab)}
                className="hidden xl:block"
              >
                <TabsList className="grid w-[400px] grid-cols-4">
                  <TabsTrigger value="score1" title={score1FullLabel}>
                    {truncateLabel(score1FullLabel)}
                  </TabsTrigger>
                  <TabsTrigger value="score2" title={score2FullLabel}>
                    {truncateLabel(score2FullLabel)}
                  </TabsTrigger>
                  <TabsTrigger value="all">all</TabsTrigger>
                  <TabsTrigger value="matched">matched</TabsTrigger>
                </TabsList>
              </Tabs>
            )}
          </div>
          {showTabs && (
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as DistributionTab)}
              className="xl:hidden"
            >
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="score1" title={score1FullLabel}>
                  {truncateLabel(score1FullLabel)}
                </TabsTrigger>
                <TabsTrigger value="score2" title={score2FullLabel}>
                  {truncateLabel(score2FullLabel)}
                </TabsTrigger>
                <TabsTrigger value="all">all</TabsTrigger>
                <TabsTrigger value="matched">matched</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex h-[340px] flex-col pl-0">
        {hasData ? (
          <ScoreDistributionChart
            distribution1={distribution1Data}
            distribution2={
              activeTab === "score1" || activeTab === "score2"
                ? undefined
                : distribution2Data
            }
            dataType={dataType}
            score1Name={
              activeTab === "score2" && score2
                ? score2.name
                : activeTab === "score1"
                  ? score1.name
                  : score1.name
            }
            score2Name={
              activeTab === "score1" || activeTab === "score2"
                ? undefined
                : mode === "two" && score2
                  ? score2.name
                  : undefined
            }
            binLabels={distribution.binLabels}
            categories={distribution.categories}
            stackedDistribution={stackedDistributionData}
            score2Categories={distribution.score2Categories}
            colors={chartColors}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No distribution data available for the selected time range
          </div>
        )}
      </CardContent>
    </Card>
  );
}
