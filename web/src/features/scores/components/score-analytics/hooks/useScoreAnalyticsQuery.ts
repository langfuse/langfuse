import { useMemo } from "react";
import { api } from "@/src/utils/api";
import type { IntervalConfig } from "@/src/utils/date-range-utils";
import {
  fillTimeSeriesGaps,
  fillCategoricalTimeSeriesGaps,
} from "@/src/utils/fill-time-series-gaps";
import {
  extractCategories,
  fillDistributionBins,
  calculateModeMetrics,
  transformHeatmapData,
  generateBinLabels,
} from "../transformers/scoreAnalyticsTransformers";

// ============================================================================
// Type Definitions
// ============================================================================

export type DataType = "NUMERIC" | "CATEGORICAL" | "BOOLEAN";

export type ObjectType = "all" | "trace" | "session" | "observation" | "run";

/**
 * Parsed score identifier
 */
export interface ParsedScore {
  name: string;
  dataType: DataType;
  source: string;
}

/**
 * Input parameters for the useScoreAnalyticsQuery hook
 */
export interface ScoreAnalyticsQueryParams {
  projectId: string;
  score1: ParsedScore;
  score2?: ParsedScore;
  fromTimestamp: Date;
  toTimestamp: Date;
  interval: IntervalConfig;
  objectType?: ObjectType;
  nBins?: number; // Default: 10
}

/**
 * Statistics for a single score
 */
export interface ScoreStatistics {
  total: number;
  mean: number | null;
  std: number | null;
  mode: { category: string; count: number } | null;
  modePercentage: number | null;
}

/**
 * Comparison statistics between two scores
 */
export interface ComparisonStatistics {
  matchedCount: number;
  pearsonCorrelation: number | null;
  spearmanCorrelation: number | null;
  mae: number | null;
  rmse: number | null;
  confusionMatrix: Array<{
    rowCategory: string;
    colCategory: string;
    count: number;
  }>;
}

/**
 * Distribution data structure
 */
export interface Distribution {
  score1: Array<{ binIndex: number; count: number }>;
  score2: Array<{ binIndex: number; count: number }> | null;
  categories?: string[]; // For categorical/boolean
  binLabels?: string[]; // For numeric

  // Tab-specific distributions (for card components to select from)
  score1Individual: Array<{ binIndex: number; count: number }>;
  score2Individual: Array<{ binIndex: number; count: number }>;
  score1Matched: Array<{ binIndex: number; count: number }>;
  score2Matched: Array<{ binIndex: number; count: number }>;
  stackedDistribution?: Array<{
    score1Category: string;
    score2Stack: string;
    count: number;
  }>;
  stackedDistributionMatched?: Array<{
    score1Category: string;
    score2Stack: string;
    count: number;
  }>;
  score2Categories?: string[];
}

/**
 * Time series data structure
 */
export interface TimeSeries {
  numeric: {
    all: Array<{ timestamp: Date; [key: string]: unknown }>;
    matched: Array<{ timestamp: Date; [key: string]: unknown }>;
  };
  categorical: {
    score1: Array<{ timestamp: Date; category: string; count: number }>;
    score2: Array<{ timestamp: Date; category: string; count: number }>;
    score1Matched: Array<{ timestamp: Date; category: string; count: number }>;
    score2Matched: Array<{ timestamp: Date; category: string; count: number }>;
  };
}

/**
 * Complete transformed score analytics data
 */
export interface ScoreAnalyticsData {
  statistics: {
    score1: ScoreStatistics;
    score2: ScoreStatistics | null;
    comparison: ComparisonStatistics | null;
  };
  distribution: Distribution;
  timeSeries: TimeSeries;
  heatmap: ReturnType<typeof transformHeatmapData>;
  metadata: {
    mode: "single" | "two";
    isSameScore: boolean;
    dataType: DataType;
  };
}

/**
 * Hook return type
 */
