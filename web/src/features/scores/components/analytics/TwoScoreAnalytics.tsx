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
  // Extract categories for categorical/boolean scores
  const categories = useMemo(() => {
    if (score1.dataType === "NUMERIC") return undefined;

    // Get unique categories from confusion matrix (use row categories for score1)
    const uniqueCategories = new Set<string>();
    analytics.confusionMatrix.forEach((row) => {
      uniqueCategories.add(row.rowCategory);
    });

    return Array.from(uniqueCategories).sort();
  }, [score1.dataType, analytics.confusionMatrix]);

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

    const min = heatmapRow.min1;
    const max = heatmapRow.max1;
    const binWidth = (max - min) / nBins;

    return Array.from({ length: nBins }, (_, i) => {
      const start = min + i * binWidth;
      const end = min + (i + 1) * binWidth;
      return formatBinLabel(start, end);
    });
  }, [score1.dataType, analytics.heatmap, analytics.statistics, nBins]);

  const totalCount1 = analytics.counts.score1Total;
  const totalCount2 = analytics.counts.score2Total;

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
            <ScoreDistributionChart
              distribution1={distribution1}
              distribution2={distribution2}
              dataType={score1.dataType}
              score1Name={`${score1.name} (${score1.source})`}
              score2Name={`${score2.name} (${score2.source})`}
              binLabels={binLabels}
              categories={categories}
            />
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
