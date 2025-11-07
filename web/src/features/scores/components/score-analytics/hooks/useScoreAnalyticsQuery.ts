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

export type ObjectType =
  | "all"
  | "trace"
  | "session"
  | "observation"
  | "dataset_run";

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
    all: Array<{ timestamp: Date; category: string; count: number }>; // Merged score1+score2 with namespaced categories
    allMatched: Array<{ timestamp: Date; category: string; count: number }>; // Merged matched data with namespaced categories
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

    // Determine mode based on whether score2 was originally provided in params
    // (not the fallback value sent to the API at line 190)
    const mode: "single" | "two" = score2 !== undefined ? "two" : "single";

    // Determine if we have two scores and if they're the same
    const isSameScore = Boolean(
      score1 &&
        score2 &&
        score1.name === score2.name &&
        score1.source === score2.source,
    );

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
    // Note: Sort all distributions by binIndex to ensure deterministic ordering
    // fillDistributionBins() already returns sorted data for categorical/boolean
    // For numeric, we sort to handle non-deterministic ClickHouse row ordering
    // ========================================================================
    const distribution1 = categories
      ? fillDistributionBins(apiData.distribution1, categories)
      : apiData.distribution1.slice().sort((a, b) => a.binIndex - b.binIndex);

    const distribution2 =
      categories && mode === "two"
        ? fillDistributionBins(apiData.distribution2, categories)
        : apiData.distribution2.slice().sort((a, b) => a.binIndex - b.binIndex);

    const distribution1Individual = categories
      ? fillDistributionBins(apiData.distribution1Individual, categories)
      : apiData.distribution1Individual
          .slice()
          .sort((a, b) => a.binIndex - b.binIndex);

    const distribution2Individual = categories
      ? fillDistributionBins(apiData.distribution2Individual, categories)
      : apiData.distribution2Individual
          .slice()
          .sort((a, b) => a.binIndex - b.binIndex);

    const distribution1Matched = categories
      ? fillDistributionBins(apiData.distribution1Matched, categories)
      : apiData.distribution1Matched
          .slice()
          .sort((a, b) => a.binIndex - b.binIndex);

    const distribution2Matched = categories
      ? fillDistributionBins(apiData.distribution2Matched, categories)
      : apiData.distribution2Matched
          .slice()
          .sort((a, b) => a.binIndex - b.binIndex);

    // ========================================================================
    // 3. Generate bin labels (numeric only)
    // ========================================================================
    // For numeric scores, we need min/max bounds to generate bin labels.
    // First try to get bounds from heatmap (when there are matched pairs).
    // If heatmap is empty (no matched pairs), calculate bounds from statistics.
    let binLabels: string[] | undefined = undefined;
    if (isNumeric) {
      // Try to get bounds from heatmap (preferred, as it contains pre-calculated bounds)
      if (apiData.heatmap[0]) {
        binLabels = generateBinLabels({
          min: apiData.heatmap[0].min1,
          max: apiData.heatmap[0].max1,
          nBins,
        });
      }
      // Fallback: Calculate bounds from statistics when heatmap is empty
      // This handles the case when matchedCount = 0 (no paired observations)
      else if (
        apiData.statistics &&
        apiData.statistics.mean1 !== null &&
        apiData.statistics.std1 !== null
      ) {
        const mean = apiData.statistics.mean1;
        const std = apiData.statistics.std1;
        // Use ±3 standard deviations as bounds (covers ~99.7% of data)
        const min = mean - 3 * std;
        const max = mean + 3 * std;
        binLabels = generateBinLabels({ min, max, nBins });
      }
    }

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

    // If same score selected twice, populate avg2 with avg1 data
    // This ensures UI can show both lines (identical but overlapping) in two-score mode
    // Backend optimizes by setting avg2=null when scores are identical
    if (isSameScore && mode === "two") {
      numericTimeSeries.forEach((item) => {
        if (item.avg2 === null && item.avg1 !== null) {
          item.avg2 = item.avg1;
        }
      });

      numericTimeSeriesMatched.forEach((item) => {
        if (item.avg2 === null && item.avg1 !== null) {
          item.avg2 = item.avg1;
        }
      });
    }

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

    // If same score selected twice, populate categorical2 with categorical1 data
    // This ensures UI can show data in "Score 2" tab when comparing a score to itself
    // Backend optimizes by returning empty categorical2 when scores are identical
    if (isSameScore && mode === "two") {
      categoricalTimeSeries2.length = 0;
      categoricalTimeSeries2.push(...categoricalTimeSeries1);

      categoricalTimeSeries2Matched.length = 0;
      categoricalTimeSeries2Matched.push(...categoricalTimeSeries1Matched);
    }

    // ========================================================================
    // 7. Build merged categorical time series with namespaced categories
    // ========================================================================
    // Helper function to namespace category names
    const namespaceCategoricalTimeSeries = (
      data: Array<{ timestamp: Date; category: string; count: number }>,
      scorePrefix: string,
    ): Array<{ timestamp: Date; category: string; count: number }> => {
      return data.map((item) => ({
        ...item,
        category: `${scorePrefix}: ${item.category}`,
      }));
    };

    // Build score name prefixes (include source if scores have same name but different sources)
    const score1Prefix =
      mode === "two" &&
      score1.name === score2?.name &&
      score1.source !== score2?.source
        ? `${score1.name} (${score1.source})`
        : score1.name;

    const score2Prefix =
      mode === "two" &&
      score2 &&
      score1.name === score2.name &&
      score1.source !== score2.source
        ? `${score2.name} (${score2.source})`
        : (score2?.name ?? "");

    // Merge categorical time series for "all" and "allMatched" tabs
    const categoricalAll =
      mode === "two"
        ? [
            ...namespaceCategoricalTimeSeries(
              categoricalTimeSeries1,
              score1Prefix,
            ),
            ...namespaceCategoricalTimeSeries(
              categoricalTimeSeries2,
              score2Prefix,
            ),
          ]
        : categoricalTimeSeries1; // Single score mode: no namespacing needed

    const categoricalAllMatched =
      mode === "two"
        ? [
            ...namespaceCategoricalTimeSeries(
              categoricalTimeSeries1Matched,
              score1Prefix,
            ),
            ...namespaceCategoricalTimeSeries(
              categoricalTimeSeries2Matched,
              score2Prefix,
            ),
          ]
        : categoricalTimeSeries1Matched; // Single score mode: no namespacing needed

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
        // For categorical/boolean scores, ensure score2Categories is populated
        // API may return empty array [] when both scores have identical categories
        // (e.g., boolean scores always have ["False", "True"])
        // We need this populated so the UI can correctly display score2's categories
        // when viewing the "score2" tab in the distribution card
        score2Categories:
          apiData.score2Categories && apiData.score2Categories.length > 0
            ? apiData.score2Categories
            : mode === "two" && categories
              ? categories
              : undefined,
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
          all: categoricalAll,
          allMatched: categoricalAllMatched,
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
