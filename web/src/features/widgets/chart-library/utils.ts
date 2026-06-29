import {
  type DataPoint,
  type FormatMetricOptions,
  type FormattedMetric,
  type LegendSummaryMode,
} from "./chart-props";
import { type DashboardWidgetChartType } from "@langfuse/shared/src/db";
import { compactNumberFormatter, numberFormatter } from "@/src/utils/numbers";

export const toFullMetricString = (metric: FormattedMetric): string =>
  `${metric.negative ? "-" : ""}${metric.prefix ?? ""}${metric.main}${metric.suffix ?? ""}`;

/**
 * Groups data by dimension to prepare it for time series breakdowns
 * @param data
 */
export const groupDataByTimeDimension = (data: DataPoint[]) => {
  // First, group by time_dimension
  const timeGroups = data.reduce(
    (acc: Record<string, Record<string, number>>, item: DataPoint) => {
      const time = item.time_dimension || "Unknown";
      if (!acc[time]) {
        acc[time] = {};
      }

      const dimension = item.dimension || "Unknown";
      acc[time][dimension] = item.metric as number;

      return acc;
    },
    {},
  );

  // Convert to array format for Recharts
  return Object.entries(timeGroups).map(([time, dimensions]) => ({
    time_dimension: time,
    ...dimensions,
  }));
};

export const getUniqueDimensions = (data: DataPoint[]) => {
  const uniqueDimensions = new Set<string>();
  data.forEach((item: DataPoint) => {
    if (item.dimension) {
      uniqueDimensions.add(item.dimension);
    }
  });
  return Array.from(uniqueDimensions);
};

/** Reduces a series' finite metric values (in time order) to a single summary number. */
const summarizeSeries = (
  values: number[],
  mode: Exclude<LegendSummaryMode, "none">,
): number | null => {
  if (values.length === 0) return null;

  switch (mode) {
    case "sum":
      return values.reduce((acc, value) => acc + value, 0);
    case "avg":
      return values.reduce((acc, value) => acc + value, 0) / values.length;
    case "last":
      return values[values.length - 1];
    case "median": {
      const sorted = [...values].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
    }
  }
};

/**
 * Computes a per-dimension summary value for use in chart legends, under the
 * given {@link LegendSummaryMode}:
 * - `"sum"`: additive total — for event counts, token totals, cost. Reconciles
 *   with the card's headline number.
 * - `"avg"` / `"median"`: central tendency — for non-additive metrics where a
 *   sum is meaningless (scores, latencies). NOTE: computed over the buckets the
 *   series actually carries; if the upstream pipeline pads missing buckets with
 *   real `0`s, the mean/median is pulled toward `0` (the LFE-10498 caveat). Pick
 *   the mode per metric with that in mind.
 * - `"last"`: the most recent bucket's value (array order is time-ascending) —
 *   a good fit for "current" gauges like a latency percentile.
 *
 * The null/0 handling is the crux of LFE-10498: a `0` is a REAL value, so a
 * series whose finite values reduce to `0` keeps its `0` summary. A series with
 * no real data point (no finite numeric metric anywhere) is reported as `null`
 * so the legend omits a misleading number rather than inventing one. Non-finite
 * values (NaN/Infinity) and the histogram tuple shape are ignored; rows without
 * a dimension are skipped.
 *
 * @returns a Map keyed by dimension; value is the numeric summary or `null`
 *   when the series has no data.
 */
export const getDimensionSummaries = (
  data: DataPoint[],
  mode: Exclude<LegendSummaryMode, "none"> = "sum",
): Map<string, number | null> => {
  // Collect finite metric values per dimension, preserving array (time) order
  // so `"last"` resolves to the most recent bucket.
  const valuesByDimension = new Map<string, number[]>();

  for (const item of data) {
    if (!item.dimension) continue;

    // Touch the key so a dimension that only ever carries non-finite values
    // (or the histogram tuple shape) still appears, summarized as `null`.
    if (!valuesByDimension.has(item.dimension)) {
      valuesByDimension.set(item.dimension, []);
    }

    const metric = item.metric;
    if (typeof metric === "number" && Number.isFinite(metric)) {
      valuesByDimension.get(item.dimension)!.push(metric);
    }
  }

  const summaries = new Map<string, number | null>();
  for (const [dimension, values] of valuesByDimension) {
    summaries.set(dimension, summarizeSeries(values, mode));
  }

  return summaries;
};

export const isTimeSeriesChart = (
  chartType: DashboardWidgetChartType,
): boolean => {
  switch (chartType) {
    case "LINE_TIME_SERIES":
    case "AREA_TIME_SERIES":
    case "BAR_TIME_SERIES":
      return true;
    case "HORIZONTAL_BAR":
    case "VERTICAL_BAR":
    case "PIE":
    case "HISTOGRAM":
    case "NUMBER":
    case "PIVOT_TABLE":
      return false;
    default:
      return false;
  }
};

