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
import { getScoreCategoryColors } from "../../lib/color-scales";
import { SamplingDetailsHoverCard } from "../SamplingDetailsHoverCard";

type DistributionTab = "score1" | "score2" | "all" | "matched";

/**
 * Calculate score2 items that have no matching score1 items
 * by comparing total score2Individual counts vs matched counts in stackedDistribution
 */
function calculateUnmatchedScore2Distribution(
  score2Individual: Array<{ binIndex: number; count: number }>,
  stackedDistribution: Array<{
    score1Category: string;
    score2Stack: string;
    count: number;
  }>,
  score2Categories: string[],
): Array<{
  score1Category: string;
  score2Stack: string;
  count: number;
}> {
  // Helper to check if a key represents an unmatched category
  const isUnmatchedKey = (key: string): boolean => {
    return (
      key === "__unmatched__" || key === "0" || key === "" || key === "null"
    );
  };

  // Build total counts map from score2Individual
  const totalCountsMap = new Map<string, number>();
  score2Individual.forEach((item) => {
    // Bounds check
    if (item.binIndex >= 0 && item.binIndex < score2Categories.length) {
      const category = score2Categories[item.binIndex];
      if (category) {
        totalCountsMap.set(category, item.count);
      }
    }
  });

  // Build matched counts map, excluding already-unmatched items
  const matchedCountsMap = new Map<string, number>();
  stackedDistribution.forEach((item) => {
    // Skip existing unmatched markers
    if (
      !isUnmatchedKey(item.score2Stack) &&
      !isUnmatchedKey(item.score1Category)
    ) {
      const currentCount = matchedCountsMap.get(item.score2Stack) || 0;
      matchedCountsMap.set(item.score2Stack, currentCount + item.count);
    }
  });

  // Calculate unmatched counts with edge case handling
  const unmatchedDistribution: Array<{
    score1Category: string;
    score2Stack: string;
    count: number;
  }> = [];

  score2Categories.forEach((category) => {
    const totalCount = totalCountsMap.get(category) || 0;
    const matchedCount = matchedCountsMap.get(category) || 0;

    // Prevent negative counts (edge case: race conditions)
    const unmatchedCount = Math.max(0, totalCount - matchedCount);

    // Only add if there are unmatched items
    if (unmatchedCount > 0) {
      unmatchedDistribution.push({
        score1Category: "__unmatched__",
        score2Stack: category,
        count: unmatchedCount,
      });
    }
  });

  return unmatchedDistribution;
}

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
      case "all": {
        // Calculate unmatched score2 items and augment stackedDistribution
        const unmatchedScore2 = calculateUnmatchedScore2Distribution(
          distribution.score2Individual,
          distribution.stackedDistribution ?? [],
          distribution.score2Categories ?? [],
        );

        // Combine original stacked data with unmatched score2 items
        const augmentedStackedDistribution = [
          ...(distribution.stackedDistribution ?? []),
          ...unmatchedScore2,
        ];

        return {
          distribution1: undefined, // Not used in stacked mode
          categories: distribution.categories ?? [],
          stackedDistribution: augmentedStackedDistribution,
          score2Categories: distribution.score2Categories ?? [],
          description: `${score1.name} (${statistics.score1.total.toLocaleString()}) vs ${score2?.name} (${statistics.score2?.total.toLocaleString()})`,
        };
      }
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
                Distribution
                {data.samplingMetadata.isSampled && (
                  <SamplingDetailsHoverCard
                    samplingMetadata={data.samplingMetadata}
                    showLabel
                  />
                )}
              </CardTitle>
              <CardDescription>{chartData.description}</CardDescription>
            </div>
          </div>
          {showTabs && (
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as DistributionTab)}
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
      <CardContent className="flex h-[340px] flex-col pl-0">
        {hasData ? (
          <ScoreDistributionCategoricalChart
            distribution1={chartData.distribution1 ?? []}
            categories={chartData.categories}
            score1Name={
              activeTab === "score2" && score2
                ? `${score2.name} (${score2.source})`
                : `${score1.name} (${score1.source})`
            }
            stackedDistribution={chartData.stackedDistribution}
            score2Categories={chartData.score2Categories}
            score2Name={
              activeTab === "score1" || activeTab === "score2"
                ? undefined
                : mode === "two" && score2
                  ? `${score2.name} (${score2.source})`
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
