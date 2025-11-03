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
import { type IntervalConfig } from "@/src/utils/date-range-utils";

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
}

export function TwoScoreAnalytics({
  score1,
  score2,
  analytics,
  nBins,
}: TwoScoreAnalyticsProps) {
  // Check if stacked distribution is available (categorical comparison)
  const hasStackedDistribution =
    analytics.stackedDistribution && analytics.stackedDistribution.length > 0;

  // Extract categories for categorical/boolean scores
  const categories = useMemo(() => {
    if (score1.dataType === "NUMERIC") return undefined;

    // For categorical scores with stacked distribution, extract from stackedDistribution
    if (hasStackedDistribution) {
      const uniqueCategories = new Set<string>();
      analytics.stackedDistribution!.forEach((item) => {
        uniqueCategories.add(item.score1Category);
      });
      return Array.from(uniqueCategories).sort();
    }

    // Fallback: Try confusionMatrix (for backward compatibility or boolean scores)
    if (analytics.confusionMatrix.length > 0) {
      const uniqueCategories = new Set<string>();
      analytics.confusionMatrix.forEach((row) => {
        uniqueCategories.add(row.rowCategory);
      });
      return Array.from(uniqueCategories).sort();
    }

    // For boolean: assume alphabetical order ["False", "True"]
    if (score1.dataType === "BOOLEAN") {
      return ["False", "True"];
    }

    // For categorical: we can't reliably determine category names without stackedDistribution or confusionMatrix
    // The distribution only has binIndex, not actual category strings
    return undefined;
  }, [
    score1.dataType,
    analytics.confusionMatrix,
    hasStackedDistribution,
    analytics.stackedDistribution,
  ]);

  // Fill missing bins for categorical/boolean data
  const distribution1 = useMemo(() => {
    const raw = analytics.distribution1;

    if (score1.dataType === "NUMERIC" || !categories) {
      return raw;
    }

    const binMap = new Map(raw.map((item) => [item.binIndex, item.count]));
    return categories.map((_, index) => ({
      binIndex: index,
      count: binMap.get(index) ?? 0,
    }));
  }, [analytics.distribution1, score1.dataType, categories]);

  const distribution2 = useMemo(() => {
    const raw = analytics.distribution2;

    if (score1.dataType === "NUMERIC" || !categories) {
      return raw;
    }

    const binMap = new Map(raw.map((item) => [item.binIndex, item.count]));
    return categories.map((_, index) => ({
      binIndex: index,
      count: binMap.get(index) ?? 0,
    }));
  }, [analytics.distribution2, score1.dataType, categories]);

  // Generate bin labels for numeric scores
  const binLabels = useMemo(() => {
    if (score1.dataType !== "NUMERIC" || !analytics.statistics)
      return undefined;

    const heatmapRow = analytics.heatmap[0];
    if (!heatmapRow) return undefined;

    // Backend now returns global bounds (min/max across BOTH scores) in min1/max1
    // This ensures both distributions use the same bins for meaningful comparison
    const min = heatmapRow.min1; // global_min from backend
    const max = heatmapRow.max1; // global_max from backend
    const binWidth = (max - min) / nBins;

    return Array.from({ length: nBins }, (_, i) => {
      const start = min + i * binWidth;
      const end = min + (i + 1) * binWidth;
      return formatBinLabel(start, end);
    });
  }, [score1.dataType, analytics.heatmap, analytics.statistics, nBins]);

  const totalCount1 = analytics.counts.score1Total;
  const totalCount2 = analytics.counts.score2Total;

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

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Distribution Card */}
      <Card>
        <CardHeader>
          <CardTitle>Distribution Comparison</CardTitle>
          <CardDescription>
            {score1.name} ({totalCount1.toLocaleString()}) vs {score2.name} (
            {totalCount2.toLocaleString()})
          </CardDescription>
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
                distribution1={distribution1}
                distribution2={distribution2}
                dataType={score1.dataType}
                score1Name={score1DisplayName}
                score2Name={score2DisplayName}
                binLabels={binLabels}
                categories={categories}
                stackedDistribution={analytics.stackedDistribution}
                score2Categories={analytics.score2Categories}
              />
            )
          ) : (
            <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
              No distribution data available for the selected time range
            </div>
          )}
        </CardContent>
      </Card>

      {/* Time Series Card Placeholder */}
      <Card>
        <CardHeader>
          <CardTitle>Scores Over Time</CardTitle>
          <CardDescription>
            Time series comparison (coming soon)
          </CardDescription>
        </CardHeader>
        <CardContent className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
          Two-score time series chart coming in next phase
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
