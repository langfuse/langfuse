import { type DashboardWidgetChartType } from "@langfuse/shared/src/db";
import {
  type AggregationFn,
  type ChartViewConfig,
  type DimensionKey,
  type MetricKey,
  type TimeGranularity,
} from "../types";
import { coerceConfig, DEFAULT_CONFIG } from "../vocab";

/**
 * A deliberately small, PURE keyword matcher that maps a natural-language ask to
 * a `ChartViewConfig`. This is the prototype's stand-in for phase 2, where
 * `naturalLanguageFilters.createCompletion` gains a chart-config sibling that an
 * LLM fills in. The point of doing it locally here is to prove the END of that
 * pipe — that a clean, flat spec is all the chart view needs — without a model
 * in the loop. Happy path only: 1 metric × 1 dimension × 1 chart type.
 */

const has = (q: string, ...needles: string[]): boolean =>
  needles.some((n) => q.includes(n));

/**
 * Whole-word match — used for short, collision-prone aggregation tokens so e.g.
 * "min" doesn't fire on "minute" / "minutely".
 */
const hasWord = (q: string, ...words: string[]): boolean =>
  words.some((w) =>
    new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(q),
  );

function pickMetric(q: string): MetricKey {
  if (has(q, "cost", "spend", "$", "dollar", "usd")) return "totalCost";
  if (has(q, "token")) return "totalTokens";
  if (
    has(q, "latency", "duration", "slow", "fast", "speed", "p95", "p99", "p50")
  )
    return "latency";
  return "count";
}

function pickAggregation(q: string): AggregationFn {
  if (hasWord(q, "p99", "99th")) return "p99";
  if (hasWord(q, "p95", "95th")) return "p95";
  if (hasWord(q, "median", "p50", "50th")) return "p50";
  if (hasWord(q, "average", "avg", "mean")) return "avg";
  if (hasWord(q, "max", "maximum", "slowest", "peak", "highest")) return "max";
  if (hasWord(q, "min", "minimum", "fastest", "lowest")) return "min";
  if (hasWord(q, "total", "sum")) return "sum";
  return "count";
}

function pickBreakdown(q: string): DimensionKey {
  if (has(q, "model")) return "model";
  if (has(q, "level", "error", "warning")) return "level";
  if (has(q, "environment", " env")) return "environment";
  if (has(q, "type", "generation", "span")) return "type";
  if (has(q, "operation", "name", "endpoint")) return "name";
  return "none";
}

function pickChartType(
  q: string,
  breakdown: DimensionKey,
): DashboardWidgetChartType {
  if (has(q, "area")) return "AREA_TIME_SERIES";
  if (has(q, "pie", "share", "proportion", "split", "distribution"))
    return "PIE";
  if (
    has(
      q,
      "over time",
      "trend",
      "timeline",
      "history",
      "per hour",
      "per day",
      "per minute",
      "daily",
      "hourly",
    )
  )
    return has(q, "bar", "column") ? "BAR_TIME_SERIES" : "LINE_TIME_SERIES";
  if (has(q, "ranked", "top", "rank", "leaderboard", "bar", "compare"))
    return "HORIZONTAL_BAR";
  if (has(q, "single number", "big number", "just the number")) return "NUMBER";
  // No explicit chart hint: a breakdown reads best as a ranked bar, otherwise a
  // single big number.
  return breakdown === "none" ? "NUMBER" : "HORIZONTAL_BAR";
}

function pickGranularity(q: string): TimeGranularity {
  if (has(q, "per minute", "by minute", "minutely")) return "minute";
  if (has(q, "per day", "daily", "by day")) return "day";
  return "hour";
}

export function parseAskAi(query: string): ChartViewConfig {
  const q = query.toLowerCase().trim();
  if (q.length === 0) return DEFAULT_CONFIG;

  const breakdown = pickBreakdown(q);
  return coerceConfig({
    metric: pickMetric(q),
    aggregation: pickAggregation(q),
    breakdown,
    chartType: pickChartType(q, breakdown),
    timeGranularity: pickGranularity(q),
  });
}

// The suggestion chips are shared with the production Ask-AI bar.
export { ASK_AI_SUGGESTIONS } from "../vocab";
