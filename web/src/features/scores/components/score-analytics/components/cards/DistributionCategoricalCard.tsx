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
import { ScoreDistributionCategoricalChart } from "../charts/ScoreDistributionCategoricalChart";
import { getScoreCategoryColors } from "../../libs/color-scales";

type DistributionTab = "score1" | "score2" | "all" | "matched";

/**
 * DistributionCategoricalCard - Distribution chart card for CATEGORICAL scores
 *
 * Responsibilities:
 * - Manage tab state (score1/score2/all/matched)
 * - Select appropriate distribution data and categories based on tab
 * - Handle stacked distribution for matched view
 * - Apply per-category color mapping with namespacing
 * - Render ScoreDistributionCategoricalChart directly
 *
 * Key Implementation Details:
 * - score1 tab uses distribution.categories
 * - score2 tab uses distribution.score2Categories
 * - matched tab uses stackedDistributionMatched for stacked bars
 * - all tab shows both distributions side by side
 */
export function DistributionCategoricalCard() {
  const { data, isLoading, params, colorMappings } = useScoreAnalytics();

  const [activeTab, setActiveTab] = useState<DistributionTab>("all");

  // Select distribution data and categories based on active tab
  const chartData = useMemo(() => {
    if (!data) return null;

    const { distribution, metadata, statistics } = data;
    const { mode } = metadata;
    const { score1, score2 } = params;

    if (mode === "single") {
      return {
        distribution1: distribution.score1,
        categories: distribution.categories ?? [],
        stackedDistribution: undefined,
        score2Categories: undefined,
        description: `${statistics.score1.total.toLocaleString()} observations${
          statistics.score1.mode
            ? ` | Most frequent: ${statistics.score1.mode.category} (${statistics.score1.mode.count.toLocaleString()})`
            : ""
        }`,
      };
    }

    // Two score mode - handle tabs
    switch (activeTab) {
      case "score1":
        return {
          distribution1: distribution.score1Individual,
          categories: distribution.categories ?? [],
          stackedDistribution: undefined,
          score2Categories: undefined,
          description: `${score1.name} - ${statistics.score1.total.toLocaleString()} observations`,
        };
      case "score2":
        return {
          distribution1: distribution.score2Individual,
          categories: distribution.score2Categories ?? [],
          stackedDistribution: undefined,
          score2Categories: undefined,
          description: `${score2?.name ?? "Score 2"} - ${statistics.score2?.total.toLocaleString()} observations`,
        };
      case "all":
        return {
          distribution1: undefined, // Not used in stacked mode
          categories: distribution.categories ?? [],
          stackedDistribution: distribution.stackedDistribution, // Use full stacked data (includes __unmatched__)
          score2Categories: distribution.score2Categories ?? [],
          description: `${score1.name} (${statistics.score1.total.toLocaleString()}) vs ${score2?.name} (${statistics.score2?.total.toLocaleString()})`,
        };
      case "matched":
        return {
          distribution1: undefined, // Not used in stacked mode
          categories: distribution.categories ?? [],
          stackedDistribution: distribution.stackedDistributionMatched,
          score2Categories: distribution.score2Categories ?? [],
          description: `${score1.name} vs ${score2?.name} - ${statistics.comparison?.matchedCount.toLocaleString()} matched`,
        };
    }
  }, [data, activeTab, params]);

  // Build color mapping for categorical charts
  const chartColors = useMemo(() => {
    if (!data) return colorMappings;

    const { distribution } = data;

    // Individual tabs - regenerate colors for that specific score
    if (activeTab === "score1") {
      if (distribution.categories) {
        return getScoreCategoryColors(1, distribution.categories);
      }
    }

    if (activeTab === "score2") {
      if (distribution.score2Categories) {
        return getScoreCategoryColors(2, distribution.score2Categories);
      }
    }

    // "all" or "matched" tabs - return full colorMappings with namespaced keys
    return colorMappings;
  }, [activeTab, data, colorMappings]);

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
  if (!data || !chartData) {
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

  const { metadata } = data;
  const { mode } = metadata;
  const { score1, score2 } = params;

  const hasData =
    (chartData.distribution1 && chartData.distribution1.length > 0) ||
    (chartData.stackedDistribution && chartData.stackedDistribution.length > 0);
  const showTabs = mode === "two";

  // Helper function to truncate tab labels with max character limit
  const truncateLabel = (label: string): string => {
    if (label.length <= 10) return label;
    return label.substring(0, 7) + "...";
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
            <div>
              <CardTitle>Distribution</CardTitle>
              <CardDescription>{chartData.description}</CardDescription>
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
          <ScoreDistributionCategoricalChart
            distribution1={chartData.distribution1 ?? []}
            categories={chartData.categories}
            score1Name={
              activeTab === "score2" && score2
                ? score2.name
                : activeTab === "score1"
                  ? score1.name
                  : score1.name
            }
            stackedDistribution={chartData.stackedDistribution}
            score2Categories={chartData.score2Categories}
            score2Name={
              activeTab === "score1" || activeTab === "score2"
                ? undefined
                : mode === "two" && score2
                  ? score2.name
                  : undefined
            }
            score2Source={
              activeTab === "score1" || activeTab === "score2"
                ? undefined
                : mode === "two" && score2
                  ? score2.source
                  : undefined
            }
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