// Used for a combination of YAxis styling workarounds as discussed in https://github.com/recharts/recharts/issues/2027#issuecomment-769674096.
export const formatAxisLabel = (label: string): string =>
  label.length > 13 ? label.slice(0, 13).concat("…") : label;

/**
 * Picks a recharts numeric x-axis `interval` (= ticks skipped between two shown
 * ticks) that yields UNIFORM gaps targeting ~`maxTicks` labels. We use this
 * instead of `interval="preserveStartEnd"` + `minTickGap`, whose width-dependent
 * collision dropping skips ticks unevenly (e.g. 6/9, 6/11, 6/13 vanish while
 * 6/1–6/8 stay), making tick density vary by chart width. (LFE-10549)
 */
export const getEvenTickInterval = (
  pointCount: number,
  maxTicks = 8,
): number =>
  pointCount <= maxTicks ? 0 : Math.ceil(pointCount / maxTicks) - 1;

/**
 * Maps chart types to their human-readable display names.
 */
export function getChartTypeDisplayName(
  chartType: DashboardWidgetChartType,
): string {
  switch (chartType) {
    case "LINE_TIME_SERIES":
      return "Line Chart (Time Series)";
    case "AREA_TIME_SERIES":
      return "Area Chart (Time Series)";
    case "BAR_TIME_SERIES":
      return "Bar Chart (Time Series)";
    case "HORIZONTAL_BAR":
      return "Horizontal Bar Chart (Total Value)";
    case "VERTICAL_BAR":
      return "Vertical Bar Chart (Total Value)";
    case "PIE":
      return "Pie Chart (Total Value)";
    case "NUMBER":
      return "Big Number (Total Value)";
    case "HISTOGRAM":
      return "Histogram (Total Value)";
    case "PIVOT_TABLE":
      return "Pivot Table (Total Value)";
    default:
      return "Unknown Chart Type";
  }
}

export function valueFormatter(
  value: number | string,
  unit?: string,
  compact?: boolean,
): string {
  if (typeof value === "string") {
    return value;
  }

  return toFullMetricString(
    formatMetric(value, {
      unit,
      style: compact ? "compact" : "full",
    }),
  );
}

const stripTrailingDecimalZeros = (numStr: string): string =>
  numStr.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");

const formatFixedMetric = (
  value: number,
  maxFractionDigits: number,
  suffix = "",
  maxCharacters?: number,
): FormattedMetric => {
  for (
    let fractionDigits = maxFractionDigits;
    fractionDigits >= 0;
    fractionDigits--
  ) {
    const main = stripTrailingDecimalZeros(value.toFixed(fractionDigits));
    const formatted = suffix ? { main, suffix } : { main };

    if (
      !maxCharacters ||
      toFullMetricString(formatted).length <= maxCharacters
    ) {
      return formatted;
    }
  }

  const main = Math.round(value).toString();
  return suffix ? { main, suffix } : { main };
};

const formatExponentialMetric = (
  value: number,
  maxCharacters?: number,
): FormattedMetric => {
  const main = value.toExponential(2);
  const formatted = { main };

  if (!maxCharacters || toFullMetricString(formatted).length <= maxCharacters) {
    return formatted;
  }

  for (let significantDigits = 2; significantDigits >= 1; significantDigits--) {
    const shortened = value.toExponential(significantDigits - 1);
    const shortenedFormatted = { main: shortened };
    if (toFullMetricString(shortenedFormatted).length <= maxCharacters) {
      return shortenedFormatted;
    }
  }

  return formatted;
};

const compactUnits = [
  [1e12, "T"],
  [1e9, "B"],
  [1e6, "M"],
  [1e3, "K"],
] as const;

const formatCompactMetric = (
  value: number,
  maxCharacters?: number,
): FormattedMetric => {
  for (let i = 0; i < compactUnits.length; i++) {
    const [divisor, suffix] = compactUnits[i];
    if (value < divisor) {
      continue;
    }

    const formatted = formatFixedMetric(
      value / divisor,
      3,
      suffix,
      maxCharacters,
    );

    if (Number(formatted.main) >= 1000 && i > 0) {
      const [nextDivisor, nextSuffix] = compactUnits[i - 1];
      return formatFixedMetric(
        value / nextDivisor,
        3,
        nextSuffix,
        maxCharacters,
      );
    }

    return formatted;
  }

  if (value >= 1) {
    return formatFixedMetric(value, 3, "", maxCharacters);
  }

  if (value >= 1e-3) {
    return formatFixedMetric(value, 6, "", maxCharacters);
  }

  return formatExponentialMetric(value, maxCharacters);
};

const durationDivisors = [1, 1_000, 60_000, 3_600_000, 86_400_000] as const;
const durationUnits = [
  "millisecond",
  "second",
  "minute",
  "hour",
  "day",
] as const;

