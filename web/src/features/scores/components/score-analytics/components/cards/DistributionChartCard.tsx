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
import { ScoreDistributionChart } from "@/src/features/scores/components/analytics/ScoreDistributionChart";

type DistributionTab = "individual" | "matched" | "stacked";

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
  const { data, isLoading, params } = useScoreAnalytics();
  const [activeTab, setActiveTab] = useState<DistributionTab>("individual");

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
      case "individual":
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
      case "stacked":
        // Stacked view uses stackedDistribution data
        // For now, show individual as fallback (stacked requires special handling)
        return {
          distribution1Data: distribution.score1Individual,
          distribution2Data: distribution.score2Individual,
          description: `${score1.name} vs ${score2?.name} - Stacked view`,
        };
    }
  }, [data, activeTab, params]);

  // For stacked view in categorical mode, use stackedDistribution
  const stackedDistributionData = useMemo(() => {
    if (!data) return undefined;
    const { distribution, metadata } = data;
    const { mode, dataType } = metadata;

    return mode === "two" &&
      dataType === "CATEGORICAL" &&
      activeTab === "matched"
      ? distribution.stackedDistributionMatched
      : mode === "two" && dataType === "CATEGORICAL" && activeTab === "stacked"
        ? distribution.stackedDistribution
        : undefined;
  }, [data, activeTab]);

  // Loading state
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Distribution</CardTitle>
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
          <CardTitle>Distribution</CardTitle>
          <CardDescription>No data available</CardDescription>
        </CardHeader>
        <CardContent className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
          Select a score to view distribution
        </CardContent>
      </Card>
    );
  }

  const { metadata } = data;
  const { mode, dataType } = metadata;
  const { score1, score2 } = params;

  const hasData = distribution1Data.length > 0;
  const showTabs = mode === "two";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>Distribution</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          {showTabs && (
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as DistributionTab)}
            >
              <TabsList className="grid w-[300px] grid-cols-3">
                <TabsTrigger value="individual">Individual</TabsTrigger>
                <TabsTrigger value="matched">Matched</TabsTrigger>
                {dataType === "CATEGORICAL" && (
                  <TabsTrigger value="stacked">Stacked</TabsTrigger>
                )}
              </TabsList>
            </Tabs>
          )}
        </div>
      </CardHeader>
      <CardContent className="h-[300px]">
        {hasData ? (
          <ScoreDistributionChart
            distribution1={distribution1Data}
            distribution2={mode === "two" ? distribution2Data : undefined}
            dataType={dataType}
            score1Name={score1.name}
            score2Name={mode === "two" && score2 ? score2.name : undefined}
            binLabels={distribution.binLabels}
            categories={distribution.categories}
            stackedDistribution={stackedDistributionData}
            score2Categories={distribution.score2Categories}
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
