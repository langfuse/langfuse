import { z } from "zod";
import {
  type ChatMessage,
  ChatMessageRole,
  ChatMessageType,
} from "@langfuse/shared/src/server";
import { METRIC_AGGREGATIONS } from "../metricAggregations";

/**
 * The chart spec an LLM emits for "Ask AI → chart". Mirrors `ChartViewConfig`
 * but is defined server-side with literal enums (no client/`lucide` imports) so
 * it is safe in the tRPC router and can be passed as `structuredOutputSchema` to
 * `fetchLLMCompletion`. The client re-runs `coerceConfig` on the result, so a
 * model that picks an aggregation the metric doesn't support is still corrected.
 */
export const chartCompletionSchema = z.object({
  metric: z.enum(["count", "latency", "totalCost", "totalTokens"]),
  aggregation: z.enum([
    "count",
    "sum",
    "avg",
    "min",
    "max",
    "p50",
    "p95",
    "p99",
  ]),
  breakdown: z.enum(["none", "model", "name", "level", "type", "environment"]),
  chartType: z.enum([
    "LINE_TIME_SERIES",
    "AREA_TIME_SERIES",
    "BAR_TIME_SERIES",
    "HORIZONTAL_BAR",
    "PIE",
    "NUMBER",
  ]),
  timeGranularity: z.enum(["minute", "hour", "day"]),
});

export type ChartCompletion = z.infer<typeof chartCompletionSchema>;

// Per-metric aggregation guidance, derived from the single source of truth so
// the model is never taught a (metric, aggregation) pair the chart can't honour.
const AGG_GUIDANCE = (
  Object.entries(METRIC_AGGREGATIONS) as [string, string[]][]
)
  .map(([metric, aggs]) => `    - ${metric}: ${aggs.join(", ")}`)
  .join("\n");

const SYSTEM_PROMPT = `You translate a user's natural-language request into a chart specification for the Langfuse observations (events) view. Output must match the provided JSON schema exactly.

Fields:
- metric: what to measure. "count" = number of events; "latency" = duration in ms; "totalCost" = USD; "totalTokens" = token usage.
- aggregation: how to aggregate the metric. Choose ONLY an aggregation allowed for the chosen metric:
${AGG_GUIDANCE}
  Map natural words to these: "p95"→p95, "p99"→p99, "median"→p50, "average"/"mean"→avg, "total"→sum, "slowest"/"max"/"highest"→max, "fastest"/"min"/"lowest"→min. If the user asks for one the metric doesn't allow, pick the closest allowed aggregation.
- breakdown: split by one dimension, or "none". Options: model, name (the operation name), level, type, environment.
- chartType: use LINE_TIME_SERIES / AREA_TIME_SERIES / BAR_TIME_SERIES for trends "over time"; HORIZONTAL_BAR for ranking/comparing categories; PIE for a share/proportion/distribution; NUMBER for a single total value.
- timeGranularity: minute | hour | day (only matters for time-series charts; default "hour").

Rules: if the request implies a trend over time, pick a *_TIME_SERIES type. If it asks to compare or rank categories, use HORIZONTAL_BAR. If it asks for a single number, use NUMBER. Otherwise default to LINE_TIME_SERIES. Always pick a sensible breakdown ("none" if none is implied).`;

/**
 * Builds the inline system + user chat messages for the chart completion. Kept
 * pure (no LLM call) so it is unit-testable. Uses an inline prompt rather than a
 * managed remote prompt because the chart vocabulary is fixed and local to this
 * feature.
 */
export function buildChartCompletionMessages({
  prompt,
  currentDatetime,
}: {
  prompt: string;
  currentDatetime: string;
}): ChatMessage[] {
  return [
    {
      role: ChatMessageRole.System,
      content: `${SYSTEM_PROMPT}\n\nCurrent time: ${currentDatetime}.`,
      type: ChatMessageType.PublicAPICreated,
    },
    {
      role: ChatMessageRole.User,
      content: prompt,
      type: ChatMessageType.PublicAPICreated,
    },
  ];
}