const formatWithConstrainedDecimals = ({
  value,
  maxCharacters,
  maxFractionDigits,
  createFormatter,
}: {
  value: number;
  maxCharacters?: number;
  maxFractionDigits: number;
  createFormatter: (fractionDigits: number) => Intl.NumberFormat;
}): FormattedMetric => {
  let fallback: FormattedMetric | undefined;

  for (
    let fractionDigits = maxFractionDigits;
    fractionDigits >= 0;
    fractionDigits--
  ) {
    let prefix = "";
    let main = "";
    let suffix = "";

    for (const part of createFormatter(fractionDigits).formatToParts(value)) {
      switch (part.type) {
        case "currency":
          prefix += part.value;
          break;
        case "unit":
          suffix += part.value;
          break;
        case "literal":
          break;
        default:
          main += part.value;
      }
    }

    const formatted: FormattedMetric = {
      ...(prefix ? { prefix } : {}),
      main: main || `${prefix}${suffix}`,
      ...(suffix ? { suffix } : {}),
    };

    fallback = formatted;

    if (
      !maxCharacters ||
      toFullMetricString(formatted).length <= maxCharacters
    ) {
      return formatted;
    }
  }

  return fallback ?? { main: value.toString() };
};

/**
 * Formats a metric into structured parts for chart labels, axes, and tooltips.
 *
 * - `unit === "millisecond"` auto-scales across ms/s/min/h/d and can reduce
 *   fractional precision to satisfy `maxCharacters`.
 * - `unit === "USD"` formats with a currency prefix and can reduce fractional
 *   precision to satisfy `maxCharacters`.
 * - `style === "compact"` uses compact suffixes for large values (`K`, `M`,
 *   `B`, `T`), decimal formatting for `1e-3 <= |value| < 1`, and exponential
 *   notation below `1e-3`.
 * - `style === "full"` preserves more detail for non-zero sub-unit values by
 *   using compact decimal formatting for `1e-3 <= |value| < 1` and exponential
 *   notation below `1e-3`; otherwise it falls back to `numberFormatter`.
 *
 * `maxCharacters` is an optional space constraint that may reduce fractional
 * digits or exponential precision for either style.
 */
export function formatMetric(
  value: number,
  options: FormatMetricOptions,
): FormattedMetric {
  const { unit, style, maxCharacters } = options;

  const negative = value < 0;
  const absValue = Math.abs(value);

  const magnitudeMaxCharacters =
    negative && maxCharacters ? maxCharacters - 1 : maxCharacters;

  const applyNegative = (formatted: FormattedMetric): FormattedMetric =>
    negative ? { negative: true, ...formatted } : formatted;

  if (unit === "millisecond") {
    const tier = durationDivisors.reduce(
      (acc, divisor, i) => (absValue >= divisor ? i : acc),
      0,
    );

    const normalizedValue = absValue / durationDivisors[tier];

    return applyNegative(
      formatWithConstrainedDecimals({
        value: normalizedValue,
        maxCharacters: magnitudeMaxCharacters,
        maxFractionDigits: 2,
        createFormatter: (fractionDigits) =>
          new Intl.NumberFormat("en-US", {
            style: "unit",
            unit: durationUnits[tier],
            unitDisplay: "narrow",
            notation: "compact",
            minimumFractionDigits: 0,
            maximumFractionDigits: fractionDigits,
          }),
      }),
    );
  }

  if (unit === "USD") {
    const maxFractionDigits = value && absValue < 5 ? 6 : 2;

    return applyNegative(
      formatWithConstrainedDecimals({
        value: absValue,
        maxCharacters: magnitudeMaxCharacters,
        maxFractionDigits,
        createFormatter: (fractionDigits) =>
          new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            minimumFractionDigits: Math.min(2, fractionDigits),
            maximumFractionDigits: Math.max(0, fractionDigits),
          }),
      }),
    );
  }

  if (style === "compact") {
    if (value === 0) {
      return { main: "0" };
    }

    return applyNegative(formatCompactMetric(absValue, magnitudeMaxCharacters));
  }

  if (value !== 0 && absValue < 1e-3) {
    return applyNegative(
      formatExponentialMetric(absValue, magnitudeMaxCharacters),
    );
  }

  if (value !== 0 && absValue < 1) {
    if (maxCharacters) {
      return applyNegative(
        formatFixedMetric(absValue, 6, "", magnitudeMaxCharacters),
      );
    }

    return applyNegative({ main: compactNumberFormatter(absValue, 3) });
  }

  if (maxCharacters) {
    return applyNegative(
      formatFixedMetric(absValue, 2, "", magnitudeMaxCharacters),
    );
  }

  return applyNegative({ main: numberFormatter(absValue, 0, 2) });
}
