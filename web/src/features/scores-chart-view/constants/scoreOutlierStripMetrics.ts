import { numberFormatter } from "@/src/utils/numbers";
import {
  type ScoreOutlierAggKey,
  type ScoreOutlierMetricKey,
} from "@/src/features/scores-chart-view/types";

type ScoreOutlierAggregationDef = {
  /** The user-facing option key (currently 1:1 with the query aggregation). */
  key: ScoreOutlierAggKey;
  /** The executeQuery aggregation this option lowers to. */
  queryAggregation: "count" | "avg" | "min" | "max";
};

export type ScoreOutlierMetricDef = {
  shortLabel: string;
  /** First entry is the default. */
  aggregations: readonly ScoreOutlierAggregationDef[];
  /** The executeQuery measure name on the `scores-numeric` view. */
  measure: string;
  /** Raw result value -> plotted unit (identity for both current metrics). */
  fromRaw: (raw: number) => number;
  format: (value: number) => string;
  /** SVG bar / gridline color. */
  color: string;
};

/**
 * The metrics the scores outlier strip can plot — mirrors the observations
 * strip's `OUTLIER_STRIP_METRICS` (`@/src/features/events/components/outlier-strip`),
 * trimmed to the two measures the `scores-numeric` view exposes. `min`/`max`
 * are offered instead of the observations strip's percentiles: a p95 of a
 * handful of scores per bucket is rarely meaningful, while a bucket's
 * min/max value is.
 */
export const SCORE_OUTLIER_STRIP_METRICS: Record<
  ScoreOutlierMetricKey,
  ScoreOutlierMetricDef
> = {
  count: {
    shortLabel: "Count",
    measure: "count",
    aggregations: [{ key: "count", queryAggregation: "count" }],
    fromRaw: (raw) => raw,
    format: (value) => numberFormatter(value, 0),
    color: "hsl(var(--chart-4))",
  },
  value: {
    shortLabel: "Value",
    measure: "value",
    aggregations: [
      { key: "avg", queryAggregation: "avg" },
      { key: "min", queryAggregation: "min" },
      { key: "max", queryAggregation: "max" },
    ],
    fromRaw: (raw) => raw,
    format: (value) => numberFormatter(value, 2),
    color: "hsl(var(--chart-1))",
  },
};
