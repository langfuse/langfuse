import React, { createContext, useContext, useMemo, useCallback } from "react";
import {
  useScoreAnalyticsQuery,
  type ScoreAnalyticsQueryParams,
  type UseScoreAnalyticsQueryResult,
} from "../hooks/useScoreAnalyticsQuery";
import {
  getSingleScoreColor,
  getTwoScoreColors,
  SCORE_BASE_COLORS,
  getScoreCategoryColors,
  getScoreBooleanColors,
  getScoreNumericColor,
} from "@/src/features/scores/lib/color-scales";

// Re-export types for convenience
export type {
  ScoreAnalyticsQueryParams,
  ScoreAnalyticsData,
  ParsedScore,
  DataType,
  ObjectType,
  ScoreStatistics,
  ComparisonStatistics,
  Distribution,
  TimeSeries,
} from "../hooks/useScoreAnalyticsQuery";

// ============================================================================
// Color Schemes
// ============================================================================

export interface SingleScoreColors {
  score: string;
}

export interface TwoScoreColors {
  score1: string;
  score2: string;
}

export type ScoreColors = SingleScoreColors | TwoScoreColors;

/**
 * Determine color scheme based on mode
 */
function getScoreColors(mode: "single" | "two" | undefined): ScoreColors {
  if (mode === "two") {
    return getTwoScoreColors();
  }
  return {
    score: getSingleScoreColor(),
  };
}

// ============================================================================
// Context Definition
// ============================================================================

export interface ScoreAnalyticsContextValue
  extends UseScoreAnalyticsQueryResult {
  colors: ScoreColors;
  params: ScoreAnalyticsQueryParams;
  colorMappings: Record<string, string>;
  getColorForScore: (scoreNumber: 1 | 2) => string;
}

const ScoreAnalyticsContext = createContext<
  ScoreAnalyticsContextValue | undefined
>(undefined);

// ============================================================================
// Provider Component
// ============================================================================

export interface ScoreAnalyticsProviderProps {
  params: ScoreAnalyticsQueryParams;
  children: React.ReactNode;
}

/**
 * Provider component that wraps useScoreAnalyticsQuery and exposes data via Context
 *
 * This provider:
 * 1. Calls useScoreAnalyticsQuery with params
 * 2. Determines color scheme (single vs two-score)
 * 3. Exposes transformed data + colors to children
 *
 * @example
 * ```tsx
 * <ScoreAnalyticsProvider params={queryParams}>
 *   <ScoreAnalyticsDashboard />
 * </ScoreAnalyticsProvider>
 * ```
 */
