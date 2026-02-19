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
import { ScoreDistributionNumericChart } from "../charts/ScoreDistributionNumericChart";
import { SamplingDetailsHoverCard } from "../SamplingDetailsHoverCard";

type DistributionTab = "score1" | "score2" | "all" | "matched";

/**
 * DistributionNumericCard - Distribution chart card for NUMERIC scores
 *
 * Responsibilities:
 * - Manage tab state (score1/score2/all/matched)
 * - Select appropriate distribution data based on tab
 * - Generate correct bin labels matching backend binning strategy
 * - Apply color mapping (solid colors: blue for score1, yellow for score2)
 * - Render ScoreDistributionNumericChart directly
 *
 * Key Implementation Details:
 * - Individual tabs (score1/score2) use individual-bounded distributions + individual bin labels
 * - Comparison tabs (all/matched) use global-bounded distributions + global bin labels
 * - This ensures bin labels match the backend's binning strategy
 */
export function DistributionNumericCard() {
  const { data, isLoading, params, getColorForScore } = useScoreAnalytics();

  const [activeTab, setActiveTab] = useState<DistributionTab>("all");

  // Select appropriate bin labels based on active tab
  // Backend uses different binning strategies per tab, so we need different labels
  const selectedBinLabels = useMemo(() => {
    if (!data?.distribution) return undefined;

    const { distribution, metadata } = data;
    const { mode } = metadata;

    // Single score mode: use individual1 labels
    if (mode === "single") {
      return distribution.binLabelsIndividual1;
    }

    // Two score mode: select labels based on active tab
    switch (activeTab) {
      case "score1":
        return distribution.binLabelsIndividual1; // Individual binning for score1
      case "score2":
        return distribution.binLabelsIndividual2; // Individual binning for score2
      case "all":
      case "matched":
        return distribution.binLabelsGlobal; // Global binning for comparison
      default:
        return distribution.binLabelsGlobal;
    }
  }, [data, activeTab]);

  // Select distribution data based on active tab
  const { distribution1Data, distribution2Data, description } = useMemo(() => {
    if (!data) {
      return {
        distribution1Data: [],
        distribution2Data: undefined,
        description: "",
      };
    }

    const { distribution, metadata, statistics } = data;
    const { mode } = metadata;
    const { score1, score2 } = params;

    if (mode === "single") {
      // Single score mode - only show individual distribution
      return {
        distribution1Data: distribution.score1,
        distribution2Data: undefined,
        description: `${statistics.score1.total.toLocaleString()} observations${
          statistics.score1.mean !== null
            ? ` | Average: ${statistics.score1.mean.toFixed(3)}`
            : ""
        }`,
      };
    }

    // Two score mode - handle tabs
    switch (activeTab) {
      case "score1":
        // Use individual distribution if available and non-empty, fallback to global distribution
        // This handles the case where backend might return empty array for individual distributions
        // when there are no matching pairs between scores
        const score1Data =
          distribution.score1Individual &&
          distribution.score1Individual.length > 0
            ? distribution.score1Individual
            : distribution.score1;
        return {
          distribution1Data: score1Data,
          distribution2Data: undefined,
          description: `${score1.name} - ${statistics.score1.total.toLocaleString()} observations`,
        };
      case "score2":
        // Use individual distribution if available and non-empty, fallback to global distribution
        const score2Data =
          distribution.score2Individual &&
          distribution.score2Individual.length > 0
            ? distribution.score2Individual
            : distribution.score2;
        return {
          distribution1Data: score2Data,
          distribution2Data: undefined,
          description: `${score2?.name ?? "Score 2"} - ${statistics.score2?.total.toLocaleString()} observations`,
        };
      case "all":
        return {
          distribution1Data: distribution.score1,
          distribution2Data: distribution.score2,
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

  // Build color mapping for numeric charts (solid colors)
  const chartColors = useMemo(() => {
    if (activeTab === "score1") {
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
  }, [activeTab, getColorForScore]);

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

  const { metadata } = data;
  const { mode } = metadata;
  const { score1, score2 } = params;

  const hasData = (distribution1Data?.length ?? 0) > 0;
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
              <CardDescription>{description}</CardDescription>
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
        {hasData && selectedBinLabels ? (
          <ScoreDistributionNumericChart
            distribution1={distribution1Data ?? []}
            distribution2={
              activeTab === "score1" || activeTab === "score2"
                ? undefined
                : (distribution2Data ?? undefined)
            }
            binLabels={selectedBinLabels}
            score1Name={
              activeTab === "score2" && score2
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
