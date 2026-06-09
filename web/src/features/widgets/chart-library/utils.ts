import {
  type DataPoint,
  type FormatMetricOptions,
  type FormattedMetric,
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