export function ScoreAnalyticsProvider({
  params,
  children,
}: ScoreAnalyticsProviderProps) {
  // Fetch and transform data using the hook
  const queryResult = useScoreAnalyticsQuery(params);

  // Determine color scheme based on mode
  const colors = useMemo(() => {
    return getScoreColors(queryResult.data?.metadata.mode);
  }, [queryResult.data?.metadata.mode]);

  // Compute comprehensive color mappings for all categories/values
  const colorMappings = useMemo(() => {
    const data = queryResult.data;
    if (!data) return {};

    const mappings: Record<string, string> = {};
    const { dataType, mode } = data.metadata;

    // Build score name prefixes (same logic as in useScoreAnalyticsQuery)
    // Used for namespaced categories in "all" and "allMatched" tabs
    const score1Prefix =
      mode === "two" &&
      params.score1.name === params.score2?.name &&
      params.score1.source !== params.score2?.source
        ? `${params.score1.name} (${params.score1.source})`
        : params.score1.name;

    const score2Prefix =
      mode === "two" &&
      params.score2 &&
      params.score1.name === params.score2.name &&
      params.score1.source !== params.score2.source
        ? `${params.score2.name} (${params.score2.source})`
        : (params.score2?.name ?? "");

    // Score 1 color mappings
    if (dataType === "CATEGORICAL" && data.distribution.categories) {
      const categoryColors = getScoreCategoryColors(
        1,
        data.distribution.categories,
      );
      Object.assign(mappings, categoryColors);

      // Add namespaced versions for "all" and "allMatched" tabs
      if (mode === "two") {
        data.distribution.categories.forEach((category) => {
          mappings[`${score1Prefix}: ${category}`] = categoryColors[category];
        });
      }
    } else if (dataType === "BOOLEAN" && data.distribution.categories) {
      const booleanColors = getScoreBooleanColors(1);
      Object.assign(mappings, booleanColors);

      // Add namespaced versions for "all" and "allMatched" tabs
      if (mode === "two") {
        data.distribution.categories.forEach((category) => {
          mappings[`${score1Prefix}: ${category}`] = booleanColors[category];
        });
      }
    } else if (dataType === "NUMERIC") {
      mappings["__score1_numeric__"] = getScoreNumericColor(1);
    }

    // Score 2 color mappings (if exists)
    if (mode === "two") {
      if (dataType === "CATEGORICAL" && data.distribution.score2Categories) {
        const categoryColors = getScoreCategoryColors(
          2,
          data.distribution.score2Categories,
        );
        Object.assign(mappings, categoryColors);

        // Add namespaced versions for "all" and "allMatched" tabs
        data.distribution.score2Categories.forEach((category) => {
          mappings[`${score2Prefix}: ${category}`] = categoryColors[category];
        });
      } else if (dataType === "BOOLEAN" && data.distribution.categories) {
        const booleanColors = getScoreBooleanColors(2);
        // Prefix with score2 to avoid collision with score1 boolean values
        mappings["__score2_True"] = booleanColors.True;
        mappings["__score2_False"] = booleanColors.False;

        // Add namespaced versions for "all" and "allMatched" tabs
        data.distribution.categories.forEach((category) => {
          mappings[`${score2Prefix}: ${category}`] = booleanColors[category];
        });
      } else if (dataType === "NUMERIC") {
        mappings["__score2_numeric__"] = getScoreNumericColor(2);
      }
    }

    return mappings;
  }, [queryResult.data, params]);

  // Helper function to get base color for a score
  const getColorForScore = useCallback((scoreNumber: 1 | 2): string => {
    return scoreNumber === 1
      ? SCORE_BASE_COLORS.score1
      : SCORE_BASE_COLORS.score2;
  }, []);

  // Build context value
  const contextValue: ScoreAnalyticsContextValue = useMemo(
    () => ({
      ...queryResult,
      colors,
      params,
      colorMappings,
      getColorForScore,
    }),
    [queryResult, colors, params, colorMappings, getColorForScore],
  );

  return (
    <ScoreAnalyticsContext.Provider value={contextValue}>
      {children}
    </ScoreAnalyticsContext.Provider>
  );
}

// ============================================================================
// Consumer Hook
// ============================================================================

/**
 * Hook to consume ScoreAnalyticsContext
 *
 * Provides easy access to:
 * - data: Transformed analytics data
 * - isLoading: Loading state
 * - error: Error state
 * - colors: Color scheme for charts
 * - params: Query parameters
 *
 * @throws Error if used outside ScoreAnalyticsProvider
 *
 * @example
 * ```tsx
 * function StatisticsCard() {
 *   const { data, colors, isLoading } = useScoreAnalytics();
 *
 *   if (isLoading) return <Loader />;
 *   if (!data) return null;
 *
 *   return <div>Mean: {data.statistics.score1.mean}</div>;
 * }
 * ```
 */
export function useScoreAnalytics(): ScoreAnalyticsContextValue {
  const context = useContext(ScoreAnalyticsContext);

  if (!context) {
    throw new Error(
      "useScoreAnalytics must be used within a ScoreAnalyticsProvider",
    );
  }

  return context;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if colors are for two scores
 */
export function isTwoScoreColors(
  colors: ScoreColors,
): colors is TwoScoreColors {
  return "score1" in colors && "score2" in colors;
}

/**
 * Type guard to check if colors are for single score
 */
export function isSingleScoreColors(
  colors: ScoreColors,
): colors is SingleScoreColors {
  return "score" in colors && !("score1" in colors);
}