export interface UseScoreAnalyticsQueryResult {
  data: ScoreAnalyticsData | null;
  isLoading: boolean;
  error: Error | null;
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook that fetches and transforms score analytics data
 *
 * This hook:
 * 1. Fetches monolithic API data via tRPC
 * 2. Transforms it ONCE using pure transformer functions
 * 3. Returns clean, structured data for the Provider to consume
 *
 * @param params - Query parameters
 * @returns Transformed analytics data with loading/error states
 */
export function useScoreAnalyticsQuery(
  params: ScoreAnalyticsQueryParams,
): UseScoreAnalyticsQueryResult {
  const {
    projectId,
    score1,
    score2,
    fromTimestamp,
    toTimestamp,
    interval,
    objectType,
    nBins = 10,
  } = params;

  // Fetch API data
  const {
    data: apiData,
    isLoading,
    error,
  } = api.scores.getScoreComparisonAnalytics.useQuery(
    {
      projectId,
      score1,
      score2: score2 ?? score1, // Use same score if only one selected
      fromTimestamp,
      toTimestamp,
      interval,
      objectType,
      matchedOnly: false, // Not used anymore - tabs control display
    },
    {
      enabled: !!(projectId && score1),
    },
  );

  // Transform data ONCE
  const transformedData = useMemo<ScoreAnalyticsData | null>(() => {
    if (!apiData) return null;

    const dataType = score1.dataType;
    const isNumeric = dataType === "NUMERIC";

    // Determine if we have two scores and if they're the same
    const isSameScore = Boolean(
      score1 &&
        score2 &&
        score1.name === score2.name &&
        score1.source === score2.source,
    );

    const mode: "single" | "two" = score2 ? "two" : "single";

    // ========================================================================
    // 1. Extract categories (categorical/boolean only)
    // ========================================================================
    const categories = extractCategories({
      dataType,
      confusionMatrix: apiData.confusionMatrix,
      stackedDistribution: apiData.stackedDistribution,
    });

    // ========================================================================
    // 2. Fill distribution bins (categorical/boolean only)
    // ========================================================================
    const distribution1 = categories
      ? fillDistributionBins(apiData.distribution1, categories)
      : apiData.distribution1;

    const distribution2 =
      categories && mode === "two"
        ? fillDistributionBins(apiData.distribution2, categories)
        : apiData.distribution2;

    const distribution1Individual = categories
      ? fillDistributionBins(apiData.distribution1Individual, categories)
      : apiData.distribution1Individual;

    const distribution2Individual = categories
      ? fillDistributionBins(apiData.distribution2Individual, categories)
      : apiData.distribution2Individual;

    const distribution1Matched = categories
      ? fillDistributionBins(apiData.distribution1Matched, categories)
      : apiData.distribution1Matched;

    const distribution2Matched = categories
      ? fillDistributionBins(apiData.distribution2Matched, categories)
      : apiData.distribution2Matched;

    // ========================================================================
    // 3. Generate bin labels (numeric only)
    // ========================================================================
    const binLabels =
      isNumeric && apiData.heatmap[0]
        ? generateBinLabels({
            min: apiData.heatmap[0].min1,
            max: apiData.heatmap[0].max1,
            nBins,
          })
        : undefined;

    // ========================================================================
    // 4. Transform heatmap data
    // ========================================================================
    const heatmap = transformHeatmapData({
      apiData,
      dataType,
      parsedScore1: score1,
    });

    // ========================================================================
    // 5. Calculate mode metrics (categorical/boolean only)
    // ========================================================================
    const score1ModeMetrics = !isNumeric
      ? calculateModeMetrics({
          distribution: apiData.distribution1,
          timeSeries: apiData.timeSeriesCategorical1,
          totalCount: apiData.counts.score1Total,
        })
      : null;

    // For Score 2: If same score selected twice, reuse Score 1 data
    const score2ModeMetrics =
      !isNumeric && mode === "two"
        ? isSameScore
          ? calculateModeMetrics({
              distribution: apiData.distribution1, // Reuse Score 1 data
              timeSeries: apiData.timeSeriesCategorical1, // Reuse Score 1 data
              totalCount: apiData.counts.score2Total,
            })
          : calculateModeMetrics({
              distribution: apiData.distribution2,
              timeSeries: apiData.timeSeriesCategorical2,
              totalCount: apiData.counts.score2Total,
            })
        : null;

    // ========================================================================
    // 6. Fill time series gaps
    // ========================================================================
    const numericTimeSeries = fillTimeSeriesGaps(
      apiData.timeSeries,
      fromTimestamp,
      toTimestamp,
      interval,
    );

    const numericTimeSeriesMatched = fillTimeSeriesGaps(
      apiData.timeSeriesMatched,
      fromTimestamp,
      toTimestamp,
      interval,
    );

    const categoricalTimeSeries1 = fillCategoricalTimeSeriesGaps(
      apiData.timeSeriesCategorical1,
      fromTimestamp,
      toTimestamp,
      interval,
    );

    const categoricalTimeSeries2 = fillCategoricalTimeSeriesGaps(
      apiData.timeSeriesCategorical2,
      fromTimestamp,
      toTimestamp,
      interval,
    );

    const categoricalTimeSeries1Matched = fillCategoricalTimeSeriesGaps(
      apiData.timeSeriesCategorical1Matched,
      fromTimestamp,
      toTimestamp,
      interval,
    );

    const categoricalTimeSeries2Matched = fillCategoricalTimeSeriesGaps(
      apiData.timeSeriesCategorical2Matched,
      fromTimestamp,
      toTimestamp,
      interval,
    );

    // ========================================================================
    // Build structured return object
    // ========================================================================
    return {
      statistics: {
        score1: {
          total: apiData.counts.score1Total,
          mean: apiData.statistics?.mean1 ?? null,
          std: apiData.statistics?.std1 ?? null,
          mode: score1ModeMetrics?.mode ?? null,
          modePercentage: score1ModeMetrics?.modePercentage ?? null,
        },
        score2:
          mode === "two"
            ? {
                total: apiData.counts.score2Total,
                mean: apiData.statistics?.mean2 ?? null,
                std: apiData.statistics?.std2 ?? null,
                mode: score2ModeMetrics?.mode ?? null,
                modePercentage: score2ModeMetrics?.modePercentage ?? null,
              }
            : null,
        comparison:
          mode === "two"
            ? {
                matchedCount: apiData.counts.matchedCount,
                pearsonCorrelation:
                  apiData.statistics?.pearsonCorrelation ?? null,
                spearmanCorrelation:
                  apiData.statistics?.spearmanCorrelation ?? null,
                mae: apiData.statistics?.mae ?? null,
                rmse: apiData.statistics?.rmse ?? null,
                confusionMatrix: apiData.confusionMatrix,
              }
            : null,
      },
      distribution: {
        score1: distribution1,
        score2: mode === "two" ? distribution2 : null,
        categories,
        binLabels,
        score1Individual: distribution1Individual,
        score2Individual: distribution2Individual,
        score1Matched: distribution1Matched,
        score2Matched: distribution2Matched,
        stackedDistribution: apiData.stackedDistribution,
        stackedDistributionMatched: apiData.stackedDistributionMatched,
        score2Categories: apiData.score2Categories,
      },
      timeSeries: {
        numeric: {
          all: numericTimeSeries,
          matched: numericTimeSeriesMatched,
        },
        categorical: {
          score1: categoricalTimeSeries1,
          score2: categoricalTimeSeries2,
          score1Matched: categoricalTimeSeries1Matched,
          score2Matched: categoricalTimeSeries2Matched,
        },
      },
      heatmap,
      metadata: {
        mode,
        isSameScore,
        dataType,
      },
    };
  }, [apiData, score1, score2, fromTimestamp, toTimestamp, interval, nBins]);

  return {
    data: transformedData,
    isLoading,
    error: error as Error | null,
  };
}
