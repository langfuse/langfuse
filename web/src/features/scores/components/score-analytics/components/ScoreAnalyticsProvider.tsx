import React, { createContext, useContext, useMemo, useCallback } from "react";
import {
  useScoreAnalyticsQuery,
  type ScoreAnalyticsQueryParams,
  type UseScoreAnalyticsQueryResult,
} from "../hooks/useScoreAnalyticsQuery";
import {
  getSingleScoreColor,
  getTwoScoreColors,
  getScoreNumericColor,
  buildColorMappings,
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

    return buildColorMappings({
      dataType: data.metadata.dataType,
      mode: data.metadata.mode,
      score1Name: params.score1.name,
      score2Name: params.score2?.name,
      score1Source: params.score1.source,
      score2Source: params.score2?.source,
      categories: data.distribution.categories,
      score2Categories: data.distribution.score2Categories,
    });
  }, [queryResult.data, params]);

  // Helper function to get color for a score
  // Returns darkest color from monochrome scale for consistency
  const getColorForScore = useCallback((scoreNumber: 1 | 2): string => {
    return getScoreNumericColor(scoreNumber);
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
